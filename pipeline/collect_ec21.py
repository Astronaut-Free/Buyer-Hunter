"""Collect public EC21 buying-lead listings for the five Buyer Hunter categories."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup


SOURCES = {
    "MATCHA": ["matcha"],
    "BLUEBERRY": ["blueberry"],
    "ROSA_ROXBURGHII": ["rosa-roxburghii"],
    "CHILI": ["chili", "chilli"],
    "TEA": ["tea"],
}
USER_AGENT = "BuyerHunterDemo/0.1 (+public-source research; hackathon demo)"
BUY_INTENT = re.compile(r"\b(we buy|want to buy|looking for|searching for|seeking|interested in|purchase|import|need|require)\b", re.I)
SELL_INTENT = re.compile(r"\b(we sell|for sale|we export|i am an exporter|able to supply)\b", re.I)


def clean(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip() if node else ""


def parse_date(value: str) -> str | None:
    try:
        return datetime.strptime(value, "%d %b, %Y").date().isoformat()
    except ValueError:
        return None


def extract_identity_claim(value: str) -> str | None:
    for pattern in (
        r"my name is\s+([^.,;]{2,80})",
        r"(?:CEO|manager|director) of\s+([^.,;]{2,100})",
        r"(?:our|my) company\s+(?:is|,)?\s*([^.,;]{2,100})",
    ):
        found = re.search(pattern, value, re.I)
        if found:
            return found.group(1).strip()
    return None


def main() -> int:
    run = Path(__file__).with_name("data_ec21") / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    raw = run / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"})
    records = []
    probes = []
    seen = set()
    for category, slugs in SOURCES.items():
        for slug in slugs:
            url = f"https://importer.ec21.com/{slug}.html"
            observed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            response = session.get(url, timeout=(5, 25))
            digest = hashlib.sha256(response.content).hexdigest()
            (raw / f"{slug}_{digest[:12]}.html").write_bytes(response.content)
            page_count = 0
            if response.ok:
                soup = BeautifulSoup(response.content, "html.parser")
                for card in soup.select("li.listLs"):
                    title_node = card.select_one("h2.inlineTitle a[href]")
                    if not title_node:
                        continue
                    source_url = title_node.get("href")
                    if source_url in seen:
                        continue
                    seen.add(source_url)
                    left = card.select_one("div.listLs_Lcon")
                    date_node = left.select_one("h2.inlineTitle + span") if left else None
                    description_node = left.select_one("p.item_txt") if left else None
                    country_node = card.select_one("div.buyerCoun")
                    title = clean(title_node)
                    description = clean(description_node)
                    combined = f"{title} {description}"
                    country = clean(country_node).removesuffix("Contact Now").strip()
                    published_raw = clean(date_node)
                    buyer_intent = bool(BUY_INTENT.search(combined)) and not bool(SELL_INTENT.search(combined))
                    records.append({
                        "source_code": "ec21",
                        "category_code": category,
                        "query_slug": slug,
                        "record_kind": "DIRECT_BUY_REQUIREMENT" if buyer_intent else "REJECTED_SELLER_OR_UNCLEAR",
                        "title": title,
                        "description_raw": description,
                        "buyer_country_raw": country,
                        "buyer_country_code": "US" if country == "United States" else None,
                        "buyer_identity_claim_raw": extract_identity_claim(description),
                        "published_at_raw": published_raw,
                        "published_at": parse_date(published_raw),
                        "contact_gate": "premium_membership_or_login",
                        "source_url": source_url,
                        "listing_url": url,
                        "verification_status": "UNVERIFIED_MARKETPLACE_POST",
                        "observed_at": observed_at,
                        "snapshot_sha256": digest,
                        "data_mode": "LIVE",
                    })
                    page_count += 1
            probes.append({
                "source_code": "ec21",
                "category_code": category,
                "url": url,
                "http_status": response.status_code,
                "record_count": page_count,
                "snapshot_sha256": digest,
                "observed_at": observed_at,
            })
            print(f"ec21 category={category} slug={slug} http={response.status_code} records={page_count}")
            time.sleep(2)

    run.mkdir(parents=True, exist_ok=True)
    (run / "probe_results.json").write_text(json.dumps(probes, ensure_ascii=False, indent=2), encoding="utf-8")
    with (run / "records.jsonl").open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    columns = list(records[0].keys()) if records else []
    for filename, rows in (
        ("EC21_五品类全量.csv", records),
        ("EC21_美国买家候选.csv", [row for row in records if row["buyer_country_code"] == "US" and row["record_kind"] == "DIRECT_BUY_REQUIREMENT"]),
    ):
        with (run / filename).open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
    summary = {
        "total": len(records),
        "direct_buy_requirements": sum(row["record_kind"] == "DIRECT_BUY_REQUIREMENT" for row in records),
        "us_direct_candidates": sum(row["buyer_country_code"] == "US" and row["record_kind"] == "DIRECT_BUY_REQUIREMENT" for row in records),
        "counts_by_category": {category: sum(row["category_code"] == category for row in records) for category in SOURCES},
    }
    (run / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
