"""Collect Alibaba.com RFQs visible on the unauthenticated public market page.

The official authorized API remains preferred. This collector is the fallback
for public evidence only: it does not log in, quote, reveal gated contacts,
solve CAPTCHAs, or bypass access controls.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html as html_lib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus, urljoin

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://sourcing.alibaba.com"
SEARCH_URL = f"{BASE_URL}/rfq/onepage/rfq_search_list.htm"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143 Safari/537.36"
SEARCHES = {
    "MATCHA": ["matcha"],
    "BLUEBERRY": ["blueberry", "blueberries"],
    "ROSA_ROXBURGHII": ["rosa roxburghii", "cili fruit"],
    "CHILI": ["chili pepper", "chilli pepper", "paprika"],
    "TEA": ["tea leaves", "green tea", "black tea", "oolong tea"],
}
PUSH_RE = re.compile(
    r'window\.PAGE_DATA\["relate"\]\.data\.push\(\{(.*?)\}\);',
    re.DOTALL,
)
ACCESSORY_RE = re.compile(
    r"\b(?:cup|cups|bottle|bottles|can|cans|tin|jar|whisk|tool|tools|bowl|spoon|"
    r"scoop|tea set|matcha set|gift set|candle|label|labels|box|boxes|container|containers|canister|disposable|"
    r"plastic|glass|bamboo|bambou|bouteille|dose|dosen|becher|taza|lata|packaging machine)\b",
    re.IGNORECASE,
)
MATCHA_PRODUCT_RE = re.compile(
    r"\b(?:matcha powder|matcha tea|green tea powder|organic matcha|ceremonial matcha|"
    r"culinary matcha|instant matcha|instant tea)\b",
    re.IGNORECASE,
)
MATCHA_PRODUCT_PROOF_RE = re.compile(
    r"\b(?:product type\s*:\s*green tea|ingredients?\s*:\s*green tea|"
    r"type\s*:\s*instant tea)\b",
    re.IGNORECASE,
)
NON_PRODUCT_RE = re.compile(
    r"\b(?:matcha flavored protein|protein powder|body scrub|skincare|cosmetic|soap|"
    r"shampoo|fragrance|candle|matcha color)\b",
    re.IGNORECASE,
)
GENERIC_PRODUCT_EXCLUSIONS = {
    "BLUEBERRY": re.compile(
        r"\b(?:greenhouse|poly tunnel|toy|squishy|headlight|vending machine|packing machine|"
        r"dehydrator|chewing gum|face mask|cosmetic|dog chew|patch|supplement|headlights?)\b",
        re.IGNORECASE,
    ),
    "CHILI": re.compile(
        r"\b(?:machine|bottle|press|slicer|grinder|production line|filling|sealing|mixer|"
        r"keychain|plush|toy)\b",
        re.IGNORECASE,
    ),
    "TEA": re.compile(
        r"\b(?:machine|production line|tea picker|foot patch|sleeping patch|acne|cosmetic|"
        r"capsule machine|tea bags making|body scrub|skincare|exfoliator|deep cleansing)\b",
        re.IGNORECASE,
    ),
}


def decode_js_string(value: str | None) -> str | None:
    if value is None:
        return None
    value = re.sub(r"\\x([0-9a-fA-F]{2})", lambda m: chr(int(m.group(1), 16)), value)
    value = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), value)
    value = value.replace(r"\/", "/").replace(r'\"', '"').replace(r"\'", "'")
    value = value.replace("\\\\", "\\")
    return html_lib.unescape(value)


def clean_markup(value: str | None) -> str | None:
    decoded = decode_js_string(value)
    if decoded is None:
        return None
    return " ".join(BeautifulSoup(decoded, "html.parser").get_text(" ", strip=True).split())


def string_field(block: str, name: str) -> str | None:
    pattern = re.compile(
        rf"\b{re.escape(name)}\s*:\s*(?:\"((?:\\.|[^\"])*)\"|'((?:\\.|[^'])*)')",
        re.DOTALL,
    )
    match = pattern.search(block)
    if not match:
        return None
    return decode_js_string(match.group(1) if match.group(1) is not None else match.group(2))


def integer_field(block: str, name: str) -> int | None:
    direct = string_field(block, name)
    if direct and direct.strip().isdigit():
        return int(direct.strip())
    match = re.search(rf"\b{re.escape(name)}\s*:\s*parseInt\(\"(\d*)\"", block)
    if match and match.group(1):
        return int(match.group(1))
    match = re.search(rf"\b{re.escape(name)}\s*:\s*(\d+)", block)
    return int(match.group(1)) if match else None


def parse_listing(page: bytes, listing_url: str) -> list[dict[str, Any]]:
    text = page.decode("utf-8", errors="replace")
    rows: list[dict[str, Any]] = []
    for block in PUSH_RE.findall(text):
        rfq_id = string_field(block, "rfqId") or string_field(block, "id")
        subject = clean_markup(string_field(block, "subject"))
        if not rfq_id or not subject:
            continue
        raw_url = string_field(block, "url") or ""
        rows.append({
            "rfq_id": rfq_id,
            "encrypted_rfq_id": string_field(block, "enrRfqId"),
            "title": subject,
            "description_raw": clean_markup(string_field(block, "description")),
            "buyer_name_raw": clean_markup(string_field(block, "buyerName")),
            "buyer_country_raw": clean_markup(string_field(block, "country")),
            "buyer_country_code": string_field(block, "countrySimple"),
            "quantity_raw": string_field(block, "quantity"),
            "quantity_unit_raw": clean_markup(string_field(block, "quantityUnit")),
            "published_at_raw": clean_markup(string_field(block, "openTimeStr")),
            "quotes_left": integer_field(block, "rfqLeftCount"),
            "source_url": urljoin(listing_url, raw_url),
        })
    return rows


def product_relevance(category: str, title: str, description: str) -> tuple[bool, str | None]:
    text = f"{title} {description}".casefold()
    if category == "MATCHA":
        if "matcha" not in text:
            return False, "missing_matcha"
        if NON_PRODUCT_RE.search(text):
            return False, "matcha_non_food_product"
        if ACCESSORY_RE.search(title) and not MATCHA_PRODUCT_PROOF_RE.search(description):
            return False, "matcha_accessory_or_packaging"
        if not MATCHA_PRODUCT_RE.search(text):
            return False, "missing_matcha_product_form"
        return True, None
    terms = {
        "BLUEBERRY": ("blueberry", "blueberries"),
        "ROSA_ROXBURGHII": ("rosa roxburghii", "cili fruit", "chestnut rose fruit"),
        "CHILI": ("chili pepper", "chilli pepper", "red chili", "red chilli", "paprika", "capsicum"),
        "TEA": ("tea leaves", "green tea", "black tea", "white tea", "oolong tea", "tea powder", "tea extract"),
    }[category]
    exclusions = {
        "BLUEBERRY": ("vape", "gloves", "balloon", "shoes", "fragrance"),
        "ROSA_ROXBURGHII": ("rose plant", "rose seed", "ornamental rose", "rose flower"),
        "CHILI": ("pepper spray", "pepper gun", "software"),
        "TEA": ("tea set", "tea kettle", "tea table", "tea tree oil", "teacher", "teaching"),
    }[category]
    title_text = title.casefold()
    if not any(term in title_text for term in terms):
        return False, "category_term_missing_from_title"
    if any(term in text for term in exclusions) or GENERIC_PRODUCT_EXCLUSIONS[category].search(title):
        return False, "excluded_non_product"
    return True, None


def fetch(session: requests.Session, url: str, retries: int = 2) -> tuple[requests.Response | None, list[dict]]:
    attempts: list[dict] = []
    response: requests.Response | None = None
    for attempt in range(1, retries + 2):
        started = time.monotonic()
        try:
            response = session.get(url, timeout=(7, 30), allow_redirects=True)
            attempts.append({
                "attempt": attempt,
                "http_status": response.status_code,
                "elapsed_ms": round((time.monotonic() - started) * 1000),
                "error": None,
            })
            if response.status_code not in {429, 500, 502, 503, 504}:
                break
        except requests.RequestException as exc:
            attempts.append({
                "attempt": attempt,
                "http_status": None,
                "elapsed_ms": round((time.monotonic() - started) * 1000),
                "error": f"{type(exc).__name__}: {exc}",
            })
        if attempt <= retries:
            time.sleep(2 ** (attempt - 1))
    return response, attempts


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    columns = [
        "source_code", "category_code", "search_term", "rfq_id", "encrypted_rfq_id",
        "title", "description_raw", "buyer_name_raw", "buyer_country_raw",
        "buyer_country_code", "quantity_raw", "quantity_unit_raw", "published_at_raw",
        "quotes_left", "source_url", "listing_url", "product_relevant",
        "rejection_reason", "qualification_status", "contact_gate", "observed_at",
        "snapshot_sha256", "snapshot_path", "data_mode", "verification_status",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect Alibaba public RFQ market pages")
    parser.add_argument("--categories", nargs="*", choices=sorted(SEARCHES), default=sorted(SEARCHES))
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--retries", type=int, default=2)
    args = parser.parse_args()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = Path(__file__).with_name("data_alibaba_public") / run_id
    raw_dir = run_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"})
    records: list[dict[str, Any]] = []
    probes: list[dict[str, Any]] = []
    seen: set[str] = set()

    for category in args.categories:
        for term in SEARCHES[category]:
            listing_url = f"{SEARCH_URL}?searchText={quote_plus(term)}&recently=Y"
            observed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            response, attempts = fetch(session, listing_url, args.retries)
            status = response.status_code if response is not None else None
            body = response.content if response is not None else b""
            digest = hashlib.sha256(body).hexdigest()
            snapshot_path: Path | None = None
            parsed: list[dict[str, Any]] = []
            if status == 200 and body:
                safe_term = term.replace(" ", "-")
                snapshot_path = raw_dir / f"{category}_{safe_term}_{digest[:12]}.html"
                snapshot_path.write_bytes(body)
                parsed = parse_listing(body, listing_url)
            accepted = 0
            for row in parsed:
                if row["rfq_id"] in seen:
                    continue
                seen.add(row["rfq_id"])
                relevant, reason = product_relevance(
                    category, row["title"], row["description_raw"] or "",
                )
                row.update({
                    "source_code": "alibaba_rfq",
                    "category_code": category,
                    "search_term": term,
                    "listing_url": listing_url,
                    "product_relevant": relevant,
                    "rejection_reason": reason,
                    "qualification_status": "CANDIDATE_NEEDS_CLEANING" if relevant else "REJECTED_AT_INGEST",
                    "contact_gate": "login_required_to_quote",
                    "observed_at": observed_at,
                    "snapshot_sha256": digest,
                    "snapshot_path": str(snapshot_path) if snapshot_path else None,
                    "data_mode": "LIVE_PUBLIC",
                    "verification_status": "PUBLIC_ALIBABA_RFQ",
                })
                records.append(row)
                accepted += int(relevant)
            probes.append({
                "category_code": category,
                "search_term": term,
                "listing_url": listing_url,
                "http_status": status,
                "bytes": len(body),
                "parsed_count": len(parsed),
                "candidate_count": accepted,
                "attempts": attempts,
                "snapshot_sha256": digest if body else None,
            })
            print(f"alibaba {category} {term} http={status} parsed={len(parsed)} candidates={accepted}")
            if status in (401, 403, 429):
                break
            time.sleep(max(1.5, args.delay))

    write_csv(run_dir / "Alibaba_RFQ_公开页_全量.csv", records)
    candidates = [row for row in records if row["qualification_status"] == "CANDIDATE_NEEDS_CLEANING"]
    write_csv(run_dir / "Alibaba_RFQ_公开页_待清洗候选.csv", candidates)
    (run_dir / "probe_results.json").write_text(
        json.dumps(probes, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    summary = {
        "run_id": run_id,
        "request_count": len(probes),
        "successful_request_count": sum(item["http_status"] == 200 for item in probes),
        "raw_record_count": len(records),
        "candidate_count": len(candidates),
        "unique_rfq_count": len(seen),
        "access_mode": "PUBLIC_BROWSER_PAGE",
        "quote_access": "LOGIN_REQUIRED",
    }
    (run_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
