"""Shared, side-effect-free helpers for capability runtimes."""

from __future__ import annotations

from typing import Any, Iterable


def unique_strings(*groups: Iterable[Any] | Any) -> list[str]:
    values: list[str] = []
    for group in groups:
        if group is None:
            continue
        items = group if isinstance(group, (list, tuple, set)) else [group]
        for item in items:
            text = str(item).strip()
            if text and text not in values:
                values.append(text)
    return values


def evidence_refs(context: dict[str, Any]) -> list[str]:
    message = context.get("latest_buyer_message") or {}
    if not isinstance(message, dict):
        message = {}
    seller = context.get("seller_context") or context.get("seller_policy") or {}
    return unique_strings(
        message.get("evidence_ref"),
        message.get("evidence_refs"),
        seller.get("evidence_refs") if isinstance(seller, dict) else [],
        context.get("evidence_refs"),
    )


def envelope(
    capability_id: str,
    version: str,
    run_status: str,
    domain_result: dict[str, Any],
    *,
    changed_fields: list[str] | None = None,
    missing_evidence: list[str] | None = None,
    refs: list[str] | None = None,
    human_review_required: bool = False,
    error: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "capability_id": capability_id,
        "capability_version": version,
        "run_status": run_status,
        "changed_fields": changed_fields or [],
        "missing_evidence": missing_evidence or [],
        "evidence_refs": refs or [],
        "human_review_required": bool(human_review_required),
        "domain_result": {**domain_result, "capability_runtime": "python"},
        "error": error,
    }


def merged_fields(context: dict[str, Any]) -> dict[str, Any]:
    state = context.get("opportunity_state") or {}
    fields = dict(state.get("fields") or {})
    fields.update(context.get("field_updates") or {})
    return fields
