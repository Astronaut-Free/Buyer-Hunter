"""Deterministic seller-specific opportunity decisions for Buyer Hunter.

Demand truth is a front gate. Opportunity score answers whether this seller
should pursue the demand now and contains no buyer-strength proxy.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from typing import Any, Iterable


RULESET_VERSION = "opportunity-v1.1.0"
TRUTH_GATE = 60.0
WEIGHTS = {
    "timing": 30.0,
    "seller_fit": 30.0,
    "commercial_execution": 20.0,
    "procurement_channel_actionability": 10.0,
    "market_access": 10.0,
}


@dataclass(frozen=True)
class MatchResult:
    field_code: str
    status: str
    hard: bool
    requirement_type: str
    buyer_value: Any
    seller_value: Any
    reason: str


@dataclass(frozen=True)
class OpportunityDecision:
    opportunity_id: str
    seller_profile_id: str
    buyer_id: str
    truth_score: float
    opportunity_score: float
    decision_status: str
    hard_gate_passed: bool
    component_scores: dict[str, float]
    why_now: list[str]
    gaps: list[str]
    blockers: list[str]
    next_action: dict[str, Any]
    match_results: list[dict[str, Any]]
    ruleset_version: str
    input_snapshot_sha256: str


def clamp(value: Any, low: float = 0.0, high: float = 100.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = 0.0
    return round(min(max(number, low), high), 2)


def canonical_hash(value: dict[str, Any]) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_path(value: dict[str, Any], path: str) -> Any:
    current: Any = value
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def compare_requirement(requirement: dict[str, Any], seller: dict[str, Any]) -> MatchResult:
    field = str(requirement["field_code"])
    buyer_value = requirement.get("value")
    seller_value = get_path(seller.get("attributes", {}), field)
    operator = str(requirement.get("operator", "EQ")).upper()
    hard = bool(requirement.get("hard", False))
    requirement_type = str(requirement.get("requirement_type", "PRODUCT"))

    if seller_value is None:
        status, reason = "UNKNOWN", "卖方能力档案缺少该字段"
    elif operator == "EQ":
        status = "PASS" if str(seller_value).casefold() == str(buyer_value).casefold() else "FAIL"
        reason = "值一致" if status == "PASS" else "值冲突"
    elif operator == "IN":
        seller_values = seller_value if isinstance(seller_value, list) else [seller_value]
        buyer_values = buyer_value if isinstance(buyer_value, list) else [buyer_value]
        folded = {str(item).casefold() for item in seller_values}
        status = "PASS" if any(str(item).casefold() in folded for item in buyer_values) else "FAIL"
        reason = "卖方具备所需能力" if status == "PASS" else "卖方未登记所需能力"
    elif operator in {"GTE", "LTE"}:
        try:
            left, right = float(seller_value), float(buyer_value)
            passed = left >= right if operator == "GTE" else left <= right
            status, reason = ("PASS", "数值满足") if passed else ("FAIL", "数值不满足")
        except (TypeError, ValueError):
            status, reason = "UNKNOWN", "数值无法比较"
    elif operator == "EXISTS":
        status, reason = "PASS", "能力证据已登记"
    else:
        status, reason = "UNKNOWN", f"不支持的比较操作 {operator}"

    return MatchResult(field, status, hard, requirement_type, buyer_value, seller_value, reason)


def calculate_fit(matches: Iterable[MatchResult]) -> float:
    items = list(matches)
    if not items:
        return 0.0
    total_weight = sum(2.0 if item.hard else 1.0 for item in items)
    achieved = 0.0
    for item in items:
        weight = 2.0 if item.hard else 1.0
        achieved += weight if item.status == "PASS" else weight * 0.35 if item.status == "UNKNOWN" else 0.0
    return round(achieved / total_weight * 100.0, 2)


def timing_score(
    age_days: Any,
    window_status: str,
    explicit_urgency: bool = False,
    transaction_stage: str = "INQUIRY",
    continuity_signals: Iterable[str] | None = None,
    staleness: bool = False,
) -> float:
    """Observable window model: recency + urgency + stage + continuity - staleness."""
    if str(window_status).upper() == "CLOSED":
        return 0.0
    try:
        age = max(0, int(age_days))
    except (TypeError, ValueError):
        recency = 21.0
    else:
        if age <= 3:
            recency = 60.0
        elif age <= 7:
            recency = 54.0
        elif age <= 14:
            recency = 45.0
        elif age <= 30:
            recency = 33.0
        elif age <= 60:
            recency = 18.0
        else:
            recency = 6.0

    stage_points = {
        "INQUIRY": 4.0,
        "SPEC_CONFIRMATION": 8.0,
        "SAMPLE": 10.0,
        "TRIAL_ORDER": 12.0,
        "BULK_RFQ": 15.0,
        "LONG_TERM_SUPPLY": 15.0,
    }
    continuity = list(continuity_signals or [])
    continuity_points = min(10.0, len(set(continuity)) * 5.0)
    score = recency + (15.0 if explicit_urgency else 0.0)
    score += stage_points.get(str(transaction_stage).upper(), 4.0)
    score += continuity_points
    score -= 20.0 if staleness else 0.0
    return clamp(score)


def market_access_score(matches: Iterable[MatchResult], explicit_score: Any = None) -> float:
    if explicit_score is not None:
        return clamp(explicit_score)
    market_items = [item for item in matches if item.requirement_type == "MARKET_ACCESS"]
    return calculate_fit(market_items) if market_items else 35.0


def choose_decision(score: float, blockers: list[str], gaps: list[str]) -> str:
    if blockers:
        return "PASS"
    if score >= 75 and not gaps:
        return "PURSUE_NOW"
    if score >= 55:
        return "VERIFY_FIRST"
    if score >= 40:
        return "WATCH"
    return "PASS"


def choose_next_action(decision: str, gaps: list[str], supplied: dict[str, Any] | None) -> dict[str, Any]:
    if decision == "PASS":
        return {"action_type": "NO_ACTION", "summary": "当前不投入销售时间", "checklist": []}
    if gaps:
        return {
            "action_type": "VERIFY_GAP",
            "summary": f"先补齐关键缺口：{gaps[0]}",
            "checklist": gaps[:3],
        }
    if supplied:
        return supplied
    return {
        "action_type": "PREPARE_OUTREACH",
        "summary": "准备规格、报价和证据包，再通过公开采购入口跟进",
        "checklist": ["确认最终用途", "准备匹配规格", "准备交付与认证证明"],
    }


def assess_opportunity(signal: dict[str, Any], seller_profile: dict[str, Any]) -> OpportunityDecision:
    requirements = signal.get("requirements", [])
    matches = [compare_requirement(item, seller_profile) for item in requirements]
    truth = clamp(signal.get("truth_score"))
    fit = calculate_fit(matches)
    window = signal.get("buying_window", {})
    window_status = str(window.get("status", "UNKNOWN")).upper()
    timing = timing_score(
        signal.get("age_days"),
        window_status,
        bool(window.get("explicit_urgency", False)),
        str(window.get("transaction_stage", "INQUIRY")),
        window.get("continuity_signals", []),
        bool(window.get("staleness", False)),
    )
    market = market_access_score(matches, signal.get("market_access", signal.get("market_readiness")))

    blockers: list[str] = []
    if truth < TRUTH_GATE:
        blockers.append(f"需求真实性 {truth:g} 低于门槛 {TRUTH_GATE:g}")
    if not bool(signal.get("exact_product_match", False)):
        blockers.append("产品品类未精准命中")
    if window_status == "CLOSED":
        blockers.append("采购窗口已关闭")
    for item in matches:
        if item.hard and item.status == "FAIL":
            blockers.append(f"硬条件不满足：{item.field_code}")

    gaps = [f"{item.field_code}：{item.reason}" for item in matches if item.status == "UNKNOWN"]
    gaps.extend(str(item) for item in signal.get("gaps", []) if str(item) not in gaps)

    components = {
        "timing": timing,
        "seller_fit": fit,
        "commercial_execution": clamp(signal.get("commercial_execution", signal.get("actionability"))),
        "procurement_channel_actionability": clamp(signal.get("procurement_channel_actionability", 50.0)),
        "market_access": market,
    }
    weighted = sum(components[key] * weight / 100.0 for key, weight in WEIGHTS.items())
    score = round(max(0.0, min(100.0, weighted)), 2)
    decision = choose_decision(score, blockers, gaps)

    why_now = [str(item) for item in signal.get("why_now", []) if str(item).strip()]
    if not why_now:
        why_now = [f"需求发布于 {signal.get('age_days', '未知')} 天前，采购窗口状态为 {window_status}"]

    snapshot = {"signal": signal, "seller_profile": seller_profile, "ruleset_version": RULESET_VERSION}
    return OpportunityDecision(
        opportunity_id=str(signal["opportunity_id"]),
        seller_profile_id=str(seller_profile["id"]),
        buyer_id=str(signal["buyer_id"]),
        truth_score=truth,
        opportunity_score=score,
        decision_status=decision,
        hard_gate_passed=not blockers,
        component_scores=components,
        why_now=why_now,
        gaps=gaps,
        blockers=blockers,
        next_action=choose_next_action(decision, gaps, signal.get("next_action")),
        match_results=[asdict(item) for item in matches],
        ruleset_version=RULESET_VERSION,
        input_snapshot_sha256=canonical_hash(snapshot),
    )


def rank_opportunities(signals: list[dict[str, Any]], seller_profile: dict[str, Any], limit: int = 5) -> list[dict[str, Any]]:
    decisions = [asdict(assess_opportunity(signal, seller_profile)) for signal in signals]
    decisions.sort(key=lambda item: (-item["opportunity_score"], item["opportunity_id"]))
    for index, item in enumerate(decisions[: max(0, limit)], 1):
        item["rank"] = index
    return decisions[: max(0, limit)]
