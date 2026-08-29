"""Python capability CLI — Free's authoritative A3 / A4 / A5 as a stdin/stdout tool.

The Node agent runtime (agent/skill-runtime/dependency-refresh.js) calls capability
"runners" synchronously during an A6 buyer-reply cycle. This CLI lets those runners
delegate to Free's real implementations instead of the Node placeholder versions.

    echo '{"capability":"qianpulse.a4.supply_match","context":{...}}' | python scripts/capability_cli.py

stdin  : {"capability": "<capability_id>", "context": {<runner context>}}
stdout : a CapabilityResultEnvelope (same shape as agent/skill-runtime/guards.js makeCapabilityEnvelope)
exit   : 0 on a produced envelope (even MORE_EVIDENCE/BLOCKED); non-zero only on an
         internal error, which tells the Node runner to fall back to its own logic.

Contract: contracts/capability-result-envelope.schema.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from opportunity_decision_engine_v1 import market_access_score, timing_score  # noqa: E402
from build_opportunity_store_v1 import buying_window_fields  # noqa: E402
from supply_demand_fit_v1 import evaluate as evaluate_fit  # noqa: E402
from supply_demand_fit_v1 import load_catalog  # noqa: E402
from risk_items_v1 import classify_risk_items_from_context  # noqa: E402


A3 = "qianpulse.a3.purchase_timing"
A4 = "qianpulse.a4.supply_match"
A5 = "qianpulse.a5.trade_risk"
A8 = "qianpulse.a8.deal_action"
VERSION = "1.0.0-python"

_TARGET_MARKETS = {"US", "JP", "GB", "AU", "DE", "NL", "FR", "IT", "ES", "PL", "BE", "FI", "HU"}
_CATALOG: dict[str, Any] | None = None


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def envelope(capability_id: str, run_status: str, *, domain_result: dict[str, Any],
             changed_fields: list[str] | None = None, missing_evidence: list[str] | None = None,
             evidence_refs: list[str] | None = None, human_review_required: bool = False) -> dict[str, Any]:
    return {
        "capability_id": capability_id,
        "capability_version": VERSION,
        "run_status": run_status,
        "changed_fields": changed_fields or [],
        "missing_evidence": missing_evidence or [],
        "evidence_refs": evidence_refs or [],
        "human_review_required": bool(human_review_required),
        "domain_result": {**domain_result, "capability_runtime": "python"},
        "error": None,
    }


def _msg_text(context: dict[str, Any]) -> str:
    msg = context.get("latest_buyer_message")
    if isinstance(msg, dict):
        return str(msg.get("content") or "")
    return str(msg or "")


def _fields(context: dict[str, Any]) -> dict[str, Any]:
    state = context.get("opportunity_state") or {}
    merged = dict(state.get("fields") or {})
    merged.update(context.get("field_updates") or {})
    return merged


def _evidence_refs(context: dict[str, Any]) -> list[str]:
    refs: list[str] = []
    msg = context.get("latest_buyer_message")
    if isinstance(msg, dict):
        for key in ("evidence_ref", "evidence_refs"):
            value = msg.get(key)
            if isinstance(value, str):
                refs.append(value)
            elif isinstance(value, list):
                refs.extend(str(v) for v in value if v)
    for value in (context.get("evidence_refs"), (context.get("seller_context") or {}).get("evidence_refs")):
        if isinstance(value, list):
            refs.extend(str(v) for v in value if v)
    return list(dict.fromkeys(refs))


def _as_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return [part.strip() for part in str(value).split(",") if part.strip()]


def _required_facts(changed_fields: list[str]) -> list[str]:
    """Mirror of agent/skill-runtime/a4.js requiredFacts() for shape compatibility."""
    fields = set(changed_fields or [])
    out: list[str] = []
    if "quantity" in fields:
        out.append("capacity_or_moq")
    if "specification" in fields:
        out.append("specification")
    if "certification" in fields:
        out.append("certifications")
    if "delivery_date" in fields:
        out.append("delivery")
    return out


# --------------------------------------------------------------------------- #
# A3 — purchase timing (Free timing_score + buying_window_fields)
# --------------------------------------------------------------------------- #
def run_a3(context: dict[str, Any]) -> dict[str, Any]:
    if not context.get("opportunity_id"):
        return envelope(A3, "BLOCKED", missing_evidence=["opportunity_id"],
                        human_review_required=True, domain_result={"code": "NEEDS_CONTEXT"})
    fields = _fields(context)
    text = _msg_text(context)
    age_days = fields.get("age_days") or context.get("age_days") or "999"
    row = {
        "title": str(fields.get("demand_title") or ""),
        "description_raw": text,
        "quantity_raw": str(fields.get("quantity") or ""),
        "age_days": str(age_days),
        "specs_present": "True" if fields.get("specification") else "False",
    }
    window = buying_window_fields(row)
    try:
        age = int(str(age_days))
    except (TypeError, ValueError):
        age = 999
    score = timing_score(
        age, window["status"], window["explicit_urgency"],
        window["transaction_stage"], window["continuity_signals"], window["staleness"],
    )
    explicit = bool(context.get("field_updates", {}).get("delivery_date"))
    return envelope(
        A3, "DONE",
        changed_fields=context.get("changed_fields") or [],
        evidence_refs=_evidence_refs(context),
        domain_result={
            "purchase_window": window["status"],
            "timing_signal": "EXPLICIT_WINDOW" if explicit else "BUYER_TIMING_QUERY",
            "readiness": "TIMING_KNOWN" if score >= 50 else "TIMING_WEAK",
            "timing_score": score,
            "transaction_stage": window["transaction_stage"],
            "continuity_signals": window["continuity_signals"],
        },
    )


# --------------------------------------------------------------------------- #
# A4 — Guizhou supply match (Free supply_demand_fit)
# --------------------------------------------------------------------------- #
def run_a4(context: dict[str, Any]) -> dict[str, Any]:
    global _CATALOG
    if not context.get("opportunity_id"):
        return envelope(A4, "BLOCKED", missing_evidence=["opportunity_id"],
                        human_review_required=True, domain_result={"code": "NEEDS_CONTEXT"})
    fields = _fields(context)
    changed = context.get("changed_fields") or []
    seller = context.get("seller_context") or {}
    category = str(fields.get("product") or fields.get("category_code") or "").strip().upper()
    if not category:
        return envelope(A4, "MORE_EVIDENCE", changed_fields=changed,
                        missing_evidence=["product_category"], human_review_required=True,
                        domain_result={"match_status": "NEEDS_EVIDENCE", "checked_fields": _required_facts(changed)})

    row = {
        "category_code": category,
        "title": str(fields.get("demand_title") or ""),
        "description_raw": _msg_text(context),
        "quantity_raw": str(fields.get("quantity") or ""),
        "buyer_country_code": str(fields.get("destination") or ""),
    }
    if _CATALOG is None:
        _CATALOG = load_catalog()
    report = evaluate_fit(row, _CATALOG)

    verified_facts = {
        key: value for key, value in {
            "capacity_or_moq": seller.get("capacity") or seller.get("monthly_capacity") or seller.get("moq"),
            "specification": seller.get("specification") or seller.get("specifications"),
            "certifications": seller.get("certifications") or seller.get("certification"),
            "delivery": seller.get("delivery") or seller.get("lead_time") or seller.get("leadTime"),
        }.items() if value
    }
    return envelope(
        A4, "DONE",
        changed_fields=changed,
        evidence_refs=_evidence_refs(context),
        human_review_required=report.supply_pool_status == "NO_MATCH",
        domain_result={
            "match_status": "VERIFIED_FOR_CHANGED_FIELDS" if changed else "NO_REFRESH_FACT_REQUIRED",
            "checked_fields": _required_facts(changed),
            "verified_facts": verified_facts,
            "supply_pool_status": report.supply_pool_status,
            "best_verdict": report.best_verdict,
            "best_fit_score": report.best_fit_score,
            "summary_zh": report.summary_zh,
            "eligible_matches": report.eligible_matches,
        },
    )


# --------------------------------------------------------------------------- #
# A5 — market access / trade risk (Free market_access_score + policy checks)
# --------------------------------------------------------------------------- #
def run_a5(context: dict[str, Any]) -> dict[str, Any]:
    if not context.get("opportunity_id"):
        return envelope(A5, "BLOCKED", missing_evidence=["opportunity_id"],
                        human_review_required=True, domain_result={"code": "NEEDS_CONTEXT", "status": "BLOCKED"})
    fields = _fields(context)
    seller = context.get("seller_context") or {}
    changed = context.get("changed_fields") or []
    destination = fields.get("destination") or context.get("destination")
    allowed = _as_list(seller.get("allowed_markets") or seller.get("allowedMarkets"))
    blocked = _as_list(seller.get("blocked_markets") or seller.get("blockedMarkets"))
    market_access = seller.get("market_access") or seller.get("marketAccess") or seller.get("trade_risk")
    payment_policy = seller.get("payment_policy") or seller.get("paymentPolicy") or seller.get("allowed_payment_terms")
    refs = _evidence_refs(context)

    if destination and any(destination.lower() == b.lower() for b in blocked):
        return envelope(A5, "BLOCKED", changed_fields=changed, evidence_refs=refs, human_review_required=True,
                        domain_result={"status": "BLOCKED", "decision": "BLOCKED",
                                       "reason": "destination explicitly blocked by seller trade policy",
                                       "destination": destination})

    needs_dest = "destination" in changed or "certification" in changed
    needs_pay = "payment_terms" in changed
    missing: list[str] = []
    if needs_dest and not market_access and not (destination and allowed):
        missing.append("market_access_or_trade_risk")
    if needs_pay and not payment_policy:
        missing.append("payment_policy")
    if missing:
        return envelope(A5, "MORE_EVIDENCE", changed_fields=changed, evidence_refs=refs,
                        missing_evidence=missing, human_review_required=True,
                        domain_result={"status": "NEEDS_EVIDENCE", "decision": "REVIEW_REQUIRED", "destination": destination})

    dest_upper = str(destination).upper() if destination else None
    destination_allowed = None
    if destination and allowed:
        destination_allowed = any(destination.lower() == a.lower() for a in allowed)
    ma_number = market_access_score([], 60.0 if dest_upper in _TARGET_MARKETS else 30.0 if dest_upper else None)

    # rule-based depth (credit / fraud / IP / contract) rides along the review
    identity = str(
        fields.get("buyer_identity_status") or context.get("buyer_identity_status") or "UNRESOLVED"
    )
    message = context.get("latest_buyer_message") or {}
    message_text = message.get("content") if isinstance(message, dict) else str(message or "")
    risk_items, access_status = classify_risk_items_from_context(
        category=str(fields.get("product") or ""),
        demand_title=str(fields.get("demand_title") or ""),
        message_text=f"{message_text} {fields.get('payment_terms') or ''}",
        quantity=str(fields.get("quantity") or ""),
        destination=destination or "",
        buyer_identity_status=identity,
        contact_gate=str(fields.get("contact_gate") or ""),
        contact_email_raw=str(fields.get("contact_email_raw") or ""),
    )
    return envelope(
        A5, "DONE", changed_fields=changed, evidence_refs=refs,
        domain_result={
            "status": "REVIEWED",
            "decision": "ALLOW_WITH_EXISTING_POLICY",
            "destination": destination,
            "destination_allowed": destination_allowed,
            "market_access": market_access or ma_number,
            "market_access_score": ma_number,
            "payment_policy": payment_policy,
            "risk_items": risk_items,
            "access_status": access_status,
        },
    )


# --------------------------------------------------------------------------- #
# A8 — deal action (Phase 8: Free's commercial judgment fed to A6)
# --------------------------------------------------------------------------- #
def run_a8(context: dict[str, Any]) -> dict[str, Any]:
    if not context.get("opportunity_id"):
        return envelope(A8, "BLOCKED", missing_evidence=["opportunity_id"],
                        human_review_required=True, domain_result={"code": "NEEDS_CONTEXT", "status": "BLOCKED"})
    decision = context.get("decision") or {}
    decision_status = str(decision.get("decision_status") or "")
    gaps = [str(g) for g in (decision.get("gaps") or []) if str(g).strip()]
    risks = context.get("risks") or []
    access_status = str(context.get("access_status") or decision.get("access_status") or "")
    refs = _evidence_refs(context)

    # never bypass the risk gate — deal action cannot override BLOCK
    if access_status.upper() == "BLOCK" or decision_status == "BLOCKED":
        return envelope(
            A8, "BLOCKED", evidence_refs=refs, human_review_required=True,
            domain_result={
                "status": "BLOCKED", "decision": "HALT",
                "primary_action": {"type": "HALT", "reason": "市场准入或风险门禁为 BLOCK，停止对外推进"},
                "secondary_action": None,
                "action_reasoning": "A5 门禁 BLOCK，deal action 不得绕过",
                "contact_strategy": None,
                "follow_up": {"owner": "INTERNAL", "stop_condition": "BLOCK 解除并经人工复核"},
                "required_assets": [], "human_approval_required": True,
            },
        )
    if decision_status not in {"PURSUE_NOW", "VERIFY_FIRST", "WATCH", "PASS"}:
        if not decision_status:
            # A2-only opportunity: no Free snapshot to judge — must not stall A6.
            return envelope(
                A8, "NOT_APPLICABLE", evidence_refs=refs,
                domain_result={"status": "NOT_APPLICABLE", "decision": "NO_SNAPSHOT"},
            )
        return envelope(
            A8, "MORE_EVIDENCE", evidence_refs=refs, missing_evidence=["decision_snapshot"],
            human_review_required=True, domain_result={"status": "NEEDS_EVIDENCE", "decision": "REVIEW_REQUIRED"},
        )

    mapping = {
        "PURSUE_NOW": {
            "primary_action": {"type": "OUTREACH", "reason": "机会分与门禁支持立即推进，按决策简报触达"},
            "secondary_action": None,
            "action_reasoning": "PURSUE_NOW：最高优先级机会，公开渠道触达并进入 A6 推进链",
            "contact_strategy": {"preferred": "public_channel_first", "note": "仅使用公开渠道；私联需人工授权"},
            "follow_up": {"owner": "A6", "success_condition": "买家首次回复", "stop_condition": "买家明确拒绝或门禁升级"},
            "required_assets": ["决策简报", "证据链接"],
            "human_approval_required": True,
        },
        "VERIFY_FIRST": {
            "primary_action": {"type": "VERIFY_GAPS",
                               "reason": f"先补齐缺口：{'；'.join(gaps[:3])}" if gaps else "决策要求先核验再推进"},
            "secondary_action": {"type": "PREPARE_OUTREACH", "reason": "核验通过后即可触达"},
            "action_reasoning": "VERIFY_FIRST：证据门槛未满，先核验后推进",
            "contact_strategy": {"preferred": "public_channel_first", "note": "核验完成前不触达"},
            "follow_up": {"owner": "INTERNAL", "success_condition": "缺口补齐并复核", "stop_condition": "核验失败或门禁升级"},
            "required_assets": ["待核验清单", "证据链接"],
            "human_approval_required": True,
        },
        "WATCH": {
            "primary_action": {"type": "SCHEDULE_REVIEW", "reason": "时机未到，安排复查而非推进"},
            "secondary_action": None,
            "action_reasoning": "WATCH：当前不追，按购买窗口安排复查",
            "contact_strategy": None,
            "follow_up": {"owner": "A6", "success_condition": "窗口信号更新", "stop_condition": "决策降级为 PASS"},
            "required_assets": [],
            "human_approval_required": False,
        },
        "PASS": {
            "primary_action": {"type": "NO_ACTION", "reason": "决策判定为 PASS，不投入销售时间"},
            "secondary_action": None,
            "action_reasoning": "PASS：不追",
            "contact_strategy": None,
            "follow_up": None,
            "required_assets": [],
            "human_approval_required": False,
        },
    }
    action = mapping[decision_status]
    result = {
        "status": "DONE",
        "decision": action["primary_action"]["type"],
        "decision_snapshot": {
            "decision_status": decision_status,
            "opportunity_score": decision.get("opportunity_score"),
            "component_scores": decision.get("component_scores"),
        },
        "risk_count": len(risks),
        "stage": context.get("stage"),
    }
    result.update(action)
    return envelope(A8, "DONE", evidence_refs=refs,
                    human_review_required=action["human_approval_required"],
                    domain_result=result)


DISPATCH = {A3: run_a3, A4: run_a4, A5: run_a5, A8: run_a8}


def run_capability(capability: str, context: dict[str, Any]) -> dict[str, Any]:
    runner = DISPATCH.get(capability)
    if runner is None:
        raise SystemExit(f"unknown capability: {capability}")
    return runner(context or {})


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"bad json: {exc}"}), file=sys.stderr)
        return 2
    capability = payload.get("capability")
    if capability not in DISPATCH:
        print(json.dumps({"error": f"unknown capability: {capability}"}), file=sys.stderr)
        return 2
    result = run_capability(capability, payload.get("context") or {})
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
