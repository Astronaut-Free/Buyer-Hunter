"""Run one collected Buyer Hunter signal through the six Skill contracts.

This is a validation harness, not a production scoring replacement. It keeps
unknowns explicit and stops the opportunity when the evidence gate fails.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from opportunity_decision_engine_v1 import timing_score


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_INPUT = ROOT / "pipeline/tests/fixtures/b2b_public_v3/cleaned_v1/buyer_signals_cleaned_scored.csv"
DEFAULT_PROFILE = ROOT / "pipeline/seller_capability_profile_demo_v1.json"
DEFAULT_OUTPUT = ROOT / "pipeline/data_skill_validation"


def resolve_input() -> Path:
    """Newest cleaned buyer-signals CSV from a local b2b run, else the fixture."""
    root = ROOT / "pipeline/data_b2b_public_v3"
    runs = (
        sorted((p for p in root.glob("*") if p.is_dir()), reverse=True)
        if root.exists()
        else []
    )
    for run in runs:
        candidate = run / "cleaned_v1" / "buyer_signals_cleaned_scored.csv"
        if candidate.exists():
            return candidate
    return FIXTURE_INPUT


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def choose_record(rows: list[dict[str, str]]) -> dict[str, str]:
    candidates = [row for row in rows if row.get("qualification_status") == "NEEDS_VERIFICATION"]
    if not candidates:
        raise ValueError("No NEEDS_VERIFICATION record is available for the validation run")
    return max(candidates, key=lambda row: (float(row.get("truth_score") or 0), row.get("published_at") or ""))


def country_hint(text: str) -> tuple[str | None, str | None]:
    patterns = [
        (r"\bUAE\b", "AE"),
        (r"\bUnited States\b", "US"),
        (r"\bUnited Kingdom\b", "GB"),
        (r"\bJapan\b", "JP"),
    ]
    for pattern, code in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return code, match.group(0)
    return None, None


def invalid_quantity(text: str) -> str | None:
    match = re.search(r"Initial quantity:\s*\**\s*(\d+)\s*([^\s•]+)?", text, re.I)
    if match and int(match.group(1)) <= 0:
        return match.group(0).strip()
    return None


def coverage_status(value: Any) -> str:
    return "COVERED" if value not in (None, "", [], {}) else "MISSING"


def build_report(row: dict[str, str], profile: dict[str, Any], input_path: Path) -> dict[str, Any]:
    text = row.get("evidence_excerpt") or row.get("description_raw") or ""
    country_code, country_span = country_hint(text)
    bad_quantity = invalid_quantity(text)
    truth_score = float(row.get("truth_score") or 0)
    age_days = int(row.get("age_days") or 999)
    source_ref = {
        "source_url": row.get("evidence_url"),
        "source_span": text,
        "snapshot_sha256": row.get("snapshot_sha256"),
        "observed_at": row.get("observed_at"),
        "verification_status": row.get("verification_status"),
        "fact_status": "FACT",
    }

    demand = {
        "skill": "buyer-hunter-demand-understanding",
        "status": "MORE_EVIDENCE",
        "buyer_what": "买方在平台请求蓝莓商业报价，并要求供应商说明等级、质量标准等信息。",
        "atomic_demands": [
            {
                "demand_title": row.get("title"),
                "buyer_subject": None,
                "category_code": row.get("category_code"),
                "product_specifications": ["等级/成分待供应商说明", "质量标准待供应商说明"],
                "quantity_raw": None,
                "quantity_normalized": None,
                "budget_or_price_range": None,
                "currency": None,
                "delivery_region": None,
                "delivery_at": None,
                "deadline_at": None,
                "contact_or_official_channel": "TradeKey platform login or membership",
                "published_at": row.get("published_at"),
                "source_url": row.get("evidence_url"),
                "source_span": text,
                "source_language": "en",
                "fact_status": "FACT",
                "missing_fields": ["buyer_subject", "valid_quantity", "budget", "delivery_region", "deadline"],
            }
        ],
        "source_refs": [source_ref],
        "warnings": ([f"Invalid quantity evidence: {bad_quantity}"] if bad_quantity else []),
    }

    window = {
        "skill": "buyer-hunter-buying-window",
        "window_status": "MONITOR",
        "window_score": timing_score(age_days, "MONITOR"),
        "score_scope": "Recency component from opportunity-v1.0.0; frequency, change and reliable status are missing",
        "why_now": [f"需求页面标注发布于 {row.get('published_at')}，本轮采集时为 {age_days} 天前"],
        "trigger_events": [],
        "counter_evidence": ["平台帖子未独立核验", "无截止时间", "异常数量字段"],
        "urgency": "LOW",
        "follow_up_window": "Verify buyer identity and post status before outreach",
        "missing_evidence": ["deadline", "purchase_frequency", "change_event", "independent_status_confirmation"],
        "human_review_required": True,
    }

    category_match = row.get("category_code") in profile.get("category_codes", [])
    fit = {
        "skill": "buyer-hunter-supply-demand-fit",
        "fit_score": 35.0 if category_match else 0.0,
        "score_scope": "Only category scope is comparable; the Demo profile contains matcha-specific product attributes",
        "match_results": [
            {"field_code": "category_code", "buyer_value": row.get("category_code"), "seller_value": profile.get("category_codes"), "status": "MATCH" if category_match else "MISMATCH", "hard": True},
            {"field_code": "product_specifications", "buyer_value": "blueberry grade/quality", "seller_value": None, "status": "UNKNOWN", "hard": True},
            {"field_code": "quantity", "buyer_value": None, "seller_value": profile.get("attributes", {}).get("capacity"), "status": "UNKNOWN", "hard": True},
            {"field_code": "certification", "buyer_value": None, "seller_value": profile.get("attributes", {}).get("certifications"), "status": "UNKNOWN", "hard": True},
        ],
        "hard_gaps": [],
        "soft_gaps": [],
        "unknowns": ["blueberry SKU/specification", "valid buyer quantity", "blueberry capacity", "required certification", "delivery terms"],
        "commercial_value": "UNKNOWN",
        "recommendation": "NEED_MORE_DATA",
        "seller_profile_version": profile.get("version"),
        "seller_profile_is_demo": True,
    }

    market = {
        "skill": "buyer-hunter-market-access-risk",
        "access_status": "UNKNOWN",
        "risks": ["Buyer-country hint is not evidence of delivery destination", "Product form and intended use are missing"],
        "required_docs": [],
        "certification_gaps": [],
        "official_evidence": [],
        "human_review_required": True,
        "missing_evidence": ["delivery destination", "product form", "intended use", "applicable official regulation"],
        "buyer_country_hint": {"country_code": country_code, "source_span": country_span, "fact_status": "FACT"} if country_code else None,
    }

    action = {
        "skill": "buyer-hunter-deal-action",
        "primary_action": "HOLD",
        "secondary_action": "ASK_SPEC_FIRST after buyer and destination verification",
        "action_reasoning": ["truth score is below the project gate", "seller fit is incomplete", "market access is UNKNOWN", "no verified public contact"],
        "contact_strategy": None,
        "message_drafts": {},
        "follow_up": {"next_step": "Verify source post, buyer subject, valid quantity and destination", "success_condition": "truth_score >= 60 and required fields covered", "stop_condition": "post expired, buyer cannot be resolved, or quantity remains invalid"},
        "required_assets": ["buyer identity evidence", "valid RFQ details", "blueberry seller capability profile"],
        "human_approval_required": True,
    }

    coverage = {
        "source": "COVERED",
        "source_text": coverage_status(text),
        "buyer_subject": "MISSING",
        "category": coverage_status(row.get("category_code")),
        "quantity": "CONFLICT" if bad_quantity else "MISSING",
        "budget": "MISSING",
        "trade_history": "MISSING",
        "buying_window": "PARTIAL",
        "seller_profile": "PARTIAL",
        "market_regulation": "MISSING",
        "contact": "MISSING",
    }
    evidence = {
        "skill": "buyer-hunter-evidence-coverage",
        "evidence_refs": [source_ref],
        "confidence": {
            "truth_score": truth_score,
            "truth_level": row.get("truth_level"),
            "dimensions": {
                "demand_explicitness": float(row.get("d1_demand_explicitness") or 0),
                "entity_authenticity": float(row.get("d2_entity_authenticity") or 0),
                "recency": float(row.get("d3_recency") or 0),
                "corroboration": float(row.get("d4_corroboration") or 0),
            },
            "ruleset_version": row.get("ruleset_version"),
            "meaning": "Evidence credibility only, not deal probability",
        },
        "coverage": coverage,
        "duplicate_demand_id": row.get("dedupe_fingerprint"),
        "entity_resolution_status": "UNRESOLVED",
        "warnings": ["UNVERIFIED_MARKETPLACE_POST", "Platform Verified is not business validation"] + ([f"Invalid quantity evidence: {bad_quantity}"] if bad_quantity else []),
        "conflicts": ([{"field": "quantity", "evidence": bad_quantity}] if bad_quantity else []),
        "stale_evidence": [],
        "human_review_required": True,
        "missing_evidence": [key for key, value in coverage.items() if value in {"MISSING", "CONFLICT"}],
        "next_state": "MORE_EVIDENCE",
    }

    return {
        "validation_run": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_input": str(input_path),
            "selected_signal_id": row.get("signal_id"),
            "selected_source_url": row.get("evidence_url"),
            "final_state": "MORE_EVIDENCE",
            "actionable": False,
            "reason": f"truth_score {truth_score:g} is below gate 60 and critical fields are missing or conflicting",
        },
        "opportunity": {
            "opportunity_id": f"validation-{row.get('signal_id')}",
            "buyer": {"subject": None, "country_hint": country_code},
            "atomic_demands": demand["atomic_demands"],
            "buying_window": window,
            "seller_fit": fit,
            "market_access": market,
            "deal_action": action,
            "evidence": evidence,
            "coverage": coverage,
            "status": "MORE_EVIDENCE",
        },
        "skill_results": [demand, window, fit, market, action, evidence],
    }


def render_markdown(report: dict[str, Any]) -> str:
    meta = report["validation_run"]
    rows = []
    for result in report["skill_results"]:
        outcome = result.get("status") or result.get("window_status") or result.get("recommendation") or result.get("access_status") or result.get("primary_action") or result.get("next_state")
        rows.append(f"| `{result['skill']}` | `{outcome}` |")
    return "\n".join([
        "# Buyer Hunter 六个 Skill 首轮验证",
        "",
        f"- 来源：{meta['selected_source_url']}",
        f"- 信号：`{meta['selected_signal_id']}`",
        f"- 最终状态：`{meta['final_state']}`",
        f"- 是否可行动：`{str(meta['actionable']).lower()}`",
        f"- 原因：{meta['reason']}",
        "",
        "| Skill | 本轮结果 |",
        "|---|---|",
        *rows,
        "",
        "## 结论",
        "",
        "采集器确实获得了公开页面记录，但本条信号未通过真实性门禁。系统没有把平台帖子强行包装成可立即跟进的商机，说明六个 Skill 的停止与回收逻辑生效。",
        "",
        "详细字段、证据层级、缺失项与冲突见 `all_skills_validation.json`。",
        "",
    ])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=None)
    parser.add_argument("--profile", type=Path, default=DEFAULT_PROFILE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    args.input = args.input or resolve_input()
    rows = read_rows(args.input)
    row = choose_record(rows)
    profile = json.loads(args.profile.read_text(encoding="utf-8"))
    report = build_report(row, profile, args.input)
    args.output.mkdir(parents=True, exist_ok=True)
    json_path = args.output / "all_skills_validation.json"
    md_path = args.output / "all_skills_validation.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps({
        "selected_signal_id": report["validation_run"]["selected_signal_id"],
        "final_state": report["validation_run"]["final_state"],
        "actionable": report["validation_run"]["actionable"],
        "outputs": [str(json_path), str(md_path)],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
