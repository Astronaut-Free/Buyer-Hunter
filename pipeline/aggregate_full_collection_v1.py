"""Normalize and quality-gate the latest Buyer Hunter collector outputs.

This script does not fetch. It combines the latest completed runs from the
independent collectors, preserves source roles, and keeps supporting evidence
separate from current procurement opportunities.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from clean_and_score_buyer_signals_v1 import clean_row


ROOT = Path(__file__).resolve().parent
TODAY = date.today()
CURRENT_ROLES = {"DIRECT_RFQ", "OFFICIAL_PROCUREMENT"}
SUPPORTING_ROLES = {"HISTORICAL_PURCHASE", "BUYER_BACKGROUND", "PROCUREMENT_ENTRY"}
QUALIFIED_STATUSES = {"FORMALLY_QUALIFIED", "QUALIFIED_PENDING_ENTITY"}
ISO3_TO_ISO2 = {
    "BEL": "BE", "FRA": "FR", "HRV": "HR", "HUN": "HU",
    "NLD": "NL", "POL": "PL", "ROU": "RO",
}


def latest_run(name: str) -> Path | None:
    root = ROOT / name
    runs = sorted((p for p in root.iterdir() if p.is_dir()), reverse=True) if root.exists() else []
    return runs[0] if runs else None


def read_csv(path: Path | None) -> list[dict[str, str]]:
    if not path or not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_jsonl(path: Path | None) -> list[dict]:
    if not path or not path.exists():
        return []
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def text(value) -> str | None:
    if value is None:
        return None
    value = re.sub(r"\s+", " ", str(value)).strip()
    return value or None


def key_text(value) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text(value) or "").casefold()).strip()


def iso_date(value: str | None, observed_at: str | None = None) -> str | None:
    value = text(value)
    if not value:
        return None
    match = re.match(r"(\d{4}-\d{2}-\d{2})", value)
    if match:
        try:
            return date.fromisoformat(match.group(1)).isoformat()
        except ValueError:
            return None
    for fmt in ("%d %b, %Y", "%d %B, %Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    base = TODAY
    if observed_at:
        try:
            base = date.fromisoformat(observed_at[:10])
        except ValueError:
            pass
    hours = re.search(r"(\d+)\s*hours?\s*(?:ago|before)", value, re.I)
    if hours:
        return base.isoformat()
    days = re.search(r"(\d+)\s*days?\s*(?:ago|before)", value, re.I)
    if days:
        return (base - timedelta(days=int(days.group(1)))).isoformat()
    return None


def age_days(published_at: str | None) -> int | None:
    if not published_at:
        return None
    try:
        return (TODAY - date.fromisoformat(published_at[:10])).days
    except ValueError:
        return None


def strict_product_match(category: str | None, title: str | None, description: str | None) -> bool:
    haystack = f"{title or ''} {description or ''}".casefold()
    if not category:
        return False
    exclusions = {
        "MATCHA": ("matcha candle", "matcha perfume", "matcha color", "matcha whisk", "matcha set"),
        "BLUEBERRY": ("balloon", "latex", "vape", "glove", "shoe", "fragrance", "headlight", "toy", "blueberry flavored", "blueberry flavoured"),
        "ROSA_ROXBURGHII": ("rose plant", "rose seed", "ornamental rose", "garden rose", "rose flower"),
        "CHILI": ("pepper spray", "pepper gun", "chili software", "chili con carne", "chili sin carne"),
        "TEA": ("tea set", "tea kettle", "tea table", "tea tree oil", "teacher", "teaching", "tea machine"),
    }
    if any(term in haystack for term in exclusions.get(category, ())):
        return False
    terms = {
        "MATCHA": ("matcha", "green tea powder"),
        "BLUEBERRY": ("blueberry", "blueberries"),
        "ROSA_ROXBURGHII": ("rosa roxburghii", "cili fruit", "chestnut rose fruit", "burr rose fruit"),
        "CHILI": ("chili pepper", "chilli pepper", "red chili", "red chilli", "dried chili", "dried chilli", "chili powder", "chilli powder", "hot pepper", "capsicum", "paprika"),
        "TEA": ("tea leaves", "green tea", "black tea", "white tea", "oolong tea", "instant tea", "tea powder", "tea extract", "bulk tea", "organic tea", "tea bag"),
    }
    return any(term in haystack for term in terms.get(category, ()))


def category_from_terms(values: Iterable[str]) -> str | None:
    folded = " ".join(str(v) for v in values).casefold()
    if "matcha" in folded or "green tea powder" in folded:
        return "MATCHA"
    if "blueberr" in folded:
        return "BLUEBERRY"
    if "rosa roxburghii" in folded or "cili fruit" in folded:
        return "ROSA_ROXBURGHII"
    if any(term in folded for term in ("chili", "chilli", "capsicum", "paprika")):
        return "CHILI"
    if "tea" in folded:
        return "TEA"
    return None


def base_record(**values) -> dict:
    row = {
        "record_id": None,
        "source_code": None,
        "source_role": None,
        "category_code": None,
        "title": None,
        "description_raw": None,
        "buyer_name_raw": None,
        "contact_person_raw": None,
        "buyer_country_code": None,
        "buyer_country_raw": None,
        "quantity_raw": None,
        "published_at": None,
        "deadline_at": None,
        "source_url": None,
        "observed_at": None,
        "verification_status": None,
        "product_match": False,
        "timely": False,
        "entity_resolved": False,
        "account_holder_type": "UNKNOWN",
        "business_context_status": "UNCONFIRMED",
        "buyer_entity_status": "UNRESOLVED",
        "buyer_identity_status": "UNRESOLVED",
        "quality_status": "REJECTED",
        "quality_reason": None,
        "d1_demand_explicitness": None,
        "d2_account_business_context": None,
        "d2_entity_authenticity": None,
        "d3_recency": None,
        "d4_corroboration": None,
        "truth_score": None,
        "truth_level": None,
    }
    row.update(values)
    if row["entity_resolved"]:
        row["buyer_entity_status"] = "CONFIRMED"
        row["buyer_identity_status"] = "LEGAL_VERIFIED" if row.get("source_role") == "OFFICIAL_PROCUREMENT" else "DOMAIN_LINKED"
    if row["buyer_name_raw"]:
        row["account_holder_type"] = "ORGANIZATION"
    elif row["contact_person_raw"]:
        row["account_holder_type"] = "PERSON_OR_AGENT"
        row["buyer_identity_status"] = "PLATFORM_ACCOUNT" if row.get("source_url") else "PERSON_ONLY"
    if row["quality_status"] in QUALIFIED_STATUSES:
        row["business_context_status"] = "CONFIRMED"
    elif row["quality_status"] == "SUPPORTING_EVIDENCE":
        row["business_context_status"] = "SUPPORTING_ONLY"
    row["record_id"] = row["record_id"] or hashlib.sha256(
        f"{row['source_code']}|{row['source_url']}|{row['title']}".encode("utf-8")
    ).hexdigest()[:32]
    return row


def score_missing_truth(rows: list[dict]) -> None:
    """Run the shared four-dimension truth model for qualified public RFQs."""
    for row in rows:
        if row.get("quality_status") not in QUALIFIED_STATUSES or text(row.get("truth_score")):
            continue
        scored = clean_row(
            {
                "source_code": row.get("source_code"),
                "category_code": row.get("category_code"),
                "title": row.get("title"),
                "description_raw": row.get("description_raw"),
                "source_url": row.get("source_url"),
                "observed_at": row.get("observed_at"),
                "published_at": row.get("published_at"),
                "buyer_country_raw": row.get("buyer_country_raw"),
                "buyer_name_raw": row.get("buyer_name_raw"),
                "contact_person_raw": row.get("contact_person_raw"),
                "quantity_raw": row.get("quantity_raw"),
                "record_kind": "DIRECT_BUY_REQUIREMENT",
                "contact_gate": "platform_public_response",
                "verification_status": row.get("verification_status"),
                "data_mode": "LIVE",
            },
            TODAY,
        )
        for field in (
            "d1_demand_explicitness", "d2_account_business_context", "d2_entity_authenticity", "d3_recency",
            "d4_corroboration", "truth_score", "truth_level",
        ):
            row[field] = scored.get(field)
        if scored.get("truth_level") not in {"A", "B"}:
            row["quality_status"] = "NEEDS_VERIFICATION"
            row["business_context_status"] = "UNCONFIRMED"
        row["quality_reason"] = (
            f"four-dimension truth={scored.get('truth_level')} score={scored.get('truth_score')}; "
            f"{row.get('quality_reason') or ''}"
        ).strip()

def normalize_b2b(run: Path) -> tuple[list[dict], dict[str, int]]:
    cleaned = read_csv(run / "cleaned_v1" / "buyer_signals_cleaned_scored.csv")
    raw = read_csv(run / "B2B公开渠道_全量.csv")
    raw_counts = Counter(row.get("source_code") for row in raw)
    out = []
    for row in cleaned:
        useful = row.get("qualification_status") in QUALIFIED_STATUSES | {"QUALIFIED"}
        resolved = row.get("entity_resolution_status") == "RESOLVED"
        out.append(base_record(
            record_id=row.get("signal_id"), source_code=row.get("source_code"),
            source_role="DIRECT_RFQ", category_code=row.get("category_code"),
            title=row.get("title"), description_raw=row.get("description_raw"),
            buyer_name_raw=row.get("buyer_name_raw"), contact_person_raw=row.get("contact_person_raw"),
            buyer_country_code=row.get("buyer_country_code"), buyer_country_raw=row.get("buyer_country_raw"),
            quantity_raw=row.get("quantity_raw"), published_at=row.get("published_at"),
            source_url=row.get("evidence_url"), observed_at=row.get("observed_at"),
            verification_status=row.get("verification_status"), product_match=True,
            timely=(row.get("d3_recency") or "0") != "0", entity_resolved=resolved,
            quality_status="FORMALLY_QUALIFIED" if useful and resolved else "QUALIFIED_PENDING_ENTITY" if useful else row.get("qualification_status") or "REJECTED",
            quality_reason=f"truth={row.get('truth_level')} score={row.get('truth_score')}",
            buyer_identity_status=row.get("buyer_identity_status"),
            d1_demand_explicitness=row.get("d1_demand_explicitness"),
            d2_account_business_context=row.get("d2_account_business_context"),
            d2_entity_authenticity=row.get("d2_entity_authenticity"),
            d3_recency=row.get("d3_recency"), d4_corroboration=row.get("d4_corroboration"),
            truth_score=row.get("truth_score"), truth_level=row.get("truth_level"),
        ))
    return out, dict(raw_counts)


def normalize_alibaba(run: Path) -> tuple[list[dict], int]:
    all_rows = read_csv(run / "Alibaba_RFQ_公开页_全量.csv")
    candidates = read_csv(run / "Alibaba_RFQ_公开页_待清洗候选.csv")
    out = []
    for row in candidates:
        published = iso_date(row.get("published_at_raw"), row.get("observed_at"))
        combined = f"{row.get('title') or ''} {row.get('description_raw') or ''}".casefold()
        category = "MATCHA" if "matcha" in combined else row.get("category_code")
        product = strict_product_match(category, row.get("title"), row.get("description_raw"))
        recent = age_days(published)
        timely = recent is not None and 0 <= recent <= 30
        useful = product and timely and bool(row.get("source_url"))
        out.append(base_record(
            record_id=row.get("rfq_id"), source_code="alibaba_rfq", source_role="DIRECT_RFQ",
            category_code=category, title=row.get("title"), description_raw=row.get("description_raw"),
            contact_person_raw=row.get("buyer_name_raw"), buyer_country_code=row.get("buyer_country_code"),
            buyer_country_raw=row.get("buyer_country_raw"), quantity_raw=" ".join(filter(None, [row.get("quantity_raw"), row.get("quantity_unit_raw")])),
            published_at=published, source_url=row.get("source_url"), observed_at=row.get("observed_at"),
            verification_status=row.get("verification_status"), product_match=product, timely=timely,
            quality_status="QUALIFIED_PENDING_ENTITY" if useful else "REJECTED_OR_STALE",
            quality_reason="public Alibaba RFQ; buyer value is a contact person, not a resolved company",
        ))
    return out, len(all_rows)


def normalize_ec21(run: Path | None) -> tuple[list[dict], int]:
    if not run:
        return [], 0
    rows = read_csv(run / "EC21_美国日本欧洲_全量.csv")
    accepted = {"QUALIFIED_SIGNAL", "QUALIFIED_SIGNAL_NEEDS_IDENTITY"}
    out = []
    for row in rows:
        useful = row.get("qualification_status") in accepted
        product = str(row.get("exact_product_match", "")).casefold() == "true"
        out.append(base_record(
            source_code="ec21", source_role="DIRECT_RFQ", category_code=row.get("category_code"),
            title=row.get("title"), description_raw=row.get("description_raw"),
            contact_person_raw=row.get("buyer_identity_claim_raw"), buyer_country_code=row.get("buyer_country_code"),
            buyer_country_raw=row.get("buyer_country_raw"), published_at=row.get("published_at"),
            source_url=row.get("source_url"), observed_at=row.get("observed_at"),
            verification_status=row.get("verification_status"), product_match=product,
            timely=row.get("age_days", "").isdigit() and int(row["age_days"]) <= 365,
            quality_status="QUALIFIED_PENDING_ENTITY" if useful else row.get("qualification_status") or "REJECTED",
            quality_reason=row.get("qualification_reason_zh"),
        ))
    return out, len(rows)


def normalize_ted(run: Path) -> tuple[list[dict], int]:
    rows = read_csv(run / "TED_五品类_有效采购公告.csv")
    out = []
    for row in rows:
        published = iso_date(row.get("published_at"))
        deadline = iso_date(row.get("deadline_at"))
        product = strict_product_match(row.get("category_code"), row.get("title"), row.get("description_raw"))
        published_age = age_days(published)
        timely = bool(deadline and deadline >= TODAY.isoformat())
        resolved = bool(text(row.get("buyer_name_raw")))
        useful = product and timely and resolved
        status = "FORMALLY_QUALIFIED" if useful else "SUPPORTING_EVIDENCE" if product and resolved else "REJECTED_OR_STALE"
        out.append(base_record(
            record_id=row.get("publication_number"), source_code="ted_eu", source_role="OFFICIAL_PROCUREMENT",
            category_code=row.get("category_code"), title=row.get("title"), description_raw=row.get("description_raw"),
            buyer_name_raw=row.get("buyer_name_raw"), buyer_country_code=ISO3_TO_ISO2.get(row.get("buyer_country_raw") or ""), buyer_country_raw=row.get("buyer_country_raw"),
            published_at=published, deadline_at=deadline, source_url=row.get("source_url"), observed_at=row.get("observed_at"),
            verification_status=row.get("verification_status"), product_match=product, timely=timely,
            entity_resolved=resolved, quality_status=status,
            quality_reason="official notice; no future deadline means supporting evidence, not an open opportunity",
        ))
    return out, len(rows)


def normalize_sam(run: Path | None) -> tuple[list[dict], int]:
    if not run:
        return [], 0
    rows = read_jsonl(run / "records.jsonl")
    out = []
    for row in rows:
        category = category_from_terms(row.get("matched_queries") or [])
        published = iso_date(row.get("published_at_raw"))
        deadline = iso_date(row.get("deadline_raw"))
        product = strict_product_match(category, row.get("title"), " ".join(row.get("matched_queries") or []))
        timely = bool(deadline and deadline >= TODAY.isoformat()) or (age_days(published) is not None and 0 <= age_days(published) <= 90)
        resolved = bool(text(row.get("buyer_name_raw")))
        useful = product and timely and resolved
        status = "FORMALLY_QUALIFIED" if useful else "SUPPORTING_EVIDENCE" if product and resolved else "REJECTED_OR_STALE"
        out.append(base_record(
            record_id=row.get("notice_id"), source_code="sam_gov", source_role="OFFICIAL_PROCUREMENT",
            category_code=category, title=row.get("title"), buyer_name_raw=row.get("buyer_name_raw"),
            published_at=published, deadline_at=deadline, source_url=row.get("source_url"),
            verification_status=row.get("verification_status"), product_match=product, timely=timely,
            entity_resolved=resolved, quality_status=status,
            quality_reason="official SAM.gov API result",
        ))
    return out, len(rows)


def normalize_samples(run: Path) -> tuple[list[dict], dict[str, int]]:
    rows = read_jsonl(run / "records.jsonl")
    raw_counts = Counter(row.get("source_code") for row in rows)
    out = []
    for row in rows:
        source = row.get("source_code")
        if source == "tradewheel_matcha_blueberry_us":
            category = category_from_terms(row.get("product_terms") or [])
            published = iso_date(row.get("published_at_raw"))
            product = strict_product_match(category, row.get("title"), row.get("description_raw"))
            days = age_days(published)
            timely = days is not None and 0 <= days <= 365
            useful = product and timely and row.get("record_kind") == "DIRECT_BUY_REQUIREMENT"
            buyer = re.split(r"\s+Country/Region\b", row.get("buyer_name_raw") or "", maxsplit=1)[0] or None
            out.append(base_record(
                source_code="tradewheel", source_role="DIRECT_RFQ", category_code=category,
                title=row.get("title"), description_raw=row.get("description_raw"), contact_person_raw=buyer,
                buyer_country_code="US", buyer_country_raw="United States", quantity_raw=row.get("quantity_raw"),
                published_at=published, source_url=row.get("source_url"), observed_at=row.get("observed_at"), verification_status=row.get("verification_status"),
                product_match=product, timely=timely, quality_status="QUALIFIED_PENDING_ENTITY" if useful else "REJECTED_PRODUCT_OR_STALE",
                quality_reason="public TradeWheel buyer post; company identity remains gated",
            ))
        elif source == "usaspending":
            category = category_from_terms(row.get("product_terms") or [])
            out.append(base_record(
                source_code="usaspending", source_role="HISTORICAL_PURCHASE", category_code=category,
                title=row.get("title"), description_raw=row.get("description_raw"), buyer_name_raw=row.get("buyer_name_raw"),
                published_at=iso_date(row.get("published_at_raw")), source_url=row.get("source_url"),
                verification_status=row.get("verification_status"), product_match=bool(category), timely=False,
                entity_resolved=bool(row.get("buyer_name_raw")), quality_status="SUPPORTING_EVIDENCE",
                quality_reason="official historical award; not a current RFQ",
            ))
        elif source == "independent_buyer_sites":
            out.append(base_record(
                source_code=source, source_role="BUYER_BACKGROUND", title=row.get("title"),
                description_raw=row.get("description_raw"), buyer_name_raw=row.get("buyer_name_raw"),
                source_url=row.get("source_url"), verification_status=row.get("verification_status"),
                quality_status="SUPPORTING_EVIDENCE", quality_reason="public buyer/supplier-entry background; not a current demand",
            ))
    return out, dict(raw_counts)


def dedupe(rows: list[dict]) -> list[dict]:
    winners = {}
    rank = {"FORMALLY_QUALIFIED": 4, "QUALIFIED_PENDING_ENTITY": 3, "SUPPORTING_EVIDENCE": 2}
    for row in rows:
        # API query endpoints can be shared by many distinct records (for
        # example USAspending). Collector-stable record IDs are therefore the
        # primary dedupe key; source URL alone is not a safe business key.
        key = f"{row.get('source_code')}|{row.get('record_id')}"
        current = winners.get(key)
        if not current or rank.get(row.get("quality_status"), 1) > rank.get(current.get("quality_status"), 1):
            winners[key] = row
    return list(winners.values())


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    runs = {
        "b2b": latest_run("data_b2b_public_v3"),
        "alibaba": latest_run("data_alibaba_public"),
        "ec21": latest_run("data_ec21_regions"),
        "ted": latest_run("data_ted"),
        "sam": latest_run("data_sam_precise"),
        "ungm": latest_run("data_ungm"),
        "samples": latest_run("data_v2"),
    }
    required = ("b2b", "alibaba", "ted", "samples")
    missing = [name for name in required if not runs[name]]
    if missing:
        raise SystemExit(f"Missing collector runs: {', '.join(missing)}")

    rows = []
    raw_counts = Counter()
    b2b, counts = normalize_b2b(runs["b2b"])
    rows.extend(b2b); raw_counts.update(counts)
    alibaba, count = normalize_alibaba(runs["alibaba"])
    rows.extend(alibaba); raw_counts["alibaba_rfq"] = count
    ec21, count = normalize_ec21(runs["ec21"])
    rows.extend(ec21); raw_counts["ec21"] = count
    ted, count = normalize_ted(runs["ted"])
    rows.extend(ted); raw_counts["ted_eu"] = count
    sam, count = normalize_sam(runs["sam"])
    rows.extend(sam); raw_counts["sam_gov"] = count
    sample_rows, counts = normalize_samples(runs["samples"])
    rows.extend(sample_rows)
    for source, count in counts.items():
        raw_counts["tradewheel" if source == "tradewheel_matcha_blueberry_us" else source] = count

    score_missing_truth(rows)
    deduped = dedupe(rows)
    useful = [row for row in deduped if row["quality_status"] in {"FORMALLY_QUALIFIED", "QUALIFIED_PENDING_ENTITY"}]
    formal = [row for row in useful if row["quality_status"] == "FORMALLY_QUALIFIED"]
    pending = [row for row in useful if row["quality_status"] == "QUALIFIED_PENDING_ENTITY"]
    supporting = [row for row in deduped if row["quality_status"] == "SUPPORTING_EVIDENCE"]

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = ROOT / "data_full_collection" / run_id
    output.mkdir(parents=True, exist_ok=True)
    columns = list(base_record().keys())
    write_csv(output / "all_platform_records_cleaned.csv", deduped, columns)
    write_csv(output / "useful_current_opportunities.csv", useful, columns)
    write_csv(output / "formally_qualified_opportunities.csv", formal, columns)
    write_csv(output / "qualified_pending_entity_opportunities.csv", pending, columns)
    write_csv(output / "supporting_evidence.csv", supporting, columns)

    grouped = defaultdict(list)
    for row in deduped:
        grouped[row["source_code"]].append(row)
    platform_codes = sorted(set(raw_counts) | set(grouped) | {"ungm", "amazon_business_rfq", "importyeti"})
    platform_rows = []
    for source in platform_codes:
        items = grouped.get(source, [])
        platform_rows.append({
            "source_code": source,
            "fetched_raw_count": raw_counts.get(source, 0),
            "cleaned_unique_count": len(items),
            "useful_current_count": sum(row["quality_status"] in {"FORMALLY_QUALIFIED", "QUALIFIED_PENDING_ENTITY"} for row in items),
            "formally_qualified_count": sum(row["quality_status"] == "FORMALLY_QUALIFIED" for row in items),
            "qualified_pending_entity_count": sum(row["quality_status"] == "QUALIFIED_PENDING_ENTITY" for row in items),
            "supporting_evidence_count": sum(row["quality_status"] == "SUPPORTING_EVIDENCE" for row in items),
        })
    write_csv(output / "platform_summary.csv", platform_rows, list(platform_rows[0]))

    report = {
        "run_id": run_id,
        "input_runs": {name: str(path) if path else None for name, path in runs.items()},
        "definitions": {
            "useful_current": "current direct RFQ or official procurement with strict product match and traceable source",
            "qualified_pending_entity": "useful current commercial demand allowed into ranking while the represented legal buyer entity remains unresolved",
            "formally_qualified": "useful current demand plus resolved legal/official buyer entity",
            "supporting_evidence": "historical purchase, buyer background, or procurement entry; not counted as current demand",
        },
        "fetched_raw_count": sum(raw_counts.values()),
        "normalized_before_dedupe_count": len(rows),
        "cleaned_unique_count": len(deduped),
        "useful_current_count": len(useful),
        "formally_qualified_count": len(formal),
        "qualified_pending_entity_count": len(pending),
        "supporting_evidence_count": len(supporting),
        "rejected_or_stale_count": len(deduped) - len(useful) - len(supporting),
        "counts_by_quality_status": dict(Counter(row["quality_status"] for row in deduped)),
        "counts_by_source_role": dict(Counter(row["source_role"] for row in deduped)),
        "counts_by_category_useful": dict(Counter(row["category_code"] for row in useful)),
        "platform_summary": platform_rows,
    }
    (output / "full_collection_quality_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
