"""Apply deterministic relevance gates to the latest SAM sample."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


EXCLUDE = re.compile(
    r"steam|team|teacher|teardown|homestead|assateage|unsteady|STEA|"
    r"refrigeration wall|market analysis|cook-serve|equipment|installation|"
    r"food service worker|nutrition and food services|concessions business|"
    r"food warmin|regulatory management|IT interfacing",
    re.I,
)
COMMODITY = re.compile(
    r"food products|subsistence food|subsistence requirements|shell eggs|"
    r"ham|pork|turkey|dry bean|rice|peas|lentils|corn-soy|misc food items|"
    r"food contract|food delivery service|\bfood\b",
    re.I,
)


def main() -> int:
    root = Path(__file__).with_name("data_sam")
    run = sorted(path for path in root.iterdir() if path.is_dir())[-1]
    rows = [json.loads(line) for line in (run / "records.jsonl").read_text(encoding="utf-8").splitlines()]
    accepted = []
    rejected = []
    for row in rows:
        title = str(row.get("title") or "")
        if EXCLUDE.search(title):
            rejected.append({"title": title, "reason": "semantic_false_positive_or_noncommodity"})
        elif COMMODITY.search(title):
            row["relevance_status"] = "ACCEPTED_COMMODITY_OR_DELIVERY"
            row["product_fit_status"] = "NEEDS_LINE_ITEM_REVIEW"
            accepted.append(row)
        else:
            rejected.append({"title": title, "reason": "insufficient_product_evidence"})

    with (run / "accepted_records.jsonl").open("w", encoding="utf-8") as handle:
        for row in accepted:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    (run / "rejected_records.json").write_text(json.dumps(rejected, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = {
        "raw_count": len(rows),
        "accepted_count": len(accepted),
        "rejected_count": len(rejected),
        "accepted_by_query": dict(Counter(row["query_term"] for row in accepted)),
        "matcha_or_blueberry_exact_count": sum(bool(re.search(r"\b(matcha|blueberr(?:y|ies))\b", str(row.get("title") or ""), re.I)) for row in accepted),
        "quality_note": "Accepted SAM records are adjacent food procurement leads; line items must be checked before claiming product fit.",
    }
    (run / "clean_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
