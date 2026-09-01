"""Turn the latest V2 probe into quality-gated records and a field ledger."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup


EXCLUDE_BLUEBERRY_CONTEXT = re.compile(r"balloon|glove|vape|puff|shoe|car air freshener", re.I)


def text(node: Any) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip() if node else ""


def li_map(soup: BeautifulSoup) -> dict[str, str]:
    values: dict[str, str] = {}
    for item in soup.select(".bo-attr-cont li"):
        label = item.find("span")
        if not label:
            continue
        key = text(label)
        label.extract()
        values[key] = text(item)
    return values


def iso_date(raw: str | None) -> str | None:
    if not raw or raw.lower().startswith("over"):
        return None
    for pattern in ("%d %b, %Y", "%b-%d-%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, pattern).date().isoformat()
        except ValueError:
            pass
    return None


def terms(value: str) -> list[str]:
    return [term for term in ("matcha", "blueberry", "blueberries", "tea", "food", "beverage") if re.search(rf"\b{term}\b", value, re.I)]


def parse_tradewheel_detail(probe: dict[str, Any]) -> dict[str, Any] | None:
    path = Path(probe["snapshot_path"])
    soup = BeautifulSoup(path.read_bytes(), "html.parser")
    title = text(soup.select_one("h1.buyoffer-title"))
    if not title:
        return None
    description = text(soup.select_one("p.b-desc"))
    combined = f"{title} {description}"
    if "blueberr" in combined.lower() and EXCLUDE_BLUEBERRY_CONTEXT.search(combined):
        return None
    product_terms = terms(combined)
    if not ({"matcha", "blueberry", "blueberries"} & set(product_terms)):
        return None
    attributes = li_map(soup)
    certifications = [
        name for name, pattern in (
            ("organic", r"\borganic\b"),
            ("food_grade", r"food[- ]grade"),
            ("ceremonial_grade", r"ceremonial"),
            ("private_label_oem", r"private label|\boem\b"),
        ) if re.search(pattern, combined, re.I)
    ]
    quantity = attributes.get("Quantity Required")
    if quantity == "-":
        quantity = None
    packaging_match = re.search(r"(?:packed in|packaging(?: options?)?)[\s:]+([^.;]{2,160})", description, re.I)
    return {
        "source_code": probe["source_code"],
        "source_url": probe["url"],
        "record_kind": "DIRECT_BUY_REQUIREMENT",
        "verification_status": "UNVERIFIED_MARKETPLACE_POST",
        "title": title,
        "buyer_name_raw": attributes.get("Purchaser"),
        "buyer_country_raw": attributes.get("Country/Region"),
        "published_at_raw": attributes.get("Date Posted"),
        "published_at": iso_date(attributes.get("Date Posted")),
        "quantity_raw": quantity,
        "buying_frequency_raw": attributes.get("Buying Frequency"),
        "packaging_raw": packaging_match.group(1).strip() if packaging_match else None,
        "certification_or_grade_terms": certifications,
        "product_terms": product_terms,
        "description_raw": description,
        "contact_gate": "registration_required",
        "snapshot_sha256": probe.get("snapshot_sha256"),
        "snapshot_path": probe.get("snapshot_path"),
        "observed_at": probe.get("observed_at"),
        "data_mode": "LIVE",
    }


def normalize(record: dict[str, Any]) -> dict[str, Any]:
    kind = record.get("record_kind")
    direct = kind in {"DIRECT_BUY_REQUIREMENT", "DIRECT_PROCUREMENT_OPPORTUNITY"}
    country = record.get("buyer_country_raw")
    country_code = "US" if country and re.search(r"USA|United States", str(country), re.I) else None
    return {
        "source": {
            "code": record.get("source_code"),
            "url": record.get("source_url"),
            "record_kind": kind,
            "data_mode": record.get("data_mode", "LIVE"),
        },
        "buyer": {
            "name_raw": record.get("buyer_name_raw"),
            "country_raw": country,
            "country_code": country_code,
            "supplier_name_raw": record.get("supplier_name_raw"),
        },
        "requirement": {
            "is_direct_demand": direct,
            "title": record.get("title"),
            "description_raw": record.get("description_raw"),
            "product_terms": record.get("product_terms", []),
            "quantity_raw": record.get("quantity_raw"),
            "amount_raw": record.get("amount_raw"),
            "frequency_raw": record.get("buying_frequency_raw"),
            "packaging_raw": record.get("packaging_raw"),
            "certification_or_grade_terms": record.get("certification_or_grade_terms", []),
            "published_at": record.get("published_at") or iso_date(record.get("published_at_raw")),
        },
        "access": {
            "contact_gate": record.get("contact_gate"),
            "channel_url": record.get("access_channel_url") or record.get("source_url"),
        },
        "evidence": {
            "verification_status": record.get("verification_status"),
            "snapshot_sha256": record.get("snapshot_sha256"),
            "snapshot_path": record.get("snapshot_path"),
            "observed_at": record.get("observed_at"),
        },
    }


def flatten(value: Any, prefix: str = "") -> dict[str, Any]:
    result: dict[str, Any] = {}
    if isinstance(value, dict):
        for key, child in value.items():
            result.update(flatten(child, f"{prefix}.{key}" if prefix else key))
    else:
        result[prefix] = value
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", default=str(Path(__file__).with_name("data_v2")))
    parser.add_argument("--run")
    args = parser.parse_args()
    root = Path(args.data_root)
    run = root / args.run if args.run else sorted((path for path in root.iterdir() if path.is_dir()))[-1]
    probes = json.loads((run / "probe_results.json").read_text(encoding="utf-8"))
    original = [json.loads(line) for line in (run / "records.jsonl").read_text(encoding="utf-8").splitlines()]

    cleaned = [row for row in original if not row["source_code"].startswith("tradewheel")]
    for probe in probes:
        if probe["source_code"].startswith("tradewheel") and probe.get("snapshot_path") and probe.get("status") == "FETCHED":
            parsed = parse_tradewheel_detail(probe)
            if parsed:
                cleaned.append(parsed)

    unique: dict[str, dict[str, Any]] = {}
    for row in cleaned:
        key = hashlib.sha256(f"{row.get('source_code')}|{row.get('source_url')}|{row.get('title')}".encode()).hexdigest()
        unique[key] = row
    cleaned = list(unique.values())
    normalized = [normalize(row) for row in cleaned]

    with (run / "accepted_records.jsonl").open("w", encoding="utf-8") as handle:
        for row in cleaned:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    with (run / "normalized_records.jsonl").open("w", encoding="utf-8") as handle:
        for row in normalized:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    fields = sorted({field for row in normalized for field in flatten(row)})
    kinds = sorted({str(row["source"]["record_kind"]) for row in normalized})
    totals = Counter(str(row["source"]["record_kind"]) for row in normalized)
    coverage: dict[str, Counter[str]] = defaultdict(Counter)
    for row in normalized:
        kind = str(row["source"]["record_kind"])
        for field, value in flatten(row).items():
            if value is not None and value != "" and value != []:
                coverage[field][kind] += 1
    with (run / "field_ledger.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["field_code", *kinds])
        for field in fields:
            writer.writerow([field, *[f"{coverage[field][kind]}/{totals[kind]}" for kind in kinds]])

    summary = {
        "run": run.name,
        "accepted_count": len(cleaned),
        "counts_by_kind": dict(Counter(row["record_kind"] for row in cleaned)),
        "direct_requirement_count": sum(row["record_kind"] == "DIRECT_BUY_REQUIREMENT" for row in cleaned),
        "field_count": len(fields),
        "quality_rules": [
            "public boundary pages are excluded from records",
            "blueberry non-food homonyms are excluded",
            "marketplace posts remain unverified until corroborated",
            "buyer directories and historical purchases are background evidence, not direct demand",
        ],
    }
    (run / "quality_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
