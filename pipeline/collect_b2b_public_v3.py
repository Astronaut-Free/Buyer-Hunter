"""Collect public buyer/RFQ listing pages from two additional B2B channels.

The collector intentionally stays on public listing pages. It does not log in,
submit forms, reveal masked contacts, or bypass access controls. Each successful
response is snapshotted before parsing so every derived row is auditable.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from parser_quality_v1_1 import extract_go4worldbusiness_card, extract_tradekey_card


USER_AGENT = "BuyerHunterDemo/1.0 (+public-data-research; contact: repository-owner)"
TRANSIENT = {429, 500, 502, 503, 504}
DATE_RE = re.compile(r"(?:Posted\s+on\s*:\s*)?(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})", re.I)
COUNTRY_RE = re.compile(r"Buyer\s+From\s+([A-Za-z][A-Za-z .'-]{1,60})", re.I)
QUANTITY_RE = re.compile(r"Quantity\s+Required\s*:\s*([^\r\n<]{1,100})", re.I)
INTENT_RE = re.compile(r"\b(?:buy|buyer|buying|wanted|need|require|requires|seeking|source|sourcing|rfq|quotation|order|import)\b", re.I)
SELLER_RE = re.compile(r"\b(?:we\s+(?:sell|supply|export|manufacture)|our\s+(?:factory|product)|supplier\s+of)\b", re.I)

LISTINGS = [
    ("tradekey", "MATCHA", "https://www.tradekey.com/matcha-buyer/"),
    ("tradekey", "BLUEBERRY", "https://www.tradekey.com/blueberry-buyer/"),
    ("tradekey", "CHILI", "https://www.tradekey.com/chili-buyer/"),
    ("tradekey", "TEA", "https://www.tradekey.com/tea-buyer/"),
    ("go4worldbusiness", "MATCHA", "https://www.go4worldbusiness.com/buyers/matcha.html"),
    ("go4worldbusiness", "BLUEBERRY", "https://www.go4worldbusiness.com/buyers/blueberries.html"),
    ("go4worldbusiness", "ROSA_ROXBURGHII", "https://www.go4worldbusiness.com/buyers/rosa-roxburghii.html"),
    ("go4worldbusiness", "CHILI", "https://www.go4worldbusiness.com/buyers/chili.html"),
    ("go4worldbusiness", "TEA", "https://www.go4worldbusiness.com/buyers/tea.html"),
]


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def load_taxonomy() -> dict[str, dict]:
    path = Path(__file__).with_name("product_taxonomy_v1.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    return {item["code"]: item for item in data["categories"]}


def exact_product_match(category: str, text: str, taxonomy: dict[str, dict]) -> bool:
    folded = text.casefold()
    item = taxonomy[category]
    if any(term.casefold() in folded for term in item.get("exclude_terms", [])):
        return False
    terms = list(item.get("exact_terms", []))
    if category == "TEA":
        terms.extend([" tea ", "tea buyer", "tea leaves"])
    return any(term.casefold() in folded for term in terms)


def fetch(session: requests.Session, url: str, retries: int) -> tuple[requests.Response | None, list[dict]]:
    attempts = []
    for attempt in range(1, retries + 2):
        started = time.monotonic()
        try:
            response = session.get(url, timeout=(7, 30), allow_redirects=True)
            attempts.append({
                "attempt": attempt,
                "status": response.status_code,
                "elapsed_ms": round((time.monotonic() - started) * 1000),
                "error": None,
            })
            if response.status_code not in TRANSIENT:
                return response, attempts
        except requests.RequestException as exc:
            response = None
            attempts.append({
                "attempt": attempt,
                "status": None,
                "elapsed_ms": round((time.monotonic() - started) * 1000),
                "error": f"{type(exc).__name__}: {exc}",
            })
        if attempt <= retries:
            time.sleep((2 ** (attempt - 1)) + random.uniform(0.1, 0.5))
    return response, attempts


def parse_tradekey(html: bytes, listing_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    for card in soup.select("div.cwrap"):
        anchor = card.select_one('h2.search-title a[href*="/buyoffer/"]')
        if not anchor:
            continue
        text = clean_text(card.get_text(" ", strip=True))
        fields = extract_tradekey_card(card)
        rows.append({
            "source_url": clean_text(anchor.get("href", "")),
            "listing_url": listing_url,
            "title": clean_text(anchor.get_text(" ", strip=True)),
            "description_raw": text[:4000],
            "contact_gate": "platform_login_or_membership",
            **fields,
        })
    return rows


def parse_go4worldbusiness(html: bytes, listing_url: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    for card in soup.select("div.search-results"):
        anchor = card.select_one('a[href*="/buylead/view/"]')
        if not anchor:
            continue
        text = clean_text(card.get_text(" ", strip=True))
        fields = extract_go4worldbusiness_card(card)
        rows.append({
            "source_url": urljoin(listing_url, anchor.get("href", "")),
            "listing_url": listing_url,
            "title": clean_text(anchor.get_text(" ", strip=True)),
            "description_raw": text[:4000],
            "contact_gate": "platform_login_or_membership",
            **fields,
        })
    return rows


PARSERS = {"tradekey": parse_tradekey, "go4worldbusiness": parse_go4worldbusiness}


def parse_date(raw: str | None) -> str | None:
    if not raw:
        return None
    for pattern in ("%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(raw, pattern).date().isoformat()
        except ValueError:
            pass
    return None


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--sources", nargs="*", choices=sorted(PARSERS), default=sorted(PARSERS))
    args = parser.parse_args()
    delay = max(args.delay, 1.5)
    taxonomy = load_taxonomy()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = Path(__file__).with_name("data_b2b_public_v3") / run_id
    raw_dir = run_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"})
    probes: list[dict] = []
    records: list[dict] = []
    seen: set[str] = set()

    for source, category, url in LISTINGS:
        if source not in args.sources:
            continue
        observed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        response, attempts = fetch(session, url, args.retries)
        status = response.status_code if response is not None else None
        body = response.content if response is not None else b""
        digest = hashlib.sha256(body).hexdigest()
        snapshot_path = None
        parsed = []
        if status == 200 and body:
            snapshot_path = raw_dir / f"{source}_{category}_{digest[:12]}.html"
            snapshot_path.write_bytes(body)
            parsed = PARSERS[source](body, url)
        accepted = 0
        for row in parsed:
            canonical_url = row["source_url"].strip()
            if not canonical_url or canonical_url in seen:
                continue
            seen.add(canonical_url)
            combined = f"{row['title']} {row['description_raw']}"
            product_ok = exact_product_match(category, combined, taxonomy)
            demand_ok = bool(INTENT_RE.search(combined)) and not bool(SELLER_RE.search(combined))
            row.update({
                "source_code": source,
                "category_code": category,
                "record_kind": "DIRECT_BUY_REQUIREMENT" if demand_ok else "REJECTED_SELLER_OR_UNCLEAR",
                "exact_product_match": product_ok,
                "published_at": row.get("published_at") or parse_date(row["published_at_raw"]),
                "observed_at": observed_at,
                "snapshot_sha256": digest,
                "snapshot_path": str(snapshot_path) if snapshot_path else None,
                "data_mode": "LIVE",
                "verification_status": "UNVERIFIED_MARKETPLACE_POST",
                "qualification_status": "CANDIDATE_NEEDS_CLEANING" if product_ok and demand_ok else "REJECTED_AT_INGEST",
            })
            records.append(row)
            accepted += int(product_ok and demand_ok)
        probes.append({
            "source_code": source,
            "category_code": category,
            "listing_url": url,
            "http_status": status,
            "bytes": len(body),
            "parsed_count": len(parsed),
            "candidate_count": accepted,
            "attempt_count": len(attempts),
            "attempts": attempts,
            "snapshot_sha256": digest if body else None,
            "observed_at": observed_at,
        })
        print(f"{source} {category} http={status} parsed={len(parsed)} candidates={accepted}", flush=True)
        time.sleep(delay + random.uniform(0.0, 0.35))

    columns = [
        "source_code", "category_code", "record_kind", "exact_product_match",
        "qualification_status", "title", "description_raw", "buyer_name_raw", "buyer_name_span",
        "contact_person_raw", "contact_person_span", "buyer_country_raw", "buyer_country_span",
        "quantity_raw", "quantity_span", "published_at_raw", "published_at", "published_at_span",
        "contact_gate", "source_url", "listing_url", "verification_status",
        "observed_at", "snapshot_sha256", "snapshot_path", "data_mode",
    ]
    write_csv(run_dir / "B2B公开渠道_全量.csv", records, columns)
    candidates = [r for r in records if r["qualification_status"] == "CANDIDATE_NEEDS_CLEANING"]
    write_csv(run_dir / "B2B公开渠道_待清洗候选.csv", candidates, columns)
    (run_dir / "probe_results.json").write_text(json.dumps(probes, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = {
        "run_id": run_id,
        "listing_count": len(probes),
        "successful_listing_count": sum(p["http_status"] == 200 for p in probes),
        "raw_record_count": len(records),
        "candidate_count": len(candidates),
        "unique_source_url_count": len(seen),
        "retry_count": sum(max(0, p["attempt_count"] - 1) for p in probes),
        "outputs": ["B2B公开渠道_全量.csv", "B2B公开渠道_待清洗候选.csv", "probe_results.json"],
    }
    (run_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
