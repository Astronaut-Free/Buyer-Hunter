"""Normalize buyer signals and apply the PRD v1 four-dimension truth rules.

This module is deterministic: missing values stay null and no LLM may invent a
buyer, quantity, date, specification, or contact detail.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from parser_quality_v1_1 import product_matches, repair_cleaning_input, validate_quantity


BUY_ACTION = re.compile(r"\b(?:buy|buying|buyer|wanted|need|require|requires|seeking|source|sourcing|rfq|quotation|order|import)\b", re.I)
SPEC = re.compile(r"\b(?:grade|origin|harvest|moisture|organic|certificate|certification|brix|iqf|pesticide|residue|pack(?:age|ing)?|shelf\s*life|hs\s*code|specification|specs?|mesh|purity)\b", re.I)
QUANTITY = re.compile(r"\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|kilograms?|g|grams?|mt|tons?|tonnes?|lb|lbs|pounds?|containers?|cartons?|bags?|cases?|units?)\b|\b(?:monthly|weekly|annual|annually|per\s+month|recurring)\b", re.I)
DESTINATION = re.compile(r"\b(?:destination|destination\s+port|ship(?:ping)?\s+to|deliver(?:y|ed)?\s+to|cif|fob|cfr|dap|ddp|exw)\b", re.I)
DOMAIN = re.compile(r"\b(?:https?://)?(?:www\.)?([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\b", re.I)
REGISTRATION = re.compile(r"\b(?:registration|company|business|tax|vat)\s*(?:no\.?|number|id)\s*[:#]?\s*([A-Z0-9-]{5,})\b", re.I)
EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE = re.compile(r"(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)")
COMPANY_MARKERS = re.compile(r"\b(?:llc|ltd|limited|inc|corp|corporation|company|co\.|gmbh|sarl|s\.a\.|plc|bv|oy|ab|pte)\b", re.I)

COUNTRY_TO_CODE = {
    "united states": "US", "usa": "US", "u.s.a.": "US",
    "united kingdom": "GB", "uk": "GB", "japan": "JP", "germany": "DE",
    "france": "FR", "italy": "IT", "spain": "ES", "netherlands": "NL",
    "poland": "PL", "belgium": "BE", "finland": "FI", "hungary": "HU",
    "pakistan": "PK", "india": "IN", "united arab emirates": "AE", "uae": "AE",
    "canada": "CA", "australia": "AU", "vietnam": "VN", "viet nam": "VN",
    "hong kong": "HK", "turkey": "TR", "türkiye": "TR", "philippines": "PH",
    "singapore": "SG", "kuwait": "KW", "lebanon": "LB", "malaysia": "MY",
    "saudi arabia": "SA", "latvia": "LV", "new zealand": "NZ", "peru": "PE",
    "qatar": "QA", "thailand": "TH", "greece": "GR", "ukraine": "UA", "oman": "OM",
    "uganda": "UG", "sri lanka": "LK", "benin": "BJ", "kenya": "KE",
    "afghanistan": "AF", "russia": "RU", "russian federation": "RU", "indonesia": "ID",
    "austria": "AT", "brazil": "BR", "china": "CN", "denmark": "DK", "egypt": "EG",
    "ghana": "GH", "ireland": "IE", "mexico": "MX", "nigeria": "NG", "norway": "NO",
    "portugal": "PT", "south africa": "ZA", "south korea": "KR", "sweden": "SE",
    "switzerland": "CH",
}


def norm(value: str | None) -> str | None:
    if not value:
        return None
    value = unicodedata.normalize("NFKC", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def norm_key(value: str | None) -> str:
    value = norm(value) or ""
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def score_recency(published: date | None, observed: date) -> tuple[int, int | None]:
    if not published:
        return 0, None
    age = (observed - published).days
    if age < 0:
        return 0, age
    if age <= 7:
        return 25, age
    if age <= 30:
        return 18, age
    if age <= 90:
        return 8, age
    return 0, age


def truth_level(score: int) -> str:
    if score >= 75:
        return "A"
    if score >= 60:
        return "B"
    if score >= 40:
        return "C"
    return "D"


def load_rows(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


INPUT_FILENAME = "B2B公开渠道_全量.csv"


def find_latest_input() -> Path:
    """Newest data_b2b_public_v3 run that actually produced the full-listing CSV.

    Matches the filename by exact comparison rather than a glob, so a non-UTF-8
    shell locale cannot corrupt a CJK glob pattern into something that never
    matches.
    """
    root = Path(__file__).with_name("data_b2b_public_v3")
    runs = sorted((p for p in root.glob("*") if p.is_dir()), reverse=True) if root.exists() else []
    for run in runs:
        candidate = run / INPUT_FILENAME
        if candidate.exists():
            return candidate
    raise SystemExit("No v3 collection found. Run collect_b2b_public_v3.py first.")


def boolish(value: str | None) -> bool:
    return str(value).strip().casefold() in {"1", "true", "yes"}


def clean_row(row: dict, observed_default: date) -> dict:
    row = repair_cleaning_input(row)
    title = norm(row.get("title")) or ""
    description = norm(row.get("description_raw")) or ""
    combined = f"{title} {description}"
    source_url = norm(row.get("source_url"))
    observed_at = norm(row.get("observed_at")) or datetime.now(timezone.utc).isoformat(timespec="seconds")
    observed_date = parse_iso_date(observed_at) or observed_default
    published_at = norm(row.get("published_at"))
    published_date = parse_iso_date(published_at)
    recency, age_days = score_recency(published_date, observed_date)
    country_raw = norm(row.get("buyer_country_raw"))
    country_code = COUNTRY_TO_CODE.get((country_raw or "").casefold())
    buyer_name = norm(row.get("buyer_name_raw"))
    contact_person = norm(row.get("contact_person_raw"))
    # Legacy rows stored a Go4WorldBusiness contact in buyer_name_raw.
    if not contact_person and row.get("source_code") == "go4worldbusiness" and buyer_name and not COMPANY_MARKERS.search(buyer_name):
        contact_person = buyer_name
        buyer_name = None
    domain_match = DOMAIN.search(combined)
    domain = domain_match.group(1).casefold() if domain_match else None
    registration_match = REGISTRATION.search(combined)
    registration_id = registration_match.group(1) if registration_match else None
    emails = sorted(set(EMAIL.findall(combined)))
    phones = sorted(set(norm(v) for v in PHONE.findall(combined) if norm(v)))

    product_clear = product_matches(row.get("category_code", ""), title, description)
    action_clear = bool(BUY_ACTION.search(combined)) and row.get("record_kind") == "DIRECT_BUY_REQUIREMENT"
    spec_clear = bool(SPEC.search(combined))
    detected_quantity = QUANTITY.search(combined)
    quantity_candidate = norm(row.get("quantity_raw")) or (norm(detected_quantity.group(0)) if detected_quantity else None)
    quantity_value, quantity_status, field_warnings = validate_quantity(quantity_candidate)
    quantity_clear = quantity_status == "VALID"
    destination_clear = bool(DESTINATION.search(combined))
    d1 = 10 * product_clear + 10 * action_clear + 5 * spec_clear + 5 * quantity_clear + 5 * destination_clear

    company_clear = bool(buyer_name and (COMPANY_MARKERS.search(buyer_name) or len(buyer_name.split()) >= 2))
    stable_entity_page = bool(company_clear and source_url)
    business_relation = bool(company_clear and BUY_ACTION.search(combined))
    d2_entity = 5 * company_clear + 7 * bool(domain) + 5 * bool(country_code) + 5 * stable_entity_page + 3 * business_relation

    procurement_entry = bool(source_url and row.get("contact_gate"))
    account_present = bool(buyer_name or contact_person)
    # Phase 1 separates observable business context from legal-entity resolution.
    # A platform account and traceable response route can support a real demand,
    # but never promote the represented buyer to a verified company.
    d2_business_context = min(
        25,
        10 * procurement_entry + 5 * account_present + 5 * bool(country_code) + 5 * action_clear,
    )
    d4 = 4 * procurement_entry
    buyer_identity_status = (
        "LEGAL_VERIFIED" if registration_id
        else "DOMAIN_LINKED" if company_clear and domain
        else "PLATFORM_ACCOUNT" if procurement_entry
        else "PERSON_ONLY" if contact_person
        else "UNRESOLVED"
    )
    total = int(d1 + d2_business_context + recency + d4)
    hard_gate = bool(source_url and observed_at and description)
    if not hard_gate:
        total = 0
    level = truth_level(total)
    if not hard_gate:
        decision = "REJECT_MISSING_EVIDENCE"
    elif not product_clear or not action_clear:
        decision = "REJECT_NOT_DIRECT_REQUIREMENT"
    elif quantity_status == "CONFLICT":
        decision = "NEEDS_VERIFICATION"
    elif recency == 0:
        decision = "BACKGROUND_OR_STALE"
    elif level in {"A", "B"} and company_clear:
        decision = "FORMALLY_QUALIFIED"
    elif level in {"A", "B"}:
        decision = "QUALIFIED_PENDING_ENTITY"
    elif level == "C":
        decision = "NEEDS_VERIFICATION"
    else:
        decision = "WEAK_SIGNAL"

    fingerprint_material = "|".join([
        row.get("category_code") or "", norm_key(title), country_code or "", buyer_name and norm_key(buyer_name) or ""
    ])
    fingerprint = hashlib.sha256(fingerprint_material.encode("utf-8")).hexdigest()
    return {
        "signal_id": hashlib.sha256((row.get("source_code", "") + "|" + (source_url or fingerprint)).encode("utf-8")).hexdigest()[:32],
        "source_code": row.get("source_code"),
        "source_type": "B2B_MARKETPLACE_RFQ",
        "category_code": row.get("category_code"),
        "product_terms": row.get("category_code"),
        "buying_action": "RFQ_OR_BUY_OFFER" if action_clear else None,
        "title": title,
        "description_raw": description,
        "specs_present": spec_clear,
        "quantity_raw": quantity_value,
        "quantity_status": quantity_status,
        "quantity_source_span": norm(row.get("quantity_span")),
        "field_warnings": "|".join(field_warnings) or None,
        "destination_present": destination_clear,
        "buyer_name_raw": buyer_name,
        "buyer_name_source_span": norm(row.get("buyer_name_span")),
        "contact_person_raw": contact_person,
        "account_holder_type": "ORGANIZATION" if company_clear else "PERSON_OR_AGENT" if contact_person else "UNKNOWN",
        "business_context_status": "CONFIRMED" if hard_gate and product_clear and action_clear and recency > 0 else "UNCONFIRMED",
        "buyer_entity_status": "CONFIRMED" if company_clear else "UNRESOLVED",
        "buyer_identity_status": buyer_identity_status,
        "entity_resolution_status": "RESOLVED" if company_clear else "PERSON_ONLY" if contact_person else "UNRESOLVED",
        "contact_person_source_span": norm(row.get("contact_person_span")),
        "buyer_country_raw": country_raw,
        "buyer_country_source_span": norm(row.get("buyer_country_span")),
        "buyer_country_code": country_code,
        "buyer_domain": domain,
        "registration_id": registration_id,
        "public_business_emails": "|".join(emails) or None,
        "public_business_phones": "|".join(phones) or None,
        "published_at": published_at,
        "published_at_source_span": norm(row.get("published_at_span")),
        "observed_at": observed_at,
        "age_days": age_days,
        "time_precision": "DATE" if published_at else "UNKNOWN",
        "evidence_url": source_url,
        "listing_url": norm(row.get("listing_url")),
        "evidence_excerpt": description[:1000],
        "snapshot_sha256": norm(row.get("snapshot_sha256")),
        "data_mode": row.get("data_mode") or "LIVE",
        "verification_status": row.get("verification_status") or "UNVERIFIED_MARKETPLACE_POST",
        "contact_gate": row.get("contact_gate"),
        "d1_demand_explicitness": d1,
        "d2_account_business_context": d2_business_context,
        "d2_entity_authenticity": d2_entity,
        "d3_recency": recency,
        "d4_corroboration": d4,
        "truth_score": total,
        "truth_level": level,
        "hard_gate_pass": hard_gate,
        "qualification_status": decision,
        "dedupe_fingerprint": fingerprint,
        "ruleset_version": "truth-v1.1.0",
    }


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path)
    args = parser.parse_args()
    input_path = args.input or find_latest_input()
    raw_rows = load_rows(input_path)
    cleaned = [clean_row(row, date.today()) for row in raw_rows]

    groups: dict[str, list[dict]] = defaultdict(list)
    for row in cleaned:
        groups[row["dedupe_fingerprint"]].append(row)
    deduped = []
    duplicate_rows = 0
    for rows in groups.values():
        rows.sort(key=lambda r: (r["truth_score"], r["published_at"] or ""), reverse=True)
        winner = rows[0]
        winner["duplicate_count"] = len(rows)
        winner["duplicate_source_codes"] = "|".join(sorted(set(r["source_code"] for r in rows)))
        # Cross-source evidence is counted only when the same demand fingerprint occurs on independent sources.
        if len(set(r["source_code"] for r in rows)) >= 2:
            winner["d4_corroboration"] = min(15, winner["d4_corroboration"] + 7)
            winner["truth_score"] = min(100, winner["truth_score"] + 7)
            winner["truth_level"] = truth_level(winner["truth_score"])
        deduped.append(winner)
        duplicate_rows += len(rows) - 1

    deduped.sort(key=lambda r: (-r["truth_score"], r["source_code"] or "", r["signal_id"]))
    out_dir = input_path.parent / "cleaned_v1"
    out_dir.mkdir(exist_ok=True)
    columns = list(deduped[0].keys()) if deduped else ["signal_id"]
    write_csv(out_dir / "buyer_signals_cleaned_scored.csv", deduped, columns)
    qualified_statuses = {"QUALIFIED", "FORMALLY_QUALIFIED", "QUALIFIED_PENDING_ENTITY"}
    qualified = [r for r in deduped if r["qualification_status"] in qualified_statuses]
    write_csv(out_dir / "buyer_signals_qualified.csv", qualified, columns)

    required = ["evidence_url", "observed_at", "evidence_excerpt", "category_code", "published_at", "buyer_country_code", "buyer_name_raw", "contact_person_raw"]
    null_rates = {
        field: round(sum(not r.get(field) for r in deduped) / len(deduped), 4) if deduped else None
        for field in required
    }
    summary = {
        "input": str(input_path),
        "grain": "one deduplicated public buyer-demand signal per category/title/country/buyer fingerprint",
        "raw_count": len(raw_rows),
        "deduplicated_count": len(deduped),
        "duplicate_rows_removed": duplicate_rows,
        "qualified_count": len(qualified),
        "formally_qualified_count": sum(r["qualification_status"] in {"QUALIFIED", "FORMALLY_QUALIFIED"} for r in deduped),
        "qualified_pending_entity_count": sum(r["qualification_status"] == "QUALIFIED_PENDING_ENTITY" for r in deduped),
        "demand_quality_pass_count": sum(r["truth_level"] in {"A", "B"} for r in deduped),
        "entity_resolved_count": sum(r.get("entity_resolution_status") == "RESOLVED" for r in deduped),
        "levels": dict(Counter(r["truth_level"] for r in deduped)),
        "statuses": dict(Counter(r["qualification_status"] for r in deduped)),
        "sources": dict(Counter(r["source_code"] for r in deduped)),
        "categories": dict(Counter(r["category_code"] for r in deduped)),
        "required_field_null_rates": null_rates,
        "hard_gate_failure_count": sum(not r["hard_gate_pass"] for r in deduped),
        "future_date_count": sum((r["age_days"] is not None and r["age_days"] < 0) for r in deduped),
        "invalid_quantity_count": sum(r.get("quantity_status") == "CONFLICT" for r in deduped),
        "buyer_identity_coverage_rate": round(sum(bool(r.get("buyer_name_raw") or r.get("contact_person_raw")) for r in deduped) / len(deduped), 4) if deduped else None,
        "ruleset_version": "truth-v1.1.0",
    }
    (out_dir / "data_quality_report.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
