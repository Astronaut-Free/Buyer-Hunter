"""Deduplicate direct demands and enrich high-value fields found in sample text."""

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


def norm(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def match(pattern: str, value: str) -> str | None:
    found = re.search(pattern, value, re.I)
    return found.group(1).strip(" .,:;") if found else None


def product_form(value: str) -> str | None:
    for result, pattern in (
        ("powder_mix", r"powder mix"),
        ("powder", r"\bpowder\b"),
        ("dried_fruit", r"\bdried blueberr"),
        ("fresh_fruit", r"\bfresh blueberr|blueberries and strawberries"),
        ("fruit", r"\bblueberr"),
    ):
        if re.search(pattern, value, re.I):
            return result
    return None


def enrich(row: dict[str, Any]) -> dict[str, Any]:
    text = f"{row.get('title') or ''} {row.get('description_raw') or ''}"
    direct = row.get("record_kind") == "DIRECT_BUY_REQUIREMENT"
    return {
        "source": {
            "code": row.get("source_code"),
            "url": row.get("source_url"),
            "record_kind": row.get("record_kind"),
            "data_mode": row.get("data_mode", "LIVE"),
        },
        "buyer": {
            "name_raw": row.get("buyer_name_raw"),
            "country_raw": row.get("buyer_country_raw"),
            "country_code": "US" if re.search(r"USA|United States", str(row.get("buyer_country_raw") or ""), re.I) else None,
            "supplier_name_raw": row.get("supplier_name_raw"),
        },
        "demand": {
            "is_direct": direct,
            "title": row.get("title"),
            "description_raw": row.get("description_raw"),
            "published_at": row.get("published_at") or row.get("published_at_raw"),
            "action": "BUY" if direct else None,
            "urgency": "URGENT" if re.search(r"urgent|rush|contact asap", text, re.I) else None,
            "trial_order_raw": match(r"(approximately\s*:\s*\d+\s*x\s*\d+\s*kg\s*bags?|\d+\s*x\s*\d+\s*kg\s*bags?)", text),
            "recurring_quantity_raw": match(r"(\d+(?:\.\d+)?\s*kg/month)", text),
            "quantity_raw": row.get("quantity_raw"),
            "frequency_raw": row.get("buying_frequency_raw"),
            "long_term_intent": bool(re.search(r"long[- ]term|future monthly|as distribution scales", text, re.I)) if direct else None,
        },
        "product": {
            "terms": row.get("product_terms", []),
            "form": product_form(text),
            "certification_or_grade_terms": row.get("certification_or_grade_terms", []),
            "packaging_raw": row.get("packaging_raw"),
            "intended_use": [name for name, pattern in (("cafe", r"\bcaf[eé]"), ("retail", r"\bretail"), ("distribution", r"distribut"), ("food_service", r"food service"), ("smoothies", r"smoothie")) if re.search(pattern, text, re.I)],
            "temperature_constraint": "non_refrigerated" if re.search(r"doesn.?t need to be transported in refrigerated", text, re.I) else None,
        },
        "commercial": {
            "amount_raw": row.get("amount_raw"),
            "price_or_quote_requested": bool(re.search(r"price|pricing|quote|quotation|FOB|CIF", text, re.I)) if direct else None,
            "moq_requested": bool(re.search(r"\bMOQ\b", text, re.I)) if direct else None,
            "sample_requested": bool(re.search(r"sample availability|sample for evaluation", text, re.I)) if direct else None,
            "incoterms": [term for term in ("FOB", "CIF") if re.search(rf"\b{term}\b", text, re.I)],
        },
        "logistics": {
            "destination_raw": match(r"Delivery\s*:\s*([^\n]+?)(?:Kindly share|$)", text),
            "lead_time_requested": bool(re.search(r"lead time", text, re.I)) if direct else None,
        },
        "access": {
            "contact_gate": row.get("contact_gate"),
            "channel_url": row.get("access_channel_url") or row.get("source_url"),
        },
        "evidence": {
            "verification_status": row.get("verification_status"),
            "snapshot_sha256": row.get("snapshot_sha256"),
            "snapshot_path": row.get("snapshot_path"),
            "observed_at": row.get("observed_at"),
        },
        "quality": {
            "direct_demand_requires_corroboration": direct,
            "is_background_only": not direct,
        },
    }


def flatten(value: Any, prefix: str = "") -> dict[str, Any]:
    if not isinstance(value, dict):
        return {prefix: value}
    result: dict[str, Any] = {}
    for key, child in value.items():
        result.update(flatten(child, f"{prefix}.{key}" if prefix else key))
    return result


def main() -> int:
    root = Path(__file__).with_name("data_v2")
    run = sorted(path for path in root.iterdir() if path.is_dir())[-1]
    rows = [json.loads(line) for line in (run / "accepted_records.jsonl").read_text(encoding="utf-8").splitlines()]

    kept: dict[str, dict[str, Any]] = {}
    duplicates: list[dict[str, Any]] = []
    for row in rows:
        if row.get("record_kind") == "DIRECT_BUY_REQUIREMENT":
            key_text = f"{norm(row.get('buyer_name_raw'))}|{norm(row.get('description_raw'))}"
        else:
            key_text = f"{row.get('source_code')}|{row.get('source_url')}|{row.get('title')}"
        key = hashlib.sha256(key_text.encode()).hexdigest()
        previous = kept.get(key)
        if previous:
            candidate_date = row.get("published_at") or ""
            previous_date = previous.get("published_at") or ""
            winner, loser = (row, previous) if candidate_date > previous_date else (previous, row)
            kept[key] = winner
            duplicates.append({
                "decision": "DUPLICATE_SIGNAL",
                "kept_url": winner.get("source_url"),
                "duplicate_url": loser.get("source_url"),
                "buyer_name_raw": winner.get("buyer_name_raw"),
                "reason": "same normalized buyer and requirement description",
            })
        else:
            kept[key] = row

    final = [enrich(row) for row in kept.values()]
    with (run / "final_records.jsonl").open("w", encoding="utf-8") as handle:
        for row in final:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    (run / "dedupe_audit.json").write_text(json.dumps(duplicates, ensure_ascii=False, indent=2), encoding="utf-8")

    fields = sorted({key for row in final for key in flatten(row)})
    kinds = sorted({row["source"]["record_kind"] for row in final})
    totals = Counter(row["source"]["record_kind"] for row in final)
    coverage: dict[str, Counter[str]] = defaultdict(Counter)
    for row in final:
        kind = row["source"]["record_kind"]
        for field, value in flatten(row).items():
            if value is not None and value != "" and value != []:
                coverage[field][kind] += 1
    with (run / "final_field_ledger.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["field_code", *kinds])
        for field in fields:
            writer.writerow([field, *[f"{coverage[field][kind]}/{totals[kind]}" for kind in kinds]])

    result = {
        "run": run.name,
        "final_count": len(final),
        "direct_requirement_count": sum(row["source"]["record_kind"] == "DIRECT_BUY_REQUIREMENT" for row in final),
        "deduplicated_count": len(duplicates),
        "field_count": len(fields),
        "counts_by_kind": dict(Counter(row["source"]["record_kind"] for row in final)),
    }
    (run / "final_summary.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
