"""Reapply precision fixes to the latest EC21 regional collection."""

from __future__ import annotations

import csv
import json
from pathlib import Path

import collect_ec21_regions as regional


def matches(category: str, text: str, taxonomy: dict[str, dict]) -> bool:
    if category == "CHILI" and any(term in text.casefold() for term in ("chili flakes", "chilli flakes")):
        return True
    return regional.product_matches(category, text, taxonomy)


def main() -> int:
    root = Path(__file__).with_name("data_ec21_regions")
    run = sorted(path for path in root.iterdir() if path.is_dir())[-1]
    source = run / "EC21_美国日本欧洲_全量.csv"
    taxonomy = regional.load_taxonomy()
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        text = f"{row.get('title', '')} {row.get('description_raw', '')}"
        row["exact_product_match"] = matches(row["category_code"], text, taxonomy)
        row["origin_fit_gap"] = bool(regional.ORIGIN_RESTRICTION.search(text))
        row["age_days"] = int(row["age_days"]) if row.get("age_days") else None
        decision, reason = regional.qualify(row, __import__("datetime").date.today())
        row["qualification_status"] = decision
        row["qualification_reason_zh"] = reason
    columns = list(rows[0].keys()) if rows else []
    qualified_statuses = {"QUALIFIED_SIGNAL", "QUALIFIED_SIGNAL_NEEDS_IDENTITY"}
    for filename, output_rows in (
        ("EC21_美国日本欧洲_复审全量.csv", rows),
        ("EC21_美国日本欧洲_精准需求.csv", [row for row in rows if row["qualification_status"] in qualified_statuses]),
    ):
        with (run / filename).open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns)
            writer.writeheader()
            writer.writerows(output_rows)
    summary = {
        "run": str(run),
        "raw": len(rows),
        "qualified": sum(row["qualification_status"] in qualified_statuses for row in rows),
        "qualified_by_region": {
            region: sum(row["market_region"] == region and row["qualification_status"] in qualified_statuses for row in rows)
            for region in ("US", "JAPAN", "EUROPE")
        },
    }
    (run / "reaudit_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
