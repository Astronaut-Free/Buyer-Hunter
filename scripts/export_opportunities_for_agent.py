"""Bridge: Free pipeline SQLite decision store -> agent/ runtime opportunity feed.

The Python pipeline (A1 collection -> clean/score -> A3/A4/A5 decision) writes
`runtime/buyer_hunter.db`. The Node agent runtime (A2/A6) reads a flat JSON array
of opportunities. This script is the one-way v1 bridge between them.

    python scripts/export_opportunities_for_agent.py [--db PATH] [--out PATH]

It writes:
  - agent/db/opportunities.json       flat array, shape consumed by agent/server/repository.js
  - agent/db/opportunities.meta.json  provenance (source db, row count, ruleset, exported_at)

Only non-PASS decisions are exported (PASS = truth below gate or hard conflict,
i.e. "do not spend sales time" - not an opportunity to develop).

Contract: contracts/opportunity-bridge-v1.md
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "runtime" / "buyer_hunter.db"
DEFAULT_OUT = ROOT / "agent" / "db" / "opportunities.json"

SELLER = {"id": "seller-guizhou-specialty-demo", "name": "贵州特色农产品出口企业（Demo）"}

QUERY = """
SELECT
  od.opportunity_id, od.decision_status, od.rank_position,
  od.truth_score, od.opportunity_score, od.seller_fit_score,
  od.timing_score, od.commercial_execution_score,
  od.procurement_channel_actionability_score, od.market_access_score,
  od.why_now_json, od.gaps_json, od.blockers_json, od.next_action_json,
  od.ruleset_version,
  b.id AS buyer_id, b.canonical_name, b.country_code, b.domain,
  s.id AS signal_id, s.product_terms_json, s.published_at, s.signal_type,
  e.url AS evidence_url, e.title AS demand_title, e.observed_at, e.data_mode,
  ssf.supply_pool_status, ssf.best_verdict, ssf.best_fit_score, ssf.summary_zh,
  (SELECT fo.raw_value FROM field_observation fo
     WHERE fo.owner_type='SIGNAL' AND fo.owner_id=s.id
       AND fo.field_code='quantity_raw' LIMIT 1) AS quantity_raw,
  (SELECT fo.raw_value FROM field_observation fo
     WHERE fo.owner_type='SIGNAL' AND fo.owner_id=s.id
       AND fo.field_code='destination_market' LIMIT 1) AS destination_market
FROM opportunity_decision od
JOIN opportunity o ON o.id = od.opportunity_id
JOIN buyer b ON b.id = o.buyer_id
JOIN signal s ON s.id = o.primary_signal_id
JOIN signal_evidence se ON se.signal_id = s.id AND se.evidence_role = 'PRIMARY'
JOIN evidence e ON e.id = se.evidence_id
LEFT JOIN seller_sku_fit ssf ON ssf.opportunity_id = od.opportunity_id
WHERE od.decision_status != 'PASS'
ORDER BY od.rank_position, od.opportunity_id
"""


def _loads(value: Any, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def _round(value: Any) -> float | None:
    try:
        return round(float(value), 1)
    except (TypeError, ValueError):
        return None


def _certifications(conn: sqlite3.Connection, signal_id: str) -> str | None:
    rows = conn.execute(
        "SELECT value_json FROM requirement "
        "WHERE signal_id=? AND requirement_type='CERTIFICATION'",
        (signal_id,),
    ).fetchall()
    values: set[str] = set()
    for (raw,) in rows:
        parsed = _loads(raw, [])
        values.update(str(v) for v in (parsed if isinstance(parsed, list) else [parsed]) if v)
    return ", ".join(sorted(values)) or None


def build_export_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Pure transform: decision store rows -> agent-shaped opportunity dicts."""
    conn.row_factory = sqlite3.Row
    out: list[dict[str, Any]] = []
    for row in conn.execute(QUERY):
        category = (_loads(row["product_terms_json"], [""]) or [""])[0]
        quantity = (row["quantity_raw"] or "").strip() or "未披露"
        why_now = [str(x) for x in _loads(row["why_now_json"], []) if str(x).strip()]
        gaps = [str(x) for x in _loads(row["gaps_json"], []) if str(x).strip()]
        next_action = _loads(row["next_action_json"], {})
        tags = [t for t in (category, row["quantity_raw"], row["country_code"]) if t]
        out.append(
            {
                "id": row["opportunity_id"],
                "seed_key": f"bridge:free:{row['opportunity_id']}",
                "source": "FREE_PIPELINE",
                "stage": "CONTACTED",
                "status": row["decision_status"],
                "decision": row["decision_status"],
                "buyer": {
                    "id": row["buyer_id"],
                    "name": row["canonical_name"],
                    "market": row["country_code"],
                    "domain": row["domain"] or None,
                },
                "seller": dict(SELLER),
                "fields": {
                    "product": category,
                    "demand_title": row["demand_title"],
                    "quantity": quantity,
                    "certification": _certifications(conn, row["signal_id"]),
                    "destination": row["destination_market"] or "UNKNOWN",
                },
                "fit_score": _round(row["seller_fit_score"]),
                "intent_score": _round(row["truth_score"]),
                "conversation_score": None,
                "opportunity_score": _round(row["opportunity_score"]),
                "truth_score": _round(row["truth_score"]),
                "component_scores": {
                    "timing": _round(row["timing_score"]),
                    "seller_fit": _round(row["seller_fit_score"]),
                    "commercial_execution": _round(row["commercial_execution_score"]),
                    "procurement_channel_actionability": _round(
                        row["procurement_channel_actionability_score"]
                    ),
                    "market_access": _round(row["market_access_score"]),
                },
                "why_now": "；".join(why_now),
                "gaps": gaps,
                "next_action": next_action.get("summary", ""),
                "supply_match": {
                    "pool_status": row["supply_pool_status"],
                    "verdict": row["best_verdict"],
                    "fit_score": _round(row["best_fit_score"]),
                    "summary": row["summary_zh"],
                }
                if row["supply_pool_status"]
                else None,
                "evidence_ids": [row["evidence_url"]] if row["evidence_url"] else [],
                "tags": tags,
                "ruleset_version": row["ruleset_version"],
                "data_mode": row["data_mode"],
            }
        )
    return out


def export(db_path: Path, out_path: Path) -> dict[str, Any]:
    if not db_path.exists():
        raise SystemExit(
            f"decision store not found: {db_path}\n"
            "run: python pipeline/build_opportunity_store_v1.py"
        )
    try:
        db_rel = db_path.resolve().relative_to(ROOT)
    except ValueError:
        raise SystemExit(f"错误：--db 必须在仓库目录内（{db_path}）")
    with sqlite3.connect(db_path) as conn:
        rows = build_export_rows(conn)
        ruleset = conn.execute(
            "SELECT ruleset_version FROM opportunity_decision LIMIT 1"
        ).fetchone()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    meta = {
        "source_db": str(db_rel),
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "row_count": len(rows),
        "ruleset_version": ruleset[0] if ruleset else None,
        "contract": "contracts/opportunity-bridge-v1.md",
        "direction": "free_pipeline -> agent (one-way, v1)",
    }
    out_path.with_name("opportunities.meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return meta


def main() -> int:
    parser = argparse.ArgumentParser(description="Export decision store for the agent runtime")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    meta = export(args.db, args.out)
    print(json.dumps(meta, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
