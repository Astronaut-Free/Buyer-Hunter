"""A4 adapter around the authoritative Seller x SKU matching engine."""

from __future__ import annotations

from typing import Any

from pipeline.supply_demand_fit_v1 import evaluate, load_catalog

from .common import envelope, evidence_refs, merged_fields

A4 = "qianpulse.a4.supply_match"
VERSION = "a4-supply-match-v1.1.0"


def _catalog(context: dict[str, Any]) -> dict[str, Any]:
    supplied = context.get("seller_catalog")
    if supplied:
        return supplied
    seller = context.get("seller_context") or {}
    if seller.get("skus"):
        return {"catalog_version": seller.get("version") or "inline", "data_mode": seller.get("data_mode") or "LIVE", "sellers": [seller]}
    return load_catalog()


def _verified_facts(context: dict[str, Any], refs: list[str]) -> dict[str, Any]:
    """Expose only seller facts that carry an explicit evidence reference.

    These facts may answer a narrow buyer question even when the overall SKU
    fit remains MORE_EVIDENCE because another hard gate is UNKNOWN.
    """
    if not refs:
        return {}
    seller = context.get("seller_context") or {}
    sku = seller.get("seller_sku") or context.get("seller_sku") or {}
    facts: dict[str, Any] = {}
    if seller.get("delivery"):
        facts["delivery"] = seller["delivery"]
    capacity_or_moq = seller.get("moq") or seller.get("capacity")
    if capacity_or_moq:
        facts["capacity_or_moq"] = capacity_or_moq
    if sku.get("specification"):
        facts["specification"] = sku["specification"]
    certifications = sku.get("certifications") or seller.get("certifications")
    if certifications:
        facts["certifications"] = certifications
    return facts


def run(context: dict[str, Any]) -> dict[str, Any]:
    """Normalize capability input, call evaluate once, and map its report."""
    changed = context.get("changed_fields") or []
    refs = evidence_refs(context)
    verified_facts = _verified_facts(context, refs)
    if not context.get("opportunity_id"):
        return envelope(A4, VERSION, "BLOCKED", {}, changed_fields=changed, missing_evidence=["opportunity_id"], refs=refs,
                        human_review_required=True)
    if not context.get("evaluated_at"):
        missing = ["evaluated_at"]
        return envelope(A4, VERSION, "ERROR", {}, changed_fields=changed, missing_evidence=missing, refs=refs,
                        error={"code": "INVALID_CAPABILITY_INPUT", "message": ", ".join(missing)})

    fields = merged_fields(context)
    demand = {**fields, **(context.get("demand") or {})}
    message = context.get("latest_buyer_message") or {}
    text = str(message.get("content") if isinstance(message, dict) else message or "")
    category = str(demand.get("category_code") or demand.get("product") or "").strip().upper()
    if not category:
        return envelope(A4, VERSION, "MORE_EVIDENCE", {
            "eligible_sku_count": 0, "eligible_skus": [], "hard_gaps": [], "soft_gaps": [],
            "unknowns": ["CATEGORY"], "recommendation": "NEED_MORE_DATA",
            "seller_profile_version": None, "data_mode": "UNKNOWN", "evaluated_at": context["evaluated_at"],
            "ruleset_version": VERSION,
        }, changed_fields=changed, missing_evidence=["product_category"], refs=refs, human_review_required=True)

    catalog = _catalog(context)
    row = {
        "category_code": category,
        "title": str(demand.get("demand_title") or demand.get("product") or ""),
        "description_raw": " ".join(filter(None, [text, str(demand.get("specification") or ""), str(demand.get("grade") or ""),
                                                    " ".join(demand.get("mandatory_certifications") or [])])),
        "quantity_raw": str(demand.get("quantity_raw") or demand.get("quantity") or ""),
        "buyer_country_code": str(demand.get("destination_market") or ""),
        "deadline_at": demand.get("delivery_deadline") or demand.get("deadline_at"),
    }
    report = evaluate(row, catalog, evaluated_at=context["evaluated_at"])
    if not report.all_evaluations:
        return envelope(A4, VERSION, "MORE_EVIDENCE", {
            "eligible_sku_count": 0, "eligible_skus": [], "hard_gaps": [], "soft_gaps": [],
            "unknowns": [{"dimension": "seller_supply_pool", "kind": "HARD", "status": "UNKNOWN",
                          "detail": "没有可评估的同品类卖方 SKU", "field": "seller_catalog", "value": None,
                          "evidence_ref": None, "rule": "category_pool_required", "result": "UNKNOWN"}],
            "recommendation": "NEED_MORE_DATA", "seller_profile_version": catalog.get("catalog_version"),
            "data_mode": catalog.get("data_mode", "UNKNOWN"), "evaluated_at": context["evaluated_at"],
            "ruleset_version": VERSION,
        }, changed_fields=changed, missing_evidence=["seller_supply_pool"], refs=refs, human_review_required=True)
    def annotate(item: dict[str, Any]) -> dict[str, Any]:
        """Expose the evidence-bearing check shape at every A4 result level."""
        seller_ref = next(iter(item.get("evidence_refs", [])), None)
        annotated_checks = [
            {**check, "field": check["dimension"], "value": check.get("detail"),
             # A buyer-message ref cannot prove a seller SKU capability.  Keep
             # check-level provenance seller-scoped; demand refs remain on the
             # envelope for the caller to correlate separately.
             "evidence_ref": seller_ref,
             "rule": f"a4_{check['dimension']}_gate", "result": check["status"]}
            for check in item.get("checks", [])
        ]
        return {**item, "checks": annotated_checks}

    annotated_evaluations = [annotate(item) for item in report.all_evaluations]
    best = annotated_evaluations[0] if annotated_evaluations else None
    checks = best.get("checks", []) if best else []
    hard_gaps = [item for item in checks if item["kind"] == "HARD" and item["status"] == "FAIL"]
    soft_gaps = [item for item in checks if item["kind"] == "SOFT" and item["status"] == "FAIL"]
    unknowns = [item for item in checks if item["status"] == "UNKNOWN"]
    if hard_gaps or report.best_verdict == "BLOCK":
        recommendation, run_status = "NOT_FIT", "BLOCKED"
    elif unknowns:
        recommendation, run_status = "NEED_MORE_DATA", "MORE_EVIDENCE"
    elif report.best_verdict == "MATCH":
        recommendation, run_status = "FIT", "DONE"
    else:
        recommendation, run_status = "CONDITIONAL_FIT", "DONE"
    return envelope(A4, VERSION, run_status, {
        "eligible_sku_count": len(report.eligible_matches),
        "eligible_skus": [item for item in annotated_evaluations if item["verdict"] != "BLOCK"],
        "checks": checks,
        "hard_gaps": hard_gaps,
        "soft_gaps": soft_gaps,
        "unknowns": unknowns,
        "recommendation": recommendation,
        "verified_facts": verified_facts,
        "seller_profile_version": catalog.get("catalog_version"),
        "data_mode": catalog.get("data_mode", "LIVE"),
        "evaluated_at": context["evaluated_at"],
        "ruleset_version": VERSION,
    }, changed_fields=changed, missing_evidence=[item["dimension"] for item in unknowns], refs=refs,
       human_review_required=run_status != "DONE")
