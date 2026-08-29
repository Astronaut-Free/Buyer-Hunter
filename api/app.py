"""FastAPI read API for seller-specific opportunity decisions."""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "runtime/buyer_hunter.db"

app = FastAPI(title="Buyer Hunter Opportunity Decision API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:4173", "http://127.0.0.1:4174", "http://localhost:4173", "http://localhost:4174"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


def database_path() -> Path:
    return Path(os.environ.get("BUYER_HUNTER_DB", DEFAULT_DB))


def connect() -> sqlite3.Connection:
    path = database_path()
    if not path.exists():
        raise HTTPException(503, "Decision store is missing; run pipeline/build_opportunity_store_v1.py")
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def loads(value: str | None, default: Any) -> Any:
    return json.loads(value) if value else default


def first_category(product_terms_json: str | None) -> str:
    terms = loads(product_terms_json, [])
    return terms[0] if isinstance(terms, list) and terms else ""


def summary_from(row: sqlite3.Row, full: bool) -> dict[str, Any]:
    return {
        "id": row["opportunity_id"],
        "rank": row["rank_position"],
        "buyer_display_name": row["canonical_name"],
        "country_code": row["country_code"],
        "demand_title": row["title"],
        "category_code": first_category(row["product_terms_json"]),
        "quantity_raw": row["quantity_raw"] or "未披露",
        "published_at": row["published_at"],
        "decision_status": row["decision_status"],
        "opportunity_score": row["opportunity_score"],
        "truth_score": row["truth_score"],
        "why_now": loads(row["why_now_json"], []),
        "next_action_summary": loads(row["next_action_json"], {}).get("summary", ""),
        "decision_access": "FULL" if full else "SUMMARY",
        "lead_access_status": "UNAVAILABLE",
        "seller_fit_score": row["seller_fit_score"],
        "data_mode": row["data_mode"],
    }


BASE_QUERY = """
SELECT od.*, o.risk_json, o.primary_signal_id, b.canonical_name, b.country_code,
       s.product_terms_json, s.published_at, e.title, e.url AS evidence_url,
       e.excerpt, e.observed_at, e.data_mode,
       (SELECT raw_value FROM field_observation fo
         WHERE fo.owner_type='SIGNAL' AND fo.owner_id=s.id AND fo.field_code='quantity_raw' LIMIT 1) AS quantity_raw
FROM opportunity_decision od
JOIN opportunity o ON o.id=od.opportunity_id
JOIN buyer b ON b.id=o.buyer_id
JOIN signal s ON s.id=o.primary_signal_id
JOIN signal_evidence se ON se.signal_id=s.id AND se.evidence_role='PRIMARY'
JOIN evidence e ON e.id=se.evidence_id
"""


@app.get("/health")
def health() -> dict[str, Any]:
    with closing(connect()) as conn:
        row = conn.execute("SELECT COUNT(*) AS count, MAX(decision_date) AS latest FROM opportunity_decision").fetchone()
        run = conn.execute(
            "SELECT status, completed_at FROM crawl_run ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    return {
        "status": "ok",
        "decision_count": row["count"],
        "latest_decision_date": row["latest"],
        "last_pipeline_run": dict(run) if run else None,
    }


@app.get("/api/v1/opportunities/recent")
def recent_opportunities(limit: int = Query(12, ge=1, le=50)) -> dict[str, Any]:
    """Newest observed demand first — the source for the "found N ago" ticker."""
    with closing(connect()) as conn:
        rows = conn.execute(
            BASE_QUERY + " ORDER BY e.observed_at DESC, s.published_at DESC, od.opportunity_id LIMIT ?",
            (limit,),
        ).fetchall()
        latest_observed = conn.execute("SELECT MAX(observed_at) FROM evidence").fetchone()[0]
        run = conn.execute(
            "SELECT status, completed_at, opportunity_count, buyer_count FROM crawl_run ORDER BY created_at DESC LIMIT 1"
        ).fetchone()
    items = [
        {
            "id": row["opportunity_id"],
            "buyer_display_name": row["canonical_name"],
            "country_code": row["country_code"],
            "demand_title": row["title"],
            "category_code": first_category(row["product_terms_json"]),
            "observed_at": row["observed_at"],
            "published_at": row["published_at"],
            "opportunity_score": row["opportunity_score"],
            "truth_score": row["truth_score"],
            "decision_status": row["decision_status"],
            "data_mode": row["data_mode"],
        }
        for row in rows
    ]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "latest_observed_at": latest_observed,
        "last_pipeline_run": dict(run) if run else None,
        "items": items,
    }


