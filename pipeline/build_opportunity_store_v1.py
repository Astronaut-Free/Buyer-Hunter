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


DEFAULT_INPUT = ROOT / "pipeline/data_b2b_public_v3/20260827T212941Z/cleaned_v1/buyer_signals_qualified.csv"
DEFAULT_PROFILE = ROOT / "pipeline/seller_capability_profile_demo_v1.json"
DEFAULT_DB = ROOT / "runtime/buyer_hunter.db"

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


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def country_code_for(row: dict[str, str]) -> str:
    return row.get("buyer_country_code", "").strip() or COUNTRY_CODES.get(row.get("buyer_country_raw", "").strip(), "ZZ")


def buyer_display_name(row: dict[str, str]) -> str:
    if row.get("buyer_name_raw", "").strip():
        return row["buyer_name_raw"].strip()
    country = row.get("buyer_country_raw", "").strip() or "未知国家"
    contact = row.get("contact_person_raw", "").strip()
    suffix = f"（联系人：{contact}）" if contact else "（公司待核验）"
    return f"{country}{CATEGORY_NAMES.get(row['category_code'], row['category_code'])}采购方{suffix}"


def commercial_value(quantity: str) -> float:
    value = quantity.casefold()
    if "container" in value:
        return 88.0
    if re.search(r"\b(?:ton|tonne|mt)\b", value):
        return 82.0
    kg = re.search(r"([\d,.]+)\s*kg\b", value)
    if kg:
        amount = float(kg.group(1).replace(",", ""))
        return 80.0 if amount >= 1000 else 68.0 if amount >= 100 else 52.0
    return 40.0 if quantity.strip() else 25.0


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
    has_contact = bool(row.get("contact_person_raw", "").strip())
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

    actionability = 35.0
    actionability += 15.0 if row.get("specs_present") == "True" else 0.0
    actionability += 15.0 if row.get("quantity_raw", "").strip() else 0.0
    actionability += 15.0 if row.get("destination_present") == "True" else 0.0
    actionability += 10.0 if has_contact else 0.0

    return {
        "opportunity_id": stable_id("opp", row["signal_id"]),
        "buyer_id": buyer_id,
        "truth_score": float(row["truth_score"]),
        "exact_product_match": True,
        "age_days": int(row.get("age_days") or 999),
        "buying_window": {"status": "OPEN" if int(row.get("age_days") or 999) <= 30 else "CLOSED" if int(row.get("age_days") or 999) > 60 else "UNKNOWN"},
        "requirements": requirements_for(row),
        "buyer_strength": min(100.0, float(row.get("d2_entity_authenticity") or 0) * 4.0),
        "commercial_value": commercial_value(row.get("quantity_raw", "")),
        "market_readiness": 85.0 if country in target_markets else 42.0,
        "actionability": actionability,
        "risk_penalty": 4.0 + (0.0 if has_entity else 8.0) + (0.0 if row.get("buyer_domain") else 4.0),
        "why_now": why_now,
        "gaps": gaps,
        "next_action": {
            "action_type": "VERIFY_AND_PREPARE",
            "summary": "核验买家主体后，准备对应规格、报价与交付证明",
            "checklist": ["核验公司主体", "确认最终规格与认证", "准备报价和样品方案"],
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


def build_store(input_csv: Path = DEFAULT_INPUT, profile_path: Path = DEFAULT_PROFILE, db_path: Path = DEFAULT_DB) -> dict[str, Any]:
    rows = load_rows(input_csv)
    profile = normalized_profile(json.loads(profile_path.read_text(encoding="utf-8")))
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
        insert_base_profile(conn, profile, now)
        source_ids: dict[str, str] = {}
        decisions: list[tuple[dict[str, str], dict[str, Any], Any]] = []

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
            buyer_key = row.get("buyer_domain") or f"{display_name}|{row.get('buyer_country_code')}"
            buyer_id = stable_id("buyer", buyer_key)
            conn.execute(
                "INSERT OR IGNORE INTO buyer(id,canonical_name,normalized_name,domain,country_code,registration_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (buyer_id, display_name, display_name.casefold(), row.get("buyer_domain") or None, country_code_for(row), row.get("registration_id") or None, now, now),
            )
            truth_breakdown = {key: float(row[key]) for key in ["d1_demand_explicitness", "d2_entity_authenticity", "d3_recency", "d4_corroboration"]}
            conn.execute(
                "INSERT INTO signal(id,buyer_id,signal_type,buying_action,product_terms_json,published_at,latest_observed_at,truth_score,truth_level,truth_breakdown_json,extraction_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (row["signal_id"], buyer_id, row["source_type"], row["buying_action"], json.dumps([row["category_code"]]), row["published_at"], row["observed_at"], float(row["truth_score"]), row["truth_level"], json.dumps(truth_breakdown), "qualified-csv-v1", now, now),
            )
            conn.execute("INSERT INTO signal_evidence VALUES (?,?,?)", (row["signal_id"], evidence_id, "PRIMARY"))
            conn.execute(
                "INSERT INTO field_observation(id,owner_type,owner_id,field_code,raw_value,confidence,evidence_span,evidence_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (stable_id("field", f"{row['signal_id']}|quantity_raw"), "SIGNAL", row["signal_id"], "quantity_raw", row.get("quantity_raw") or None, 0.9, row.get("quantity_raw") or None, evidence_id, now),
            )

            signal_input = opportunity_input(row, buyer_id)
            for requirement in signal_input["requirements"]:
                requirement_id = stable_id("req", f"{row['signal_id']}|{requirement['field_code']}|{json.dumps(requirement['value'], sort_keys=True)}")
                conn.execute(
                    "INSERT INTO requirement VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (requirement_id, row["signal_id"], requirement["field_code"], requirement["requirement_type"], requirement["operator"], json.dumps(requirement["value"]), int(requirement["hard"]), 0.8, evidence_id, now),
                )

            decision = assess_opportunity(signal_input, profile)
            decisions.append((row, signal_input, decision))

        decisions.sort(key=lambda item: (-item[2].opportunity_score, item[2].opportunity_id))
        eligible = [item for item in decisions if item[2].decision_status != "PASS"]
        top_ids = {item[2].opportunity_id: rank for rank, item in enumerate(eligible[:5], 1)}
        for row, signal_input, decision in decisions:
            opportunity_id = decision.opportunity_id
            risk_items = []
            if not row.get("buyer_name_raw", "").strip():
                risk_items.append("买家公司主体未完成独立核验")
            if row["verification_status"] != "VERIFIED":
                risk_items.append("需求来自市场平台，尚缺第二来源佐证")
            conn.execute(
                "INSERT INTO opportunity VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (opportunity_id, profile["id"], decision.buyer_id, row["signal_id"], "NEW", "；".join(decision.why_now), json.dumps(decision.gaps, ensure_ascii=False), json.dumps(risk_items, ensure_ascii=False), decision.next_action["summary"], row["published_at"], now, now),
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
                "INSERT INTO opportunity_decision VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    stable_id("dec", decision.input_snapshot_sha256), opportunity_id, profile["id"], decision_date, rank,
                    decision.decision_status, int(decision.hard_gate_passed), decision.truth_score, decision.opportunity_score,
                    components["timing"], components["seller_fit"], components["buyer_strength"], components["commercial_value"],
                    components["market_readiness"], components["actionability"], decision.risk_penalty,
                    json.dumps(decision.why_now, ensure_ascii=False), json.dumps(decision.gaps, ensure_ascii=False),
                    json.dumps(decision.blockers, ensure_ascii=False), json.dumps(decision.next_action, ensure_ascii=False),
                    decision.ruleset_version, decision.input_snapshot_sha256, now,
                ),
            )
        conn.commit()
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        summary = {
            "input_count": len(rows),
            "decision_count": len(decisions),
            "top5_count": len(top_ids),
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
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--profile", type=Path, default=DEFAULT_PROFILE)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    print(json.dumps(build_store(args.input, args.profile, args.db), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())




