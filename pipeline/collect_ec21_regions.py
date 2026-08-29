"""Collect EC21 buying leads through public country/category listing pages.

The collector respects a delay, stores source snapshots, stops after repeated
blocks, and separates raw records from qualified buyer signals.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
from datetime import date, datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

import collect_ec21 as core
from http_util import read_capped


COUNTRIES = {
    "US": ("United States", "US"),
    "JP": ("Japan", "JAPAN"),
    "AT": ("Austria", "EUROPE"), "BE": ("Belgium", "EUROPE"),
    "BG": ("Bulgaria", "EUROPE"), "HR": ("Croatia", "EUROPE"),
    "CY": ("Cyprus", "EUROPE"), "CZ": ("Czech Republic", "EUROPE"),
    "DK": ("Denmark", "EUROPE"), "EE": ("Estonia", "EUROPE"),
    "FI": ("Finland", "EUROPE"), "FR": ("France", "EUROPE"),
    "DE": ("Germany", "EUROPE"), "GR": ("Greece", "EUROPE"),
    "HU": ("Hungary", "EUROPE"), "IE": ("Ireland", "EUROPE"),
    "IT": ("Italy", "EUROPE"), "LV": ("Latvia", "EUROPE"),
    "LT": ("Lithuania", "EUROPE"), "LU": ("Luxembourg", "EUROPE"),
    "MT": ("Malta", "EUROPE"), "NL": ("Netherlands", "EUROPE"),
    "PL": ("Poland", "EUROPE"), "PT": ("Portugal", "EUROPE"),
    "RO": ("Romania", "EUROPE"), "SK": ("Slovakia", "EUROPE"),
    "SI": ("Slovenia", "EUROPE"), "ES": ("Spain", "EUROPE"),
    "SE": ("Sweden", "EUROPE"), "GB": ("United Kingdom", "EUROPE"),
    "NO": ("Norway", "EUROPE"), "CH": ("Switzerland", "EUROPE"),
}
CATEGORY_SLUGS = {
    "MATCHA": ["matcha"],
    "BLUEBERRY": ["blueberry"],
    "ROSA_ROXBURGHII": ["rosa-roxburghii"],
    "CHILI": ["chili", "chilli"],
    "TEA": ["tea"],
}
ORIGIN_RESTRICTION = re.compile(r"\b(?:originally from|origin(?:ating)? from|made in)\s+(?:Korea|Japan)|\bKorean\s+(?:origin|product|food|tea|matcha|red pepper)", re.I)


def load_taxonomy() -> dict[str, dict]:
    payload = json.loads(Path(__file__).with_name("product_taxonomy_v1.json").read_text(encoding="utf-8"))
    return {item["code"]: item for item in payload["categories"]}


def product_matches(category: str, text: str, taxonomy: dict[str, dict]) -> bool:
    item = taxonomy[category]
    folded = text.casefold()
    if any(term.casefold() in folded for term in item.get("exclude_terms", [])):
        return False
    terms = list(item.get("exact_terms", []))
    if category == "TEA":
        terms.append("tea")
    return any(term.casefold() in folded for term in terms)


def qualify(record: dict, observed: date) -> tuple[str, str]:
    if record["record_kind"] != "DIRECT_BUY_REQUIREMENT":
        return "REJECT_SELLER_OR_UNCLEAR", "未检测到明确采购意图或含卖方表达"
    if not record["exact_product_match"]:
        return "REJECT_PRODUCT_MISMATCH", "品类只出现在噪声或排除语境"
    if record["age_days"] is None or record["age_days"] > 365:
        return "WATCHLIST_STALE", "发布日期超过365天"
    if record["origin_fit_gap"]:
        return "GAP_ORIGIN_REQUIREMENT", "需求限制韩国/日本原产，贵州产品需确认可替代性"
    if not record["buyer_identity_claim_raw"]:
        return "QUALIFIED_SIGNAL_NEEDS_IDENTITY", "需求、品类和时效合格，但买方身份仍需补全"
    return "QUALIFIED_SIGNAL", "需求、品类、时效和公开身份达到线索标准"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--countries", nargs="+", default=list(COUNTRIES))
    parser.add_argument("--delay", type=float, default=1.25)
    parser.add_argument("--max-consecutive-blocks", type=int, default=3)
    args = parser.parse_args()
    invalid = sorted(set(args.countries) - set(COUNTRIES))
    if invalid:
        raise SystemExit(f"Unsupported country codes: {', '.join(invalid)}")

    taxonomy = load_taxonomy()
    run = Path(__file__).with_name("data_ec21_regions") / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    raw_dir = run / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": core.USER_AGENT, "Accept-Language": "en-US,en;q=0.8"})
    observed_date = date.today()
    probes = []
    records = []
    seen = set()
    consecutive_blocks = 0
    stopped_early = False

    for country_code in args.countries:
        country_name, market_region = COUNTRIES[country_code]
        for category, slugs in CATEGORY_SLUGS.items():
            for slug in slugs:
                url = f"https://importer.ec21.com/{country_code}/{slug}.html"
                observed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
                try:
                    with session.get(url, timeout=(5, 25), stream=True) as response:
                        status = response.status_code
                        body, oversized = read_capped(response)
                    if oversized:
                        body = b""
                        error = "response_exceeds_2mb"
                    else:
                        error = None
                except requests.RequestException as exc:
                    status = None
                    body = b""
                    error = f"{type(exc).__name__}: {exc}"
                digest = hashlib.sha256(body).hexdigest()
                if body:
                    (raw_dir / f"{country_code}_{slug}_{digest[:12]}.html").write_bytes(body)
                if status in {403, 429}:
                    consecutive_blocks += 1
                else:
                    consecutive_blocks = 0
                page_count = 0
                if status == 200:
                    soup = BeautifulSoup(body, "html.parser")
                    for card in soup.select("li.listLs"):
                        title_node = card.select_one("h2.inlineTitle a[href]")
                        if not title_node:
                            continue
                        source_url = title_node.get("href")
                        dedupe_key = (country_code, source_url)
                        if dedupe_key in seen:
                            continue
                        seen.add(dedupe_key)
                        left = card.select_one("div.listLs_Lcon")
                        date_node = left.select_one("h2.inlineTitle + span") if left else None
                        description_node = left.select_one("p.item_txt") if left else None
                        title = core.clean(title_node)
                        description = core.clean(description_node)
                        text = f"{title} {description}"
                        published_raw = core.clean(date_node)
                        published = core.parse_date(published_raw)
                        published_date = date.fromisoformat(published) if published else None
                        age_days = (observed_date - published_date).days if published_date else None
                        record = {
                            "source_code": "ec21",
                            "market_region": market_region,
                            "target_country_code": country_code,
                            "buyer_country_code": country_code,
                            "buyer_country_raw": country_name,
                            "category_code": category,
                            "query_slug": slug,
                            "title": title,
                            "description_raw": description,
                            "buyer_identity_claim_raw": core.extract_identity_claim(description),
                            "published_at_raw": published_raw,
                            "published_at": published,
                            "age_days": age_days,
                            "record_kind": "DIRECT_BUY_REQUIREMENT" if core.BUY_INTENT.search(text) and not core.SELL_INTENT.search(text) else "REJECTED_SELLER_OR_UNCLEAR",
                            "exact_product_match": product_matches(category, text, taxonomy),
                            "origin_fit_gap": bool(ORIGIN_RESTRICTION.search(text)),
                            "contact_gate": "premium_membership_or_login",
                            "source_url": source_url,
                            "listing_url": url,
                            "verification_status": "UNVERIFIED_MARKETPLACE_POST",
                            "observed_at": observed_at,
                            "snapshot_sha256": digest,
                            "data_mode": "LIVE",
                        }
                        decision, reason = qualify(record, observed_date)
                        record["qualification_status"] = decision
                        record["qualification_reason_zh"] = reason
                        records.append(record)
                        page_count += 1
                probes.append({
                    "source_code": "ec21",
                    "market_region": market_region,
                    "target_country_code": country_code,
                    "category_code": category,
                    "url": url,
                    "http_status": status,
                    "record_count": page_count,
                    "snapshot_sha256": digest,
                    "observed_at": observed_at,
                    "error": error,
                })
                print(f"{country_code} {category} {slug} http={status} records={page_count}", flush=True)
                if consecutive_blocks >= args.max_consecutive_blocks:
                    stopped_early = True
                    print("Stopping after repeated access blocks; no bypass attempted.", flush=True)
                    break
                time.sleep(max(args.delay, 1.0))
            if stopped_early:
                break
        if stopped_early:
            break

    run.mkdir(parents=True, exist_ok=True)
    (run / "probe_results.json").write_text(json.dumps(probes, ensure_ascii=False, indent=2), encoding="utf-8")
    columns = list(records[0].keys()) if records else []
    qualified_statuses = {"QUALIFIED_SIGNAL", "QUALIFIED_SIGNAL_NEEDS_IDENTITY"}
    outputs = (
        ("EC21_美国日本欧洲_全量.csv", records),
        ("EC21_美国日本欧洲_精准需求.csv", [row for row in records if row["qualification_status"] in qualified_statuses]),
    )
    for filename, rows in outputs:
        with (run / filename).open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
    summary = {
        "requested_countries": args.countries,
        "stopped_early": stopped_early,
        "probe_count": len(probes),
        "raw_record_count": len(records),
        "qualified_signal_count": sum(row["qualification_status"] in qualified_statuses for row in records),
        "identified_buyer_count": sum(bool(row["buyer_identity_claim_raw"]) for row in records),
        "counts_by_region": {
            region: {
                "raw": sum(row["market_region"] == region for row in records),
                "qualified": sum(row["market_region"] == region and row["qualification_status"] in qualified_statuses for row in records),
            }
            for region in ("US", "JAPAN", "EUROPE")
        },
    }
    (run / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