@app.get("/api/v1/opportunities/today")
def today_opportunities(
    seller_profile_id: str = Query(...),
    limit: int = Query(5, ge=1, le=20),
    category_code: str | None = Query(default=None, pattern="^(MATCHA|BLUEBERRY|ROSA_ROXBURGHII|CHILI|TEA)$"),
    market_code: str | None = Query(default=None, pattern="^(US|JP|GB|AU|EU)$"),
    x_demo_member: str | None = Header(default=None),
) -> dict[str, Any]:
    full = x_demo_member == "true"
    with closing(connect()) as conn:
        latest = conn.execute(
            "SELECT MAX(decision_date) FROM opportunity_decision WHERE seller_capability_profile_id=?",
            (seller_profile_id,),
        ).fetchone()[0]
        if not latest:
            raise HTTPException(404, "Seller profile has no decisions")

        clauses = ["od.seller_capability_profile_id=?", "od.decision_date=?", "od.decision_status!='PASS'"]
        params: list[Any] = [seller_profile_id, latest]
        if category_code:
            clauses.append("json_extract(s.product_terms_json, '$[0]')=?")
            params.append(category_code)
        if market_code == "EU":
            eu_codes = ["DE", "NL", "FR", "IT", "ES", "PL", "BE", "FI", "HU"]
            clauses.append(f"b.country_code IN ({','.join('?' for _ in eu_codes)})")
            params.extend(eu_codes)
        elif market_code:
            clauses.append("b.country_code=?")
            params.append(market_code)
        params.append(limit)
        rows = conn.execute(
            BASE_QUERY + " WHERE " + " AND ".join(clauses) + " ORDER BY od.opportunity_score DESC, od.opportunity_id LIMIT ?",
            params,
        ).fetchall()

    items = []
    for rank, row in enumerate(rows, 1):
        item = summary_from(row, full)
        item["rank"] = rank
        items.append(item)
    return {
        "decision_date": latest,
        "seller_profile_id": seller_profile_id,
        "category_code": category_code,
        "market_code": market_code,
        "data_mode": "LIVE_PIPELINE",
        "items": items,
    }

@app.get("/api/v1/opportunities/{opportunity_id}/decision")
def opportunity_decision(opportunity_id: str, x_demo_member: str | None = Header(default=None)) -> dict[str, Any]:
    full = x_demo_member == "true"
    with closing(connect()) as conn:
        row = conn.execute(BASE_QUERY + " WHERE od.opportunity_id=? ORDER BY od.created_at DESC LIMIT 1", (opportunity_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Opportunity not found")
        result = summary_from(row, full)
        if not full:
            return result
        match_rows = conn.execute(
            """SELECT r.field_code, r.requirement_type, r.operator, r.value_json, r.hard,
                      mr.seller_value_json, mr.status, mr.reason
               FROM requirement r LEFT JOIN match_result mr ON mr.requirement_id=r.id AND mr.opportunity_id=?
               WHERE r.signal_id=? ORDER BY r.rowid""",
            (opportunity_id, row["primary_signal_id"]),
        ).fetchall()
    result.update(
        {
            "hard_gate_passed": bool(row["hard_gate_passed"]),
            "component_scores": {
                "timing": row["timing_score"],
                "seller_fit": row["seller_fit_score"],
                "commercial_execution": row["commercial_execution_score"],
                "procurement_channel_actionability": row["procurement_channel_actionability_score"],
                "market_access": row["market_access_score"],
            },
            "gaps": loads(row["gaps_json"], []),
            "blockers": loads(row["blockers_json"], []),
            "risks": loads(row["risk_json"], []),
            "evidence": [{"source_url": row["evidence_url"], "claim": row["excerpt"], "observed_at": row["observed_at"]}],
            "match_results": [{"field_code": item["field_code"], "requirement_type": item["requirement_type"], "operator": item["operator"], "buyer_value": loads(item["value_json"], None), "seller_value": loads(item["seller_value_json"], None), "status": item["status"] or "UNKNOWN", "hard": bool(item["hard"]), "reason": item["reason"] or "未计算"} for item in match_rows],
            "next_action": loads(row["next_action_json"], {}),
            "ruleset_version": row["ruleset_version"],
        }
    )
    return result


@app.get("/api/v1/opportunities/{opportunity_id}/access-channels")
def access_channels(opportunity_id: str, x_lead_access: str | None = Header(default=None)) -> list[dict[str, Any]]:
    if x_lead_access != "granted":
        raise HTTPException(403, "Lead Access credit required")
    with closing(connect()) as conn:
        exists = conn.execute("SELECT 1 FROM opportunity WHERE id=?", (opportunity_id,)).fetchone()
        if not exists:
            raise HTTPException(404, "Opportunity not found")
        rows = conn.execute(
            """SELECT bac.channel_type AS type, bac.channel_value AS value, e.url AS source_url, bac.verified_at
               FROM buyer_access_channel bac JOIN evidence e ON e.id=bac.evidence_id
               JOIN opportunity o ON o.buyer_id=bac.buyer_id WHERE o.id=? AND bac.active=1""",
            (opportunity_id,),
        ).fetchall()
    return [dict(row) for row in rows]
