"""Evidence-bounded A5 market-access and trade-risk capability."""

from __future__ import annotations

from typing import Any

from .common import envelope, evidence_refs, unique_strings

A5 = "qianpulse.a5.trade_risk"
VERSION = "a5-trade-risk-v1.1.0"
RISK_CODES = {
    "IDENTITY_UNKNOWN", "PLATFORM_ONLY_CONTACT", "QUANTITY_SUSPECT", "SPECIFICATION_GAP",
    "CERTIFICATION_GAP", "MARKET_ACCESS_UNKNOWN", "PAYMENT_TERM_RISK", "ORIGIN_CONFLICT", "DELIVERY_CONFLICT",
}


def _list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).upper() for item in value]
    return [item.strip().upper() for item in str(value or "").split(",") if item.strip()]


def run(context: dict[str, Any]) -> dict[str, Any]:
    """Return BLOCK only for evidence-backed prohibitions or explicit hard gaps."""
    changed = context.get("changed_fields") or []
    refs = evidence_refs(context)
    if not context.get("opportunity_id"):
        return envelope(A5, VERSION, "BLOCKED", {}, changed_fields=changed, missing_evidence=["opportunity_id"], refs=refs,
                        human_review_required=True)
    if not context.get("evaluated_at"):
        missing = ["evaluated_at"]
        return envelope(A5, VERSION, "ERROR", {}, changed_fields=changed, missing_evidence=missing, refs=refs,
                        error={"code": "INVALID_CAPABILITY_INPUT", "message": ", ".join(missing)})

    buyer_country = context.get("buyer_country")
    destination = context.get("destination_market")
    policy = context.get("seller_policy") or context.get("seller_context") or {}
    sku = context.get("seller_sku") or {}
    regulatory = context.get("regulatory_evidence") or []
    risks: list[dict[str, Any]] = []
    missing: list[str] = []
    if not destination:
        missing.append("destination_market")
        risks.append({"code": "MARKET_ACCESS_UNKNOWN", "severity": "MEDIUM", "reason": "destination_market is missing", "evidence_ref": None})
    else:
        destination = str(destination).upper()

    blocked = _list(policy.get("blocked_markets"))
    market_evidence = [item for item in regulatory if str(item.get("market") or "").upper() == destination and item.get("evidence_ref")]
    prohibition = next((item for item in regulatory if str(item.get("result") or "").upper() in {"PROHIBITED", "BLOCK"}
                        and item.get("evidence_ref") and str(item.get("market") or "").upper() == destination), None)
    explicit_sku_gap = next((item for item in sku.get("hard_gaps", []) if item.get("evidence_ref")), None)
    if destination in blocked and not prohibition:
        risks.append({"code": "MARKET_ACCESS_UNKNOWN", "severity": "HIGH",
                      "reason": "seller policy lists the market as blocked but lacks regulatory evidence", "evidence_ref": None})
    if destination and not market_evidence:
        missing.append("regulatory_evidence")
        risks.append({"code": "MARKET_ACCESS_UNKNOWN", "severity": "MEDIUM",
                      "reason": "no current regulatory evidence for destination_market", "evidence_ref": None})
    if prohibition:
        risks.append({"code": "MARKET_ACCESS_UNKNOWN", "severity": "HIGH", "reason": str(prohibition.get("reason") or "explicit prohibition"),
                      "evidence_ref": prohibition["evidence_ref"]})
    if explicit_sku_gap:
        code = str(explicit_sku_gap.get("code") or "CERTIFICATION_GAP")
        code = code if code in RISK_CODES else "CERTIFICATION_GAP"
        risks.append({"code": code, "severity": "HIGH", "reason": str(explicit_sku_gap.get("reason") or "SKU hard gap"),
                      "evidence_ref": explicit_sku_gap["evidence_ref"]})

    required_certs = set(_list((context.get("product") or {}).get("mandatory_certifications")))
    if required_certs and "certifications" not in sku:
        missing.append("seller_sku.certifications")
        risks.append({"code": "CERTIFICATION_GAP", "severity": "MEDIUM", "reason": "seller certification evidence is missing", "evidence_ref": None})
    elif required_certs - set(_list(sku.get("certifications"))):
        risks.append({"code": "CERTIFICATION_GAP", "severity": "HIGH", "reason": "seller SKU explicitly lacks required certification", "evidence_ref": None})

    payment_terms = context.get("payment_terms")
    allowed_payment = _list(policy.get("allowed_payment_terms"))
    if payment_terms and allowed_payment and str(payment_terms).upper() not in allowed_payment:
        risks.append({"code": "PAYMENT_TERM_RISK", "severity": "MEDIUM", "reason": "requested payment terms are outside seller policy", "evidence_ref": None})

    if prohibition or explicit_sku_gap:
        access, run_status = "BLOCK", "BLOCKED"
    elif not destination:
        access, run_status = "UNKNOWN", "MORE_EVIDENCE"
    elif missing or risks:
        access, run_status = "CONDITIONAL", "MORE_EVIDENCE" if missing else "DONE"
    else:
        access, run_status = "PASS", "DONE"
    return envelope(A5, VERSION, run_status, {
        "buyer_country": buyer_country,
        "destination_market": destination,
        "access_status": access,
        "risk_items": risks,
        "required_documents": unique_strings(policy.get("required_documents")),
        "missing_evidence": unique_strings(missing),
        "review_by": None,
        "evaluated_at": context["evaluated_at"],
        "ruleset_version": VERSION,
    }, changed_fields=changed, missing_evidence=unique_strings(missing), refs=refs,
       human_review_required=run_status in {"MORE_EVIDENCE", "BLOCKED"})
