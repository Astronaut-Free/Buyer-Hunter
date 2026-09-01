"""Evidence-safe and deterministic A3 purchase-timing capability."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from .common import envelope, merged_fields, unique_strings

A3 = "qianpulse.a3.purchase_timing"
VERSION = "a3-purchase-timing-v1.1.0"
CLOSED_RE = re.compile(r"\b(closed|awarded|expired|cancelled|canceled)\b|已关闭|已授标|已过期|已取消", re.I)
URGENT_RE = re.compile(r"\b(urgent|urgently|asap|immediately|deadline)\b|紧急|尽快|立即|截止", re.I)
TIMING_RE = re.compile(r"\b(delivery|deliver|lead time|deadline|quarter|month|week)\b|交期|到货|月份|季度|周内", re.I)
RFQ_RE = re.compile(r"\b(rfq|request for quotation|need|buy|purchase|required)\b|询价|采购|求购|需要", re.I)


def _instant(value: Any) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def run(context: dict[str, Any]) -> dict[str, Any]:
    """Evaluate timing using only the supplied evidence and evaluated_at."""
    evaluated = _instant(context.get("evaluated_at"))
    # Timing must be supported by buyer/timing evidence.  Seller catalog refs
    # are intentionally excluded: they cannot prove when a buyer will buy.
    message = context.get("latest_buyer_message") or {}
    message_refs = message.get("evidence_refs") if isinstance(message, dict) else []
    refs = unique_strings(
        message.get("evidence_ref") if isinstance(message, dict) else None,
        message_refs,
        context.get("evidence_refs"),
    )
    changed = context.get("changed_fields") or []
    if not context.get("opportunity_id"):
        return envelope(A3, VERSION, "BLOCKED", {}, changed_fields=changed, missing_evidence=["opportunity_id"], refs=refs,
                        human_review_required=True)
    if evaluated is None:
        missing = ["evaluated_at"]
        return envelope(A3, VERSION, "ERROR", {}, changed_fields=changed, missing_evidence=missing,
                        refs=refs, error={"code": "INVALID_CAPABILITY_INPUT", "message": ", ".join(missing)})

    fields = merged_fields(context)
    content = str(message.get("content") if isinstance(message, dict) else message or "")
    published = _instant(context.get("published_at") or fields.get("published_at"))
    deadline = _instant(context.get("deadline_at") or fields.get("deadline_at") or fields.get("delivery_date"))
    observed = _instant(context.get("observed_at") or fields.get("observed_at"))
    updated = _instant(context.get("last_updated_at") or fields.get("last_updated_at"))
    timing_signal = bool(TIMING_RE.search(content))
    explicit_urgency = bool(URGENT_RE.search(content))
    explicit_closed = bool(CLOSED_RE.search(content))
    why_now: list[dict[str, Any]] = []
    counter: list[dict[str, Any]] = []

    if (explicit_closed or deadline or timing_signal or published or updated or observed) and not refs:
        status, score = "UNKNOWN", None
    elif explicit_closed:
        counter.append({"field": "latest_buyer_message", "value": content, "evidence_ref": refs[0] if refs else None,
                        "rule": "explicit_closed_status", "result": "CLOSED"})
        status, score = "CLOSED", 0
    elif deadline and deadline < evaluated:
        counter.append({"field": "deadline_at", "value": deadline.isoformat(), "evidence_ref": refs[0] if refs else None,
                        "rule": "deadline_before_evaluated_at", "result": "CLOSED"})
        status, score = "CLOSED", 0
    else:
        anchor = max((item for item in (published, updated, observed) if item), default=None)
        age_days = (evaluated - anchor).days if anchor else None
        if deadline or timing_signal or (published and RFQ_RE.search(content)):
            status = "OPEN"
            score = 90 if explicit_urgency else 80 if deadline else 70 if age_days is not None and age_days <= 30 else 60
        elif anchor:
            status = "MONITOR"
            score = 45 if age_days is not None and age_days <= 90 else 25
        else:
            status, score = "UNKNOWN", None
        if status == "OPEN":
            why_now.append({"field": "timing_signal", "value": deadline.isoformat() if deadline else content,
                            "evidence_ref": refs[0] if refs else None, "rule": "active_purchase_timing", "result": "OPEN"})

    urgency = "HIGH" if explicit_urgency or (deadline and 0 <= (deadline - evaluated).days <= 14) else (
        "MEDIUM" if status == "OPEN" else "LOW" if status == "MONITOR" else "UNKNOWN"
    )
    missing = ["purchase_timing_signal"] if status == "UNKNOWN" else []
    return envelope(
        A3, VERSION, "MORE_EVIDENCE" if status == "UNKNOWN" else "DONE",
        {
            "window_status": status,
            "window_score": score,
            "urgency": urgency,
            "transaction_stage": "CLOSED" if status == "CLOSED" else "ACTIVE_RFQ" if status == "OPEN" else "DISCOVERY",
            "continuity_signals": ["RECENT_UPDATE"] if updated or observed else [],
            "why_now": why_now,
            "counter_evidence": counter,
            "follow_up_window": deadline.isoformat() if deadline and status != "CLOSED" else None,
            "evaluated_at": evaluated.isoformat(),
            "ruleset_version": VERSION,
        },
        changed_fields=changed, missing_evidence=missing, refs=refs,
        human_review_required=status == "UNKNOWN",
    )
