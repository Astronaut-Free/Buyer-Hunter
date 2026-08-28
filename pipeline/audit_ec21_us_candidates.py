"""Audit EC21 US candidates against Buyer Hunter's demo acceptance rules."""

from __future__ import annotations

import argparse
import csv
import re
from datetime import date, datetime
from pathlib import Path


TERMS = {
    "MATCHA": ("matcha",),
    "BLUEBERRY": ("blueberry", "blueberries"),
    "ROSA_ROXBURGHII": ("rosa roxburghii", "cili fruit", "chestnut rose", "burr rose", "chinquapin rose"),
    "CHILI": ("chili", "chilli", "red pepper", "capsicum", "paprika", "gochujang"),
    "TEA": ("tea",),
}
QUANTITY = re.compile(r"\b\d[\d,.]*\s*(?:kg|kgs|mt|tons?|containers?|cases?|packs?|pieces?|pcs)\b", re.I)
SPECIFICATION = re.compile(r"\b(?:food-grade|organic|certificate|packaging|shelf life|FOB|CIF|USDA|specification)\b", re.I)


def latest_run(root: Path) -> Path:
    runs = sorted(path for path in root.iterdir() if path.is_dir())
    if not runs:
        raise SystemExit(f"No EC21 run found under {root}")
    return runs[-1]


def exact_product_match(category: str, text: str) -> bool:
    folded = text.casefold()
    return any(term in folded for term in TERMS.get(category, ()))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path)
    parser.add_argument("--as-of", default=date.today().isoformat())
    args = parser.parse_args()

    run = args.run or latest_run(Path(__file__).with_name("data_ec21"))
    as_of = date.fromisoformat(args.as_of)
    source = run / "EC21_美国买家候选.csv"
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    audited = []
    for row in rows:
        text = f"{row.get('title', '')} {row.get('description_raw', '')}"
        published = datetime.strptime(row["published_at"], "%Y-%m-%d").date() if row.get("published_at") else None
        age_days = (as_of - published).days if published else None
        product_match = exact_product_match(row.get("category_code", ""), text)
        origin_gap = bool(re.search(r"\bKorean\b", text, re.I))

        demand_score = 0
        if row.get("record_kind") == "DIRECT_BUY_REQUIREMENT" and product_match:
            demand_score = 20
            if QUANTITY.search(text) or SPECIFICATION.search(text):
                demand_score = 25
        identity_score = 25 if row.get("buyer_identity_claim_raw") else 10
        if age_days is None:
            recency_score = 0
        elif age_days <= 90:
            recency_score = 25
        elif age_days <= 365:
            recency_score = 20
        elif age_days <= 730:
            recency_score = 10
        else:
            recency_score = 0
        contact_score = 10 if row.get("contact_gate") else 0
        total_score = demand_score + identity_score + recency_score + contact_score

        if not product_match:
            decision = "REJECT_PRODUCT_MISMATCH"
            reason = "品类词仅出现在无关上下文或页面噪声中"
        elif age_days is None or age_days > 365:
            decision = "WATCHLIST_STALE"
            reason = "发布超过365天，只保留历史研究价值"
        elif origin_gap:
            decision = "GAP_ORIGIN_REQUIREMENT"
            reason = "需求明确指定韩国产品，贵州产品需先确认可否替代或贴牌"
        elif not row.get("buyer_identity_claim_raw"):
            decision = "NEEDS_BUYER_IDENTITY_UNLOCK"
            reason = "需求较新且品类命中，但公开页未披露买家公司/联系人"
        else:
            decision = "QUALIFIED_FOR_OUTREACH"
            reason = "品类、时效、买方身份和联系入口达到演示验收线"

        enriched = dict(row)
        enriched.update({
            "as_of": as_of.isoformat(),
            "age_days": age_days,
            "exact_product_match": str(product_match).lower(),
            "origin_fit_gap": str(origin_gap).lower(),
            "demand_evidence_score_25": demand_score,
            "buyer_identity_score_25": identity_score,
            "recency_score_25": recency_score,
            "contactability_score_25": contact_score,
            "four_dimension_score_100": total_score,
            "audit_decision": decision,
            "audit_reason_zh": reason,
        })
        audited.append(enriched)

    columns = list(audited[0].keys()) if audited else []
    audit_path = run / "EC21_美国候选_逐条审计.csv"
    qualified_path = run / "EC21_美国候选_可直接触达.csv"
    for path, output_rows in (
        (audit_path, audited),
        (qualified_path, [row for row in audited if row["audit_decision"] == "QUALIFIED_FOR_OUTREACH"]),
    ):
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns)
            writer.writeheader()
            writer.writerows(output_rows)

    counts: dict[str, int] = {}
    for row in audited:
        counts[row["audit_decision"]] = counts.get(row["audit_decision"], 0) + 1
    print(f"run={run}")
    print(f"audited={len(audited)} qualified={sum(r['audit_decision'] == 'QUALIFIED_FOR_OUTREACH' for r in audited)}")
    for key in sorted(counts):
        print(f"{key}={counts[key]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
