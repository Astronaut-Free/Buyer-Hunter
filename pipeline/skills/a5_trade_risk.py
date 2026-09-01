"""Evidence-bounded A5 market-access and trade-risk capability."""

from __future__ import annotations

import re
from typing import Any

from .common import envelope, evidence_refs, merged_fields, unique_strings

A5 = "qianpulse.a5.trade_risk"
VERSION = "a5-trade-risk-v1.1.0"
RISK_CODES = {
    "IDENTITY_UNKNOWN", "PLATFORM_ONLY_CONTACT", "QUANTITY_SUSPECT", "SPECIFICATION_GAP",
    "CERTIFICATION_GAP", "MARKET_ACCESS_UNKNOWN", "PAYMENT_TERM_RISK", "ORIGIN_CONFLICT", "DELIVERY_CONFLICT",
    # Provider-free depth classes (mirrors the closed-loop A2 work): credit anchor,
    # free-mail fraud, brand/IP exposure and full-prepayment contract exposure.
    "CREDIT_UNKNOWN", "FRAUD_SIGNAL", "IP_CONFLICT", "CONTRACT_RISK",
}

FREE_MAIL_DOMAINS = {
    "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.co.uk", "aol.com",
    "icloud.com", "qq.com", "163.com", "126.com", "sina.com", "sina.cn", "foxmail.com",
    "proton.me", "protonmail.com", "live.com", "msn.com", "yandex.com", "mail.ru",
}
BRANDS = [
    "茅台", "五粮液", "星巴克", "瑞幸", "喜茶", "奈雪", "蜜雪冰城", "三只松鼠",
    "百草味", "良品铺子", "元气森林", "农夫山泉", "康师傅", "统一", "雀巢",
    "starbucks", "nestle", "nescafe", "nutella", "haribo", "ferrero", "coca-cola",
    "cocacola", "pepsi", "lipton", "twinings", "tazo", "celestial", "red bull",
    "redbull", "monster energy", "kellogg", "mars inc", "kinder", "lindt",
    "toblerone", "oreo", "mcdonald", "kfc", "subway", "domino", "burger king",
]
CONTRACT_TERMS = [
    "无担保全预付", "全款预付", "全款支付", "全额预付", "100% 预付",
    "100% t/t in advance", "100% tt advance", "full payment in advance",
    "100% advance payment", "100% prepayment", "no guarantee", "without guarantee",
]
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")


def _buyer_risk_items(context: dict[str, Any]) -> list[dict[str, Any]]:
    """Depth checks that need no external provider: credit anchor, fraud,
    brand/IP and contract exposure. Informational — they never block alone."""
    fields = merged_fields(context)
    message = context.get("latest_buyer_message") or {}
    message_text = str(message.get("content") if isinstance(message, dict) else message or "")
    payment_terms = context.get("payment_terms") or fields.get("payment_terms")
    haystack = " ".join(filter(None, [
        str(fields.get("demand_title") or ""), str(payment_terms or ""),
        str(fields.get("contact_email_raw") or ""), str(fields.get("public_business_emails") or ""),
        message_text,
    ])).lower()

    identity = str(fields.get("buyer_identity_status") or "UNRESOLVED").upper()
    identity_unresolved = identity in {"PERSON_ONLY", "UNRESOLVED"}
    items: list[dict[str, Any]] = []
    if identity_unresolved and not fields.get("buyer_domain") and not fields.get("platform_account_id"):
        items.append({"code": "CREDIT_UNKNOWN", "severity": "LOW", "reason": "买家无可核验的信用锚点，信用背景未知", "evidence_ref": None})
    free_mail = next((address.split("@")[1] for address in _EMAIL_RE.findall(haystack)
                      if address.split("@")[1] in FREE_MAIL_DOMAINS), None)
    if free_mail and identity_unresolved:
        quantity = str(fields.get("quantity") or fields.get("quantity_raw") or "")
        severity = "HIGH" if re.search(r"未披露|unknown", quantity, re.IGNORECASE) else "MEDIUM"
        items.append({"code": "FRAUD_SIGNAL", "severity": severity,
                      "reason": "免费邮箱 + 无公司主体，冒充采购方的欺诈风险偏高", "evidence_ref": None})
    if any(brand in haystack for brand in BRANDS):
        items.append({"code": "IP_CONFLICT", "severity": "MEDIUM",
                      "reason": "需求指向特定品牌且未见授权/OEM 证据", "evidence_ref": None})
    if any(term in haystack for term in CONTRACT_TERMS):
        items.append({"code": "CONTRACT_RISK", "severity": "MEDIUM",
                      "reason": "全款预付且无担保条款，履约争议风险偏高", "evidence_ref": None})
    return items


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

    risks.extend(_buyer_risk_items(context))

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
