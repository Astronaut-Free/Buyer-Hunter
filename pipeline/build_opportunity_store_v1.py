"""Build a reproducible SQLite opportunity-decision store from qualified signals."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "pipeline") not in sys.path:
    sys.path.insert(0, str(ROOT / "pipeline"))

from opportunity_decision_engine_v1 import assess_opportunity  # noqa: E402
from supply_demand_fit_v1 import evaluate as evaluate_fit  # noqa: E402
from supply_demand_fit_v1 import load_catalog  # noqa: E402
from supply_demand_fit_v1 import parse_demand  # noqa: E402
from risk_items_v1 import classify_risk_items  # noqa: E402


INPUT_BASENAME = "qualified_pending_entity_opportunities.csv"
FULL_COLLECTION_DIR = ROOT / "pipeline/data_full_collection"
FIXTURE_INPUT = ROOT / "pipeline/tests/fixtures/full_collection" / INPUT_BASENAME
DEFAULT_PROFILE = ROOT / "pipeline/seller_capability_profile_demo_v1.json"
DEFAULT_DB = ROOT / "runtime/buyer_hunter.db"


def resolve_input() -> Path:
    """Newest full-collection run that produced the qualified-opportunities CSV.

    Falls back to the committed test fixture so a fresh clone with no local runs
    can still build a store. run_pipeline.py passes the fresh run path explicitly.
    """
    runs = (
        sorted((p for p in FULL_COLLECTION_DIR.glob("*") if p.is_dir()), reverse=True)
        if FULL_COLLECTION_DIR.exists()
        else []
    )
    for run in runs:
        candidate = run / INPUT_BASENAME
        if candidate.exists():
            return candidate
    if FIXTURE_INPUT.exists():
        return FIXTURE_INPUT
    raise SystemExit(
        "No full-collection run found. Run pipeline/run_pipeline.py "
        "(or pipeline/aggregate_full_collection_v1.py) first."
    )

COUNTRY_CODES = {
    "United States": "US", "United Kingdom": "GB", "Japan": "JP", "Australia": "AU",
    "Germany": "DE", "Netherlands": "NL", "France": "FR", "Italy": "IT", "Spain": "ES",
    "Poland": "PL", "Belgium": "BE", "Finland": "FI", "Hungary": "HU", "Oman": "OM",
    "United Arab Emirates": "AE", "Thailand": "TH", "Canada": "CA", "India": "IN",
}

CATEGORY_NAMES = {
    "MATCHA": "抹茶",
    "BLUEBERRY": "蓝莓",
    "ROSA_ROXBURGHII": "刺梨",
    "CHILI": "辣椒",
    "TEA": "茶",
}


def stable_id(prefix: str, value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}-{digest}"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_input_row(raw: dict[str, str]) -> dict[str, str]:
    """Map full-collection opportunity rows to the evidence-store contract."""
    row = dict(raw)
    description = row.get("description_raw", "")
    title = row.get("title", "")
    text = f"{title} {description}".casefold()
    source_url = row.get("source_url", "") or row.get("evidence_url", "")
    published = row.get("published_at", "")
    observed = row.get("observed_at", "") or utc_now()
    try:
        age_days = max(0, (datetime.fromisoformat(observed.replace("Z", "+00:00")).date() - date.fromisoformat(published[:10])).days)
    except (TypeError, ValueError):
        age_days = 999

    row.setdefault("signal_id", row.get("record_id", "") or stable_id("signal", source_url or f"{title}|{observed}"))
    row.setdefault("source_type", row.get("source_role", "") or "PUBLIC_RFQ")
    row.setdefault("buying_action", "BUY")
    row.setdefault("product_terms", row.get("category_code", ""))
    row.setdefault("specs_present", str(contains_any(text, ["specification", "specifications", "grade", "type:", "type :"])))
    row.setdefault("quantity_status", "DISCLOSED" if row.get("quantity_raw", "").strip() else "UNKNOWN")
    row.setdefault("quantity_source_span", row.get("quantity_raw", ""))
    row.setdefault("field_warnings", "")
    row.setdefault("destination_present", str(contains_any(text, ["destination", "destination port", "ship to", "delivery to"])))
    row.setdefault("buyer_name_source_span", row.get("buyer_name_raw", ""))
    row.setdefault("contact_person_source_span", row.get("contact_person_raw", ""))
    row.setdefault("buyer_country_source_span", row.get("buyer_country_raw", ""))
    row.setdefault("buyer_domain", "")
    row.setdefault("registration_id", "")
    row.setdefault("public_business_emails", "")
    row.setdefault("public_business_phones", "")
    row.setdefault("buyer_identity_status", "UNRESOLVED")
    row.setdefault("age_days", str(age_days))
    row.setdefault("time_precision", "DATE" if published else "UNKNOWN")
    row.setdefault("evidence_url", source_url)
    row.setdefault("listing_url", source_url)
    row.setdefault("evidence_excerpt", description[:1000] or title)
    row.setdefault("snapshot_sha256", hashlib.sha256(f"{source_url}|{title}|{description}".encode("utf-8")).hexdigest())
    row.setdefault("data_mode", "LIVE")
    row.setdefault("contact_gate", "platform_public_response" if source_url else "")
    return row


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return [normalize_input_row(row) for row in csv.DictReader(handle)]


def country_code_for(row: dict[str, str]) -> str:
    return row.get("buyer_country_code", "").strip() or COUNTRY_CODES.get(row.get("buyer_country_raw", "").strip(), "ZZ")


def buyer_display_name(row: dict[str, str]) -> str:
    if row.get("buyer_name_raw", "").strip():
        return row["buyer_name_raw"].strip()
    country = row.get("buyer_country_raw", "").strip() or "未知国家"
    contact = row.get("contact_person_raw", "").strip()
    suffix = f"（联系人：{contact}）" if contact else "（公司待核验）"
    return f"{country}{CATEGORY_NAMES.get(row['category_code'], row['category_code'])}采购方{suffix}"


def contains_any(text: str, needles: list[str]) -> bool:
    folded = text.casefold()
    return any(needle in folded for needle in needles)


def commercial_execution_score(row: dict[str, str]) -> float:
    """Score only disclosed terms that make the RFQ executable."""
    text = f"{row.get('title', '')} {row.get('description_raw', '')}".casefold()
    dimensions = {
        "specification": row.get("specs_present") == "True",
        "quantity": bool(row.get("quantity_raw", "").strip()),
        "purpose": contains_any(text, ["purpose", "application", "for retail", "for beverage", "for bakery"]),
        "destination": row.get("destination_present") == "True",
        "packaging": contains_any(text, ["packaging", "packing", "carton", "bag", "drum", "sachet"]),
        "certification": bool(extract_certifications(text)) or contains_any(text, ["certificate", "certification"]),
        "price_request": contains_any(text, ["quote", "quotation", "target price", "budget", "price offer"]),
        "payment_and_trade": contains_any(text, ["payment terms", "l/c", "letter of credit", "t/t", "shipping terms", "incoterm", "cif", "fob", "exw"]),
        "sample": contains_any(text, ["sample", "trial order"]),
        "oem": contains_any(text, ["oem", "private label", "custom label", "customized packaging"]),
    }
    return float(sum(10 for present in dimensions.values() if present))


def procurement_channel_actionability(row: dict[str, str]) -> float:
    if row.get("public_business_emails", "").strip() or row.get("public_business_phones", "").strip():
        return 95.0
    gate = row.get("contact_gate", "").strip().casefold()
    if gate and row.get("evidence_url", "").strip():
        return 70.0
    if row.get("evidence_url", "").strip():
        return 50.0
    return 0.0


def buying_window_fields(row: dict[str, str]) -> dict[str, Any]:
    text = f"{row.get('title', '')} {row.get('description_raw', '')}".casefold()
    quantity = row.get("quantity_raw", "").strip()
    if contains_any(text, ["long term", "long-term", "regular supply", "annual contract"]):
        stage = "LONG_TERM_SUPPLY"
    elif "trial order" in text:
        stage = "TRIAL_ORDER"
    elif "sample" in text:
        stage = "SAMPLE"
    elif quantity or contains_any(text, ["bulk", "wholesale", "quotation", "please quote"]):
        stage = "BULK_RFQ"
    elif row.get("specs_present") == "True":
        stage = "SPEC_CONFIRMATION"
    else:
        stage = "INQUIRY"

    continuity: list[str] = []
    if contains_any(text, ["long term", "long-term", "regular supply", "annual contract"]):
        continuity.append("LONG_TERM_SIGNAL")
    if contains_any(text, ["future volume", "larger order", "scale up", "monthly requirement"]):
        continuity.append("FUTURE_VOLUME_SIGNAL")
    age_days = int(row.get("age_days") or 999)
    return {
        "status": "OPEN" if age_days <= 30 else "CLOSED" if age_days > 60 else "MONITOR",
        "explicit_urgency": contains_any(text, ["urgent", "urgently", "asap", "immediate", "immediately"]),
        "transaction_stage": stage,
        "continuity_signals": continuity,
        "staleness": age_days > 60,
    }

def extract_certifications(text: str) -> list[str]:
    folded = text.casefold()
    found: list[str] = []
    patterns = {
        "USDA_ORGANIC": ["usda organic"],
        "EU_ORGANIC": ["eu organic", "e-coi", "ecoi"],
        "ORGANIC": [" organic"],
        "HACCP": ["haccp"],
        "ISO22000": ["iso 22000", "iso22000"],
    }
    for code, needles in patterns.items():
        if any(needle in folded for needle in needles):
            found.append(code)
    return found


def requirements_for(row: dict[str, str]) -> list[dict[str, Any]]:
    requirements: list[dict[str, Any]] = [
        {
            "field_code": "product.category_codes",
            "requirement_type": "PRODUCT",
            "operator": "IN",
            "value": [row["category_code"]],
            "hard": True,
        }
    ]
    country = country_code_for(row)
    if country:
        requirements.append(
            {
                "field_code": "market.target_codes",
                "requirement_type": "MARKET_ACCESS",
                "operator": "IN",
                "value": [country],
                "hard": False,
            }
        )
    if row.get("specs_present") == "True":
        requirements.append(
            {
                "field_code": "product.specification_text",
                "requirement_type": "PRODUCT",
                "operator": "EXISTS",
                "value": row.get("title") or row.get("product_terms"),
                "hard": False,
            }
        )
    for certification in extract_certifications(row.get("description_raw", "")):
        requirements.append(
            {
                "field_code": "certifications",
                "requirement_type": "CERTIFICATION",
                "operator": "IN",
                "value": [certification],
                "hard": False,
            }
        )
    return requirements


def opportunity_input(row: dict[str, str], buyer_id: str) -> dict[str, Any]:
    description = row.get("description_raw", "")
    has_entity = bool(row.get("buyer_name_raw", "").strip())
    country = country_code_for(row)
    target_markets = {"US", "JP", "GB", "AU", "DE", "NL", "FR", "IT", "ES", "PL", "BE", "FI", "HU"}
    gaps: list[str] = []
    if not has_entity:
        gaps.append("买家公司法定主体尚未核验")
    if not row.get("buyer_domain", "").strip():
        gaps.append("买家官方网站与公开商务渠道待补全")
    if extract_certifications(description):
        gaps.append("采购认证范围需由买家书面确认")

    why_now = [f"需求发布于 {row.get('age_days') or '未知'} 天前"]
    if row.get("quantity_raw", "").strip():
        why_now.append(f"已明确采购量：{row['quantity_raw'].strip()}")
    if row.get("destination_present") == "True":
        why_now.append("已披露交付目的地")

    destination_known = row.get("destination_present") == "True"
    market_access = 60.0 if destination_known and country in target_markets else 35.0 if country in target_markets else 25.0
    return {
        "opportunity_id": stable_id("opp", row["signal_id"]),
        "buyer_id": buyer_id,
        "truth_score": float(row["truth_score"]),
        "exact_product_match": True,
        "age_days": int(row.get("age_days") or 999),
        "buying_window": buying_window_fields(row),
        "requirements": requirements_for(row),
        "commercial_execution": commercial_execution_score(row),
        "procurement_channel_actionability": procurement_channel_actionability(row),
        "market_access": market_access,
        "why_now": why_now,
        "gaps": gaps,
        "next_action": {
            "action_type": "VERIFY_AND_PREPARE",
            "summary": "核验待确认项，同时准备匹配 SKU 的规格、报价与交付证明",
            "checklist": ["确认采购主体或平台账户", "确认最终规格与认证", "准备匹配 SKU 报价和样品方案"],
        },
    }

def normalized_profile(profile: dict[str, Any]) -> dict[str, Any]:
    copied = json.loads(json.dumps(profile))
    copied["attributes"]["product"]["category_codes"] = profile["category_codes"]
    copied["attributes"]["market"] = {"target_codes": profile["target_markets"] + ["DE", "NL", "FR", "IT", "ES", "PL", "BE", "FI", "HU"]}
    return copied


def insert_base_profile(conn: sqlite3.Connection, profile: dict[str, Any], now: str) -> None:
    template_id = "template-guizhou-specialty-v1"
    conn.execute(
        "INSERT INTO matching_template VALUES (?,?,?,?,?,?,?,?,?)",
        (template_id, "guizhou-specialty", "FOOD", "SPECIALTY_AGRI", None, "1.0", json.dumps({"type": "object"}), 1, now),
    )
    conn.execute(
        "INSERT INTO seller_capability_profile VALUES (?,?,?,?,?,?,?,?,?)",
        (
            profile["id"], profile["seller_id"], template_id, "贵州五品类特色农产品",
            json.dumps(profile["target_markets"], ensure_ascii=False),
            json.dumps(profile["attributes"], ensure_ascii=False), profile["version"], now, now,
        ),
    )


def build_store(input_csv: Path | None = None, profile_path: Path = DEFAULT_PROFILE, db_path: Path = DEFAULT_DB) -> dict[str, Any]:
    input_csv = input_csv or resolve_input()
    rows = load_rows(input_csv)
    profile = normalized_profile(json.loads(profile_path.read_text(encoding="utf-8")))
    catalog = load_catalog()
    now = utc_now()
    decision_date = date.today().isoformat()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = db_path.with_suffix(".tmp.db")
    if temp_path.exists():
        temp_path.unlink()

    conn = sqlite3.connect(temp_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript((ROOT / "db/schema.sql").read_text(encoding="utf-8"))
        conn.executescript((ROOT / "db/migrations/002_opportunity_decision.sql").read_text(encoding="utf-8"))
        conn.executescript((ROOT / "db/migrations/003_seller_sku_fit.sql").read_text(encoding="utf-8"))
        conn.executescript((ROOT / "db/migrations/004_agent_discovered_target.sql").read_text(encoding="utf-8"))
        conn.executescript((ROOT / "db/migrations/005_buyer_identity.sql").read_text(encoding="utf-8"))
        insert_base_profile(conn, profile, now)
        # reliable same-account grouping (domain / platform id / reg id only)
        from buyer_profile_v1 import account_key, build_buyer_context  # local: avoids import cycle

        buyer_context = build_buyer_context(rows)
        source_ids: dict[str, str] = {}
        decisions: list[tuple[dict[str, str], dict[str, Any], Any, Any]] = []

        for row in rows:
            source_code = row["source_code"]
            source_id = source_ids.setdefault(source_code, stable_id("src", source_code))
            conn.execute(
                "INSERT OR IGNORE INTO source(id,code,source_type,base_url,enabled,min_interval_ms,created_at) VALUES (?,?,?,?,?,?,?)",
                (source_id, source_code, row["source_type"], row["listing_url"], 1, 2000, now),
            )
            evidence_id = stable_id("ev", row["signal_id"])
            conn.execute(
                "INSERT INTO evidence(id,source_id,source_type,url,title,published_at,observed_at,time_precision,excerpt,snapshot_sha256,data_mode,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (evidence_id, source_id, row["source_type"], row["evidence_url"], row["title"], row["published_at"], row["observed_at"], row["time_precision"], row["evidence_excerpt"], row["snapshot_sha256"], row["data_mode"], now),
            )
            display_name = buyer_display_name(row)
            buyer_key = row.get("buyer_domain") or f"unresolved|{row['source_code']}|{row['signal_id']}"
            buyer_id = stable_id("buyer", buyer_key)
            conn.execute(
                "INSERT OR IGNORE INTO buyer(id,canonical_name,normalized_name,domain,country_code,registration_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (buyer_id, display_name, display_name.casefold(), row.get("buyer_domain") or None, country_code_for(row), row.get("registration_id") or None, now, now),
            )
            truth_breakdown = {key: (float(row[key]) if row.get(key, "").strip() else None) for key in ["d1_demand_explicitness", "d2_account_business_context", "d3_recency", "d4_corroboration"]}
            conn.execute(
                "INSERT INTO signal(id,buyer_id,signal_type,buying_action,product_terms_json,published_at,latest_observed_at,truth_score,truth_level,truth_breakdown_json,extraction_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (row["signal_id"], buyer_id, row["source_type"], row["buying_action"], json.dumps([row["category_code"]]), row["published_at"], row["observed_at"], float(row["truth_score"]), row["truth_level"], json.dumps(truth_breakdown), "qualified-csv-v1", now, now),
            )
            conn.execute("INSERT INTO signal_evidence VALUES (?,?,?)", (row["signal_id"], evidence_id, "PRIMARY"))
            conn.execute(
                "INSERT INTO field_observation(id,owner_type,owner_id,field_code,raw_value,confidence,evidence_span,evidence_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (stable_id("field", f"{row['signal_id']}|quantity_raw"), "SIGNAL", row["signal_id"], "quantity_raw", row.get("quantity_raw") or None, 0.9, row.get("quantity_raw") or None, evidence_id, now),
            )

            fit_report = evaluate_fit(row, catalog)
            signal_input = opportunity_input(row, buyer_id)
            signal_input["seller_fit"] = fit_report.best_fit_score
            if fit_report.supply_pool_status == "NO_MATCH":
                signal_input["gaps"] = signal_input["gaps"] + [f"贵州供给匹配：{fit_report.summary_zh}"]
            elif fit_report.supply_pool_status == "CONDITIONAL_ONLY":
                signal_input["gaps"] = signal_input["gaps"] + ["贵州 SKU 为条件性匹配，需确认规格 / 数量 / 认证"]
            for requirement in signal_input["requirements"]:
                requirement_id = stable_id("req", f"{row['signal_id']}|{requirement['field_code']}|{json.dumps(requirement['value'], sort_keys=True)}")
                conn.execute(
                    "INSERT INTO requirement VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (requirement_id, row["signal_id"], requirement["field_code"], requirement["requirement_type"], requirement["operator"], json.dumps(requirement["value"]), int(requirement["hard"]), 0.8, evidence_id, now),
                )

            decision = assess_opportunity(signal_input, profile)
            decisions.append((row, signal_input, decision, fit_report))

        decisions.sort(key=lambda item: (-item[2].opportunity_score, item[2].opportunity_id))
        eligible = [item for item in decisions if item[2].decision_status != "PASS"]
        top_ids = {item[2].opportunity_id: rank for rank, item in enumerate(eligible[:5], 1)}
        for row, signal_input, decision, fit_report in decisions:
            opportunity_id = decision.opportunity_id
            buyer_identity_status = row.get("buyer_identity_status", "UNRESOLVED")
            risk_items, access_status = classify_risk_items(
                parse_demand(row), fit_report, row,
                buyer_identity_status=buyer_identity_status, catalog=catalog,
            )
            account = account_key(row)
            buyer_ctx = buyer_context.get(account) if account else None
            buying_profile_json = (
                json.dumps(buyer_ctx["buying_profile"], ensure_ascii=False)
                if buyer_ctx and buyer_ctx.get("buying_profile") else None
            )
            same_account_history_json = (
                json.dumps(buyer_ctx["same_account_public_history"], ensure_ascii=False)
                if buyer_ctx and buyer_ctx.get("same_account_public_history") else None
            )
            conn.execute(
                """INSERT INTO opportunity(
                     id, seller_capability_profile_id, buyer_id, primary_signal_id, status,
                     why_now, gap_json, risk_json, next_action, latest_signal_at,
                     created_at, updated_at,
                     buyer_identity_status, access_status, buying_profile,
                     same_account_public_history)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    opportunity_id, profile["id"], decision.buyer_id, row["signal_id"], "NEW",
                    "；".join(decision.why_now), json.dumps(decision.gaps, ensure_ascii=False),
                    json.dumps(risk_items, ensure_ascii=False), decision.next_action["summary"],
                    row["published_at"], now, now,
                    buyer_identity_status, access_status, buying_profile_json,
                    same_account_history_json,
                ),
            )
            conn.execute(
                """INSERT INTO seller_sku_fit(
                     opportunity_id, supply_pool_status, best_verdict, best_fit_score,
                     eligible_match_count, evaluated_sku_count, summary_zh, report_json,
                     ruleset_version, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    opportunity_id, fit_report.supply_pool_status, fit_report.best_verdict,
                    fit_report.best_fit_score, len(fit_report.eligible_matches),
                    len(fit_report.all_evaluations), fit_report.summary_zh,
                    json.dumps({
                        "supply_pool_status": fit_report.supply_pool_status,
                        "best_verdict": fit_report.best_verdict,
                        "best_fit_score": fit_report.best_fit_score,
                        "summary_zh": fit_report.summary_zh,
                        "eligible_matches": fit_report.eligible_matches,
                        "all_evaluations": fit_report.all_evaluations,
                    }, ensure_ascii=False),
                    fit_report.ruleset_version, now,
                ),
            )
            components = decision.component_scores
            rank = top_ids.get(opportunity_id)
            requirement_rows = conn.execute(
                "SELECT id FROM requirement WHERE signal_id=? ORDER BY rowid", (row["signal_id"],)
            ).fetchall()
            for requirement_row, match in zip(requirement_rows, decision.match_results):
                conn.execute(
                    "INSERT INTO match_result VALUES (?,?,?,?,?,?,?,?)",
                    (
                        stable_id("match", f"{opportunity_id}|{requirement_row['id']}"), opportunity_id,
                        requirement_row["id"], json.dumps(match["seller_value"], ensure_ascii=False),
                        match["status"], int(match["hard"]), match["reason"], now,
                    ),
                )
            conn.execute(
                """INSERT INTO opportunity_decision(
                     id,opportunity_id,seller_capability_profile_id,decision_date,rank_position,
                     decision_status,hard_gate_passed,truth_score,opportunity_score,timing_score,
                     seller_fit_score,commercial_execution_score,procurement_channel_actionability_score,
                     market_access_score,why_now_json,gaps_json,blockers_json,next_action_json,
                     ruleset_version,input_snapshot_sha256,created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    stable_id("dec", decision.input_snapshot_sha256), opportunity_id, profile["id"], decision_date, rank,
                    decision.decision_status, int(decision.hard_gate_passed), decision.truth_score, decision.opportunity_score,
                    components["timing"], components["seller_fit"], components["commercial_execution"],
                    components["procurement_channel_actionability"], components["market_access"],
                    json.dumps(decision.why_now, ensure_ascii=False), json.dumps(decision.gaps, ensure_ascii=False),
                    json.dumps(decision.blockers, ensure_ascii=False), json.dumps(decision.next_action, ensure_ascii=False),
                    decision.ruleset_version, decision.input_snapshot_sha256, now,
                ),
            )
        buyer_count = conn.execute("SELECT COUNT(*) FROM buyer").fetchone()[0]
        conn.execute(
            """INSERT INTO crawl_run(
                 id, target_product_query, status, stage, raw_count, normalized_count,
                 buyer_count, opportunity_count, started_at, completed_at, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                stable_id("run", f"{db_path}|{now}"), "buyer-hunter-full-collection",
                "SUCCEEDED", "COMPLETE", len(rows), len(rows), buyer_count,
                len(decisions), now, now, now,
            ),
        )
        conn.commit()
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        summary = {
            "input_count": len(rows),
            "decision_count": len(decisions),
            "top5_count": len(top_ids),
            "buyer_count": buyer_count,
            "decision_date": decision_date,
            "seller_profile_id": profile["id"],
            "database": str(db_path),
            "integrity": integrity,
        }
    finally:
        conn.close()
    os.replace(temp_path, db_path)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=None, help="qualified-opportunities CSV; default: newest full-collection run")
    parser.add_argument("--profile", type=Path, default=DEFAULT_PROFILE)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    print(json.dumps(build_store(args.input, args.profile, args.db), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())




