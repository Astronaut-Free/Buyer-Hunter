"""Precision re-audit for TED multilingual full-text matches."""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path


EXACT = {
    "MATCHA": re.compile(r"(?<![\w-])matcha(?![\w-])", re.I),
    "BLUEBERRY": re.compile(r"(?<![\w-])blueberr(?:y|ies)(?![\w-])", re.I),
    "ROSA_ROXBURGHII": re.compile(r"(?<![\w-])(?:rosa\s+roxburghii|cili\s+fruit|chestnut\s+rose)(?![\w-])", re.I),
    "CHILI": re.compile(r"(?<![\w-])(?:chili|chilli|capsicum|paprika)(?![\w-])", re.I),
    "TEA": re.compile(r"(?<![\w-])(?:green\s+tea|black\s+tea|oolong\s+tea|tea\s+leaves)(?![\w-])", re.I),
}
FOOD_CONTEXT = re.compile(r"\b(?:food|beverage|drink|spice|sauce|vegetable|fruit|condiment|seasoning|canned|meal|meat|ingredient|grocery|catering|tea|coffee)\b", re.I)


def main() -> int:
    root = Path(__file__).with_name("data_ted")
    runs = sorted(root.glob("*"), reverse=True)
    if not runs:
        raise SystemExit("No TED run found")
    run = runs[0]
    source = run / "TED_五品类_有效采购公告.csv"
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    audited = []
    for row in rows:
        text = f"{row.get('title', '')} {row.get('description_raw', '')}"
        exact = bool(EXACT[row["category_code"]].search(text))
        context = bool(FOOD_CONTEXT.search(text))
        row["exact_word_match"] = exact
        row["food_context_match"] = context
        row["qualification_status"] = "QUALIFIED_OFFICIAL_PROCUREMENT" if exact and context else "REJECT_FULLTEXT_FALSE_POSITIVE"
        row["qualification_reason_zh"] = "精确产品词与食品采购语境同时命中" if exact and context else "TED全文词干命中，但缺少精确产品词或食品采购语境"
        audited.append(row)
    columns = list(audited[0].keys()) if audited else []
    with (run / "TED_五品类_精准复核.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(audited)
    qualified = [r for r in audited if r["qualification_status"] == "QUALIFIED_OFFICIAL_PROCUREMENT"]
    with (run / "TED_五品类_精准有效采购公告.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(qualified)
    summary = {
        "input_count": len(rows), "qualified_count": len(qualified),
        "false_positive_count": len(rows) - len(qualified),
        "qualified_by_category": dict(Counter(r["category_code"] for r in qualified)),
        "rule": "exact word boundary AND food procurement context",
    }
    (run / "precision_audit_summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
