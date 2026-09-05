"""Collect public buyer/RFQ listing pages from configured B2B SourceSpecs.

The collector intentionally stays on public listing pages. It does not log in,
submit forms, reveal masked contacts, or bypass access controls. Each successful
response is snapshotted before parsing so every derived row is auditable.

Phase-0 Source Engine migration keeps the mature evidence-bound parser adapters
and moves listing/fetch configuration into Source Registry V4. This removes the
hard-coded LISTINGS table without changing downstream record/evidence contracts.
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

from http_util import read_capped
from parser_quality_v1_1 import extract_go4worldbusiness_card, extract_tradekey_card


USER_AGENT = "BuyerHunterDemo/1.0 (+public-data-research; contact: repository-owner)"
TRANSIENT = {429, 500, 502, 503, 504}
DATE_RE = re.compile(r"(?:Posted\s+on\s*:\s*)?(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})", re.I)
COUNTRY_RE = re.compile(r"Buyer\s+From\s+([A-Za-z][A-Za-z .'-]{1,60})", re.I)
QUANTITY_RE = re.compile(r"Quantity\s+Required\s*:\s*([^\r\n<]{1,100})", re.I)
INTENT_RE = re.compile(r"\b(?:buy|buyer|buying|wanted|need|require|requires|seeking|source|sourcing|rfq|quotation|order|import)\b", re.I)
SELLER_RE = re.compile(r"\b(?:we\s+(?:sell|supply|export|manufacture)|our\s+(?:factory|product)|supplier\s+of)\b", re.I)
SOURCE_SPEC_CONTRACT = "qianpulse_source_spec_v1"
DEFAULT_REGISTRY = Path(__file__).with_name("b2b_source_registry_v4.json")
DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024


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
            response = session.get(url, timeout=(7, 30), allow_redirects=True, stream=True)
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


def load_registry(registry_path: Path) -> dict:
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    if registry.get("source_spec_contract") != SOURCE_SPEC_CONTRACT:
        raise ValueError(f"unsupported source spec contract: {registry.get('source_spec_contract')!r}")
    return registry


def executable_source_codes(registry: dict) -> set[str]:
    return {
        source["code"]
        for source in registry.get("sources", [])
        if source.get("code")
        and (source.get("source_spec") or {}).get("runtime") == "PUBLIC_HTTP"
    }


def load_source_specs(
    registry_path: Path,
    *,
    selected_sources: set[str] | None = None,
    taxonomy: dict[str, dict] | None = None,
) -> list[dict]:
    """Load executable public SourceSpecs from Registry V4.

    Runtime validation is scoped to the selected sources. A draft or broken
    unselected SourceSpec therefore cannot stop a healthy source from running.
    Full-registry lint can still call this function without ``selected_sources``.
    """
    registry = load_registry(registry_path)
    listings: list[dict] = []

    for source in registry.get("sources", []):
        source_code = source.get("code")
        spec = source.get("source_spec")
        if not spec or spec.get("runtime") != "PUBLIC_HTTP":
            continue
        if selected_sources is not None and source_code not in selected_sources:
            continue
        if not source_code:
            raise ValueError("SourceSpec requires source code")
        if spec.get("contract") != SOURCE_SPEC_CONTRACT:
            raise ValueError(f"{source_code}: source spec contract mismatch")

        parser_adapter = spec.get("parser_adapter")
        if parser_adapter not in PARSERS:
            raise ValueError(f"{source_code}: unknown parser adapter {parser_adapter!r}")

        fetch_spec = spec.get("fetch") or {}
        if fetch_spec.get("method", "GET") != "GET":
            raise ValueError(f"{source_code}: public B2B runtime only supports GET")
        min_interval_seconds = float(fetch_spec.get("min_interval_seconds", 2.0))
        if min_interval_seconds < 0:
            raise ValueError(f"{source_code}: min_interval_seconds cannot be negative")
        max_response_bytes = int(fetch_spec.get("max_response_bytes", DEFAULT_MAX_RESPONSE_BYTES))
        if max_response_bytes <= 0:
            raise ValueError(f"{source_code}: max_response_bytes must be positive")
        save_raw_snapshot = bool(fetch_spec.get("save_raw_snapshot", True))

        policy = spec.get("policy") or {}
        forbidden = [name for name in ("login_required", "captcha_bypass", "paywall_bypass") if policy.get(name)]
        if forbidden:
            raise ValueError(f"{source_code}: forbidden access policy: {', '.join(forbidden)}")
        require_source_url = bool(policy.get("require_source_url", True))
        require_evidence = bool(policy.get("require_evidence", True))
        if not require_source_url or not require_evidence:
            raise ValueError(f"{source_code}: evidence/source-url requirements cannot be disabled")
        if require_evidence and not save_raw_snapshot:
            raise ValueError(f"{source_code}: require_evidence requires save_raw_snapshot=true")

        for listing in spec.get("listings", []):
            category = listing.get("category_code")
            url = listing.get("url")
            if not category or not url:
                raise ValueError(f"{source_code}: listing requires category_code and url")
            if taxonomy is not None and category not in taxonomy:
                raise ValueError(f"{source_code}: SourceSpec category not found in taxonomy: {category}")
            listings.append({
                "source_code": source_code,
                "category_code": category,
                "url": url,
                "parser_adapter": parser_adapter,
                "spec_version": spec.get("version", 1),
                "min_interval_seconds": min_interval_seconds,
                "max_response_bytes": max_response_bytes,
                "save_raw_snapshot": save_raw_snapshot,
                "require_evidence": require_evidence,
            })

    if not listings:
        scope = sorted(selected_sources) if selected_sources is not None else "registry"
        raise ValueError(f"no executable SourceSpecs in {registry_path} for {scope}")
    return listings


def read_response_body(response: requests.Response, listing: dict) -> tuple[bytes, bool]:
    """Read one response using the SourceSpec response-size contract."""
    with response:
        return read_capped(response, cap=listing["max_response_bytes"])


def save_raw_snapshot(raw_dir: Path, listing: dict, body: bytes, digest: str) -> Path | None:
    """Persist raw evidence according to SourceSpec policy."""
    if not listing["save_raw_snapshot"]:
        return None
    path = raw_dir / f"{listing['source_code']}_{listing['category_code']}_{digest[:12]}.html"
    path.write_bytes(body)
    return path


def parse_listing_payload(listing: dict, body: bytes) -> list[dict]:
    """Route a payload through the SourceSpec parser adapter."""
    return PARSERS[listing["parser_adapter"]](body, listing["url"])


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
    parser.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    parser.add_argument("--sources", nargs="*", help="Optional SourceSpec source codes")
    args = parser.parse_args()

    registry_path = Path(args.registry)
    taxonomy = load_taxonomy()
    registry = load_registry(registry_path)
    available_sources = sorted(executable_source_codes(registry))
    selected_sources = set(args.sources or available_sources)
    unknown_sources = sorted(selected_sources - set(available_sources))
    if unknown_sources:
        parser.error(f"unknown SourceSpec source(s): {', '.join(unknown_sources)}")

    listings = load_source_specs(
        registry_path,
        selected_sources=selected_sources,
        taxonomy=taxonomy,
    )

    delay = max(args.delay, 1.5)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = Path(__file__).with_name("data_b2b_public_v3") / run_id
    raw_dir = run_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"})
    probes: list[dict] = []
    records: list[dict] = []
    seen: set[str] = set()

    for listing in listings:
        source = listing["source_code"]
        category = listing["category_code"]
        url = listing["url"]
        parser_adapter = listing["parser_adapter"]
        observed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        response, attempts = fetch(session, url, args.retries)
        status = response.status_code if response is not None else None
        oversized = False
        body = b""
        if response is not None:
            body, oversized = read_response_body(response, listing)
        if oversized:
            body = b""
        digest = hashlib.sha256(body).hexdigest()
        snapshot_path = None
        parsed = []
        if status == 200 and body:
            snapshot_path = save_raw_snapshot(raw_dir, listing, body, digest)
            parsed = parse_listing_payload(listing, body)
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
            "oversized": oversized,
            "parsed_count": len(parsed),
            "candidate_count": accepted,
            "attempt_count": len(attempts),
            "attempts": attempts,
            "snapshot_sha256": digest if body else None,
            "observed_at": observed_at,
            "source_spec_contract": SOURCE_SPEC_CONTRACT,
            "source_spec_version": listing["spec_version"],
            "parser_adapter": parser_adapter,
            "max_response_bytes": listing["max_response_bytes"],
            "save_raw_snapshot": listing["save_raw_snapshot"],
        })
        print(f"{source} {category} http={status} parsed={len(parsed)} candidates={accepted}", flush=True)
        source_delay = max(delay, listing["min_interval_seconds"])
        time.sleep(source_delay + random.uniform(0.0, 0.35))

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
        "source_spec_contract": SOURCE_SPEC_CONTRACT,
        "registry": str(registry_path),
        "listing_count": len(listings),
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
