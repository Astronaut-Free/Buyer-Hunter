"""13-class market-access / trade-risk taxonomy for a single RFQ.

``classify_risk_items`` is pure and deterministic: identical
``(demand, fit_report, row, buyer_identity_status)`` -> identical
``(risk_items, access_status)``. No network, no DB. It reads the seller catalog
only through the ``catalog`` argument; callers in the pipeline pass their already
loaded catalog, so that path does no I/O either. When ``catalog`` is omitted a
one-time lazy load of the committed ``seller_sku_catalog_v1.json`` is used as a
fallback (same deterministic file ``supply_demand_fit_v1`` reads).

Taxonomy — .agents/skills/buyer-hunter-market-access-risk/SKILL.md:
  IDENTITY_UNKNOWN  PLATFORM_ONLY_CONTACT  QUANTITY_SUSPECT  SPECIFICATION_GAP
  CERTIFICATION_GAP  MARKET_ACCESS_UNKNOWN  PAYMENT_TERM_RISK  ORIGIN_CONFLICT
  DELIVERY_CONFLICT
  CREDIT_UNKNOWN  FRAUD_SIGNAL  IP_CONFLICT  CONTRACT_RISK      (rule-based, no
  external providers — the four classes the audit flagged as missing)

Each risk item: ``{code, severity, evidence, reason, mitigation, review_by}``
  severity   : HIGH | MEDIUM | LOW
  evidence   : the span / value the trigger fired on
  review_by  : the checkpoint by which a human must clear it
               (触达前 = before outreach, 报价前 = before quoting,
                承诺前 = before commitment)

access_status: PASS | CONDITIONAL | BLOCK | UNKNOWN
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # hints only — never imported at runtime
    from supply_demand_fit_v1 import FitReport, RfqDemand


_SEVERITY_RANK = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}

# a captured origin phrase naming any of these means "China supply is fine"
_ORIGIN_ALLOWED = {"china", "chinese", "prc", "p.r.c", "p.r.c.", "guizhou", "asia", "asian", "cn"}
# words that precede "origin" when the buyer is *asking for* origin info, not
# imposing an origin requirement
_ORIGIN_SKIP = {
    "state", "states", "stating", "please", "specify", "provide", "mention",
    "confirm", "declare", "indicate", "share", "note", "with", "your", "their",
    "crop", "same", "each", "both", "this", "that", "and", "any", "all", "the",
    "preferred", "acceptable", "current", "given", "known", "single", "other",
    "including", "regarding", "about", "send", "quote", "detail", "details",
}
_ORIGIN_COLON_RE = re.compile(
    r"\b(?:country\s+of\s+origin|origin)\s*(?:is|:|=|-)\s*([a-z][a-z ,./&'-]{2,40})",
    re.I,
)
_ORIGIN_ADJ_RE = re.compile(r"\b([a-z]{4,})\s+origin\b", re.I)
_MADE_IN_RE = re.compile(
    r"\b(?:made\s+in|product\s+of|manufactured\s+in|grown\s+in)\s+([a-z][a-z ,./&'-]{2,30})",
    re.I,
)
_ORIGIN_STOPWORDS = re.compile(
    r"\b(hs\s*code|quantity|packing|packaging|payment|shipping|destination|"
    r"moisture|please|note|only|preferred|and|or|is|will|would|shall)\b",
    re.I,
)
_KNOWN_PLACES = {
    "india", "indian", "vietnam", "vietnamese", "thailand", "thai", "japan",
    "japanese", "korea", "korean", "turkey", "turkish", "egypt", "egyptian",
    "brazil", "brazilian", "kenya", "kenyan", "indonesia", "indonesian",
    "srilanka", "sri", "ceylon", "ceylonese", "france", "french", "germany",
    "german", "italy", "italian", "spain", "spanish", "usa", "america",
    "american", "canada", "canadian", "mexico", "mexican", "peru", "peruvian",
    "argentina", "uganda", "ugandan", "tanzania", "tanzanian", "nigeria",
    "nigerian", "ghana", "morocco", "moroccan", "ethiopia", "ethiopian", "iran",
    "iranian", "pakistan", "pakistani", "bangladesh", "nepal", "nepali",
    "malaysia", "malaysian", "taiwan", "taiwanese", "europe", "european",
    "russia", "russian", "ukraine", "ukrainian", "colombia", "colombian",
    "dominican", "guatemala", "honduras",
}

_PAYMENT_RISKY_SUBSTR = (
    "credit term", "open account", "consignment", "usance", "deferred payment",
    "payment after delivery", "payment upon arrival", "tt after", "t/t after",
    "net 30", "net 60", "net 90", "net-30", "net-60", "net30", "net60",
)
_PAYMENT_RISKY_RE = re.compile(r"(?<![a-z0-9])(?:d/a|o/a|d\.a\.|o\.a\.)(?![a-z0-9])", re.I)
_PAYMENT_MENTION = (
    "payment term", "payment:", "pay term", "terms of payment", "l/c", "lc ",
    "letter of credit", "t/t", "tt ", "d/p", "dp at sight", "advance payment",
    "advance ", "paypal", "escrow", "western union", "wire transfer",
    "bank transfer", "100% ", "upfront", "in advance", "prepay", "deposit",
)
_INCOTERMS = ("fob", "cif", "ddp", "exw", "cfr", "fca", "cpt", "cip", "dap", "dpu")

# free-mail contact domains: combined with an unresolved identity they are a
# fraud signal (no verifiable corporate identity behind the address)
_FREE_MAIL_DOMAINS = (
    "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.co.uk",
    "aol.com", "icloud.com", "qq.com", "163.com", "126.com", "sina.com",
    "sina.cn", "foxmail.com", "proton.me", "protonmail.com", "live.com",
    "msn.com", "yandex.com", "mail.ru",
)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[a-z]{2,}", re.I)

# brand names that flag possible IP / trademark exposure when the demand
# references them without any authorization evidence
_BRAND_LEXICON = (
    "茅台", "五粮液", "星巴克", "瑞幸", "喜茶", "奈雪", "蜜雪冰城", "三只松鼠",
    "百草味", "良品铺子", "元气森林", "农夫山泉", "康师傅", "统一", "雀巢",
    "starbucks", "nestle", "nescafe", "nutella", "haribo", "ferrero",
    "coca-cola", "cocacola", "pepsi", "lipton", "twinings", "tazo",
    "celestial", "red bull", "redbull", "monster energy", "kellogg",
    "mars inc", "kinder", "lindt", "toblerone", "oreo", "mcdonald",
    "kfc", "subway", "domino", "burger king",
)

# full-advance / no-guarantee payment demands (contract-dispute exposure)
_CONTRACT_RISK_SUBSTR = (
    "无担保全预付", "全款预付", "全款支付", "全额预付", "100% 预付",
    "100% t/t in advance", "100% tt advance", "full payment in advance",
    "100% advance payment", "100% prepayment", "no guarantee", "without guarantee",
)

_DEFAULT_BOUNDS = {"max_capacity_kg": 8000.0, "min_moq_kg": 25.0, "min_lead_days": 25}
_CATALOG_CACHE: dict[str, Any] | None = None


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _item(code: str, severity: str, *, evidence: str, reason: str,
          mitigation: str, review_by: str) -> dict[str, str]:
    return {
        "code": code,
        "severity": severity,
        "evidence": evidence,
        "reason": reason,
        "mitigation": mitigation,
        "review_by": review_by,
    }


def _lazy_catalog() -> dict[str, Any]:
    global _CATALOG_CACHE
    if _CATALOG_CACHE is None:
        try:
            from supply_demand_fit_v1 import load_catalog

            _CATALOG_CACHE = load_catalog()
        except Exception:  # pragma: no cover - defensive
            _CATALOG_CACHE = {}
    return _CATALOG_CACHE


def _capacity_bounds(catalog: dict[str, Any] | None) -> dict[str, float]:
    catalog = catalog if catalog is not None else _lazy_catalog()
    caps: list[float] = []
    moqs: list[float] = []
    leads: list[float] = []
    for seller in (catalog or {}).get("sellers", []):
        for sku in seller.get("skus", []):
            cap = sku.get("monthly_capacity_kg")
            moq = sku.get("moq_kg")
            lead = sku.get("delivery_days", sku.get("lead_time_days"))
            if cap:
                caps.append(float(cap))
            if moq:
                moqs.append(float(moq))
            if lead:
                leads.append(float(lead))
    return {
        "max_capacity_kg": max(caps) if caps else _DEFAULT_BOUNDS["max_capacity_kg"],
        "min_moq_kg": min(moqs) if moqs else _DEFAULT_BOUNDS["min_moq_kg"],
        "min_lead_days": min(leads) if leads else _DEFAULT_BOUNDS["min_lead_days"],
    }


def _evaluations(fit_report: Any) -> list[dict[str, Any]]:
    if fit_report is None:
        return []
    if hasattr(fit_report, "all_evaluations"):
        return list(fit_report.all_evaluations or [])
    if isinstance(fit_report, dict):
        return list(fit_report.get("all_evaluations", []) or [])
    return []


def _eligible(fit_report: Any) -> list[dict[str, Any]]:
    if fit_report is None:
        return []
    if hasattr(fit_report, "eligible_matches"):
        return list(fit_report.eligible_matches or [])
    if isinstance(fit_report, dict):
        return list(fit_report.get("eligible_matches", []) or [])
    return []


def _cert_gap(fit_report: Any) -> tuple[bool, str]:
    for evaluation in _evaluations(fit_report):
        for check in evaluation.get("checks", []):
            if check.get("dimension") == "mandatory_certs" and check.get("status") in {"FAIL", "UNKNOWN"}:
                sku = evaluation.get("sku", "?")
                return True, f"{sku}: {check.get('detail') or '认证缺口'}"
    return False, ""


def _clean_origin(raw: str) -> str:
    text = (raw or "").lower().strip(" .,:;-/&'")
    text = _ORIGIN_STOPWORDS.split(text)[0]
    return text.strip(" .,:;-/&'")


def _origin_allowed(candidate: str) -> bool:
    words = set(re.findall(r"[a-z.]+", candidate.lower()))
    return bool(words & _ORIGIN_ALLOWED) or "china" in candidate


def _looks_like_place(word: str) -> bool:
    if word in _KNOWN_PLACES:
        return True
    return bool(re.search(r"(ian|ese|ish|ean|an)$", word)) and len(word) >= 5


def _origin_conflict(text: str) -> str:
    for regex in (_ORIGIN_COLON_RE, _MADE_IN_RE):
        for match in regex.finditer(text):
            candidate = _clean_origin(match.group(1))
            if candidate and candidate not in _ORIGIN_SKIP and not _origin_allowed(candidate):
                if candidate in {"worldwide", "any", "anywhere", "overseas", "abroad", "global", "world wide"}:
                    continue
                return f"原产地要求：{candidate}"
    for match in _ORIGIN_ADJ_RE.finditer(text):
        word = match.group(1).lower()
        if word in _ORIGIN_SKIP or _origin_allowed(word):
            continue
        if _looks_like_place(word):
            return f"原产地要求：{word}（非中国 / 贵州）"
    return ""


def _quantity_suspect(demand: Any, bounds: dict[str, float]) -> str:
    precision = str(getattr(demand, "quantity_precision", "UNKNOWN") or "UNKNOWN")
    qty = getattr(demand, "quantity_kg", None)
    if precision == "UNKNOWN":
        return "数量精度=UNKNOWN，未取得可核算的采购量"
    if qty is None:
        return ""
    ceiling = bounds["max_capacity_kg"] * 3
    floor = bounds["min_moq_kg"] * 0.1
    if qty > ceiling:
        return (
            f"需求约 {qty:g} kg，超过供给池最大月产能 "
            f"{bounds['max_capacity_kg']:g} kg 的 3 倍"
        )
    if qty < floor:
        return (
            f"需求约 {qty:g} kg，低于供给池最小 MOQ "
            f"{bounds['min_moq_kg']:g} kg 的 1/10"
        )
    return ""


def _payment_term_risk(text: str, demand: Any) -> tuple[str, str, str] | None:
    qty = getattr(demand, "quantity_kg", None) or 0.0
    large = qty > 1000
    hit = next((term for term in _PAYMENT_RISKY_SUBSTR if term in text), None)
    if not hit and _PAYMENT_RISKY_RE.search(text):
        hit = "D/A 或 O/A"
    if hit:
        severity = "HIGH" if large else "MEDIUM"
        evidence = f"正文含高风险结算条款「{hit.strip()}」"
        if large:
            evidence += f"，且订单量约 {qty:g} kg"
        return severity, evidence, "买家要求赊账 / 延期付款类条款，出口收款风险偏高"
    if large and not any(mention in text for mention in _PAYMENT_MENTION):
        return "LOW", f"订单量约 {qty:g} kg，但正文未披露任何付款条款", "付款条款未披露"
    return None


def _delivery_conflict(demand: Any, text: str, bounds: dict[str, float]) -> str:
    deadline = getattr(demand, "deadline_days", None)
    if deadline is not None and deadline < bounds["min_lead_days"]:
        return (
            f"交付剩余 {deadline} 天，短于供给池最快交期 "
            f"{bounds['min_lead_days']:g} 天"
        )
    if getattr(demand, "destination_market", None) is None:
        for incoterm in _INCOTERMS:
            if re.search(rf"(?<![a-z]){incoterm}(?![a-z])", text):
                return f"正文出现贸易术语「{incoterm.upper()}」但目的市场未知，无法评估交付"
    return ""


def _free_mail_contact(row: dict[str, Any], text: str) -> str:
    """Return the free-mail address found in contact fields / body, else ''."""
    haystack = " ".join(
        str(row.get(key) or "")
        for key in ("public_business_emails", "contact_email_raw", "contact_person_raw", "title", "description_raw")
    )
    for match in _EMAIL_RE.findall(haystack):
        host = match.split("@")[-1].casefold()
        if host in _FREE_MAIL_DOMAINS:
            return match
    return ""


def _brand_hit(text: str) -> str:
    for brand in _BRAND_LEXICON:
        if brand in text:
            return brand
    return ""


def _contract_risk(text: str) -> str:
    hit = next((term for term in _CONTRACT_RISK_SUBSTR if term in text), None)
    return hit or ""


def _access_status(items: list[dict[str, str]], demand: Any, fit_report: Any) -> str:
    severities = {item["severity"] for item in items}
    codes = {item["code"] for item in items}

    cert_hard_fail = any(
        check.get("dimension") == "mandatory_certs" and check.get("status") == "FAIL"
        for evaluation in _evaluations(fit_report)
        for check in evaluation.get("checks", [])
    )
    if cert_hard_fail and not _eligible(fit_report):
        return "BLOCK"

    if "HIGH" in severities or "MARKET_ACCESS_UNKNOWN" in codes:
        status = "CONDITIONAL"
    elif "MEDIUM" not in severities:
        status = "PASS"
    else:
        status = "CONDITIONAL"

    if status == "PASS" and getattr(demand, "destination_market", None) is None:
        return "UNKNOWN"
    return status


# --------------------------------------------------------------------------- #
# public API
# --------------------------------------------------------------------------- #
def classify_risk_items(
    demand: "RfqDemand",
    fit_report: "FitReport",
    row: dict[str, Any],
    *,
    buyer_identity_status: str = "UNRESOLVED",
    catalog: dict[str, Any] | None = None,
) -> tuple[list[dict[str, str]], str]:
    """Return ``(risk_items, access_status)`` for one RFQ. Pure / deterministic."""
    text = f"{row.get('title', '') or ''} {row.get('description_raw', '') or ''}".casefold()
    bounds = _capacity_bounds(catalog)
    items: list[dict[str, str]] = []

    identity = str(buyer_identity_status or "UNRESOLVED").upper()
    if identity in {"PERSON_ONLY", "UNRESOLVED"}:
        items.append(_item(
            "IDENTITY_UNKNOWN", "MEDIUM",
            evidence=f"buyer_identity_status={identity}",
            reason="买家仅为个人 / 联系人或完全未解析，法定采购主体尚未核验",
            mitigation="用域名 / 平台账户 ID / 官方页面 / 可复核联系方式核验主体后再承诺",
            review_by="触达前",
        ))

    gate = str(row.get("contact_gate", "") or "").strip()
    if gate:
        items.append(_item(
            "PLATFORM_ONLY_CONTACT", "LOW",
            evidence=f"contact_gate={gate}",
            reason="当前仅能经平台公开响应渠道联系买家",
            mitigation="经平台入口取得回应后补齐公开商务邮箱 / 官网等独立渠道",
            review_by="触达前",
        ))

    if str(row.get("specs_present", "")) != "True":
        items.append(_item(
            "SPECIFICATION_GAP", "MEDIUM",
            evidence=f"specs_present={row.get('specs_present') or 'False'}",
            reason="关键产品规格（等级 / 目数 / 水分 / 用途等）仍待买家确认",
            mitigation="报价前用规格确认清单向买家书面确认必需规格",
            review_by="报价前",
        ))

    if str(row.get("destination_present", "")) != "True":
        items.append(_item(
            "MARKET_ACCESS_UNKNOWN", "MEDIUM",
            evidence=f"destination_present={row.get('destination_present') or 'False'}",
            reason="最终目的市场未明确，无法确认进口法规与准入要求",
            mitigation="确认交付目的市场后比对该市场的强制法规与文件",
            review_by="报价前",
        ))

    cert_gap, cert_detail = _cert_gap(fit_report)
    if cert_gap:
        items.append(_item(
            "CERTIFICATION_GAP", "MEDIUM",
            evidence=cert_detail,
            reason="买方所需认证与匹配 SKU 之间存在缺口",
            mitigation="报价前确认认证适用范围，或改配已覆盖该认证的 SKU",
            review_by="报价前",
        ))

    quantity_evidence = _quantity_suspect(demand, bounds)
    if quantity_evidence:
        items.append(_item(
            "QUANTITY_SUSPECT", "MEDIUM",
            evidence=quantity_evidence,
            reason="采购数量缺失或明显偏离贵州供给池的产能 / MOQ 区间",
            mitigation="核实数量单位与订单批量，必要时拆分批次或转介产能匹配方",
            review_by="报价前",
        ))

    payment = _payment_term_risk(text, demand)
    if payment is not None:
        severity, evidence, reason = payment
        items.append(_item(
            "PAYMENT_TERM_RISK", severity,
            evidence=evidence,
            reason=reason,
            mitigation="承诺前确认结算方式，优先 L/C 或预付，必要时投保出口信用",
            review_by="承诺前",
        ))

    origin_evidence = _origin_conflict(text)
    if origin_evidence:
        items.append(_item(
            "ORIGIN_CONFLICT", "HIGH",
            evidence=origin_evidence,
            reason="需求写明的原产地要求与贵州（中国）供给不一致",
            mitigation="向买家确认是否接受中国 / 贵州原产；不接受则不投入报价",
            review_by="报价前",
        ))

    delivery_evidence = _delivery_conflict(demand, text, bounds)
    if delivery_evidence:
        items.append(_item(
            "DELIVERY_CONFLICT", "MEDIUM",
            evidence=delivery_evidence,
            reason="交付截止或贸易术语与可交付条件之间存在冲突或缺口",
            mitigation="确认交货期与贸易术语，比对最快交期与目的港安排",
            review_by="报价前",
        ))

    # --- rule-based depth: credit / fraud / IP / contract (no external providers)
    identity_unresolved = identity in {"PERSON_ONLY", "UNRESOLVED"}
    credit_refs = [
        v for key, v in row.items()
        if key in ("public_business_emails", "buyer_domain", "platform_account_id", "registration_id")
        and str(v or "").strip()
    ]
    if identity_unresolved and not credit_refs:
        items.append(_item(
            "CREDIT_UNKNOWN", "LOW",
            evidence=f"buyer_identity_status={identity}, no verifiable credit anchor",
            reason="买家无可核验的信用锚点（域名/平台账户/注册号），信用背景未知",
            mitigation="通过平台评价、海关公开记录或第三方信用工具补充买家信用背景",
            review_by="触达前",
        ))

    free_mail = _free_mail_contact(row, text)
    if free_mail and identity_unresolved:
        items.append(_item(
            "FRAUD_SIGNAL", "MEDIUM",
            evidence=f"免费邮箱联系地址 {free_mail} 且法定主体未解析",
            reason="免费邮箱 + 无公司主体，冒充采购方的欺诈风险偏高",
            mitigation="坚持平台内沟通或企业邮箱复核，拒绝向个人账户支付任何费用",
            review_by="触达前",
        ))

    brand = _brand_hit(text)
    if brand:
        items.append(_item(
            "IP_CONFLICT", "MEDIUM",
            evidence=f"需求提及品牌「{brand}」",
            reason="需求指向特定品牌且未见授权/OEM 证据，贴牌或侵权风险",
            mitigation="确认 OEM/贴牌授权或品牌方许可后再报价，禁止未授权仿牌",
            review_by="报价前",
        ))

    contract_hit = _contract_risk(text)
    if contract_hit:
        items.append(_item(
            "CONTRACT_RISK", "MEDIUM",
            evidence=f"付款/担保条款：「{contract_hit.strip()}」",
            reason="全款预付且无担保条款，履约与货款追索争议风险偏高",
            mitigation="承诺前补充合同担保条款（质保/验收/退款），必要时投保出口信用",
            review_by="承诺前",
        ))

    # FRAUD_SIGNAL escalates when the quantities are also suspect
    codes = {entry["code"] for entry in items}
    if "FRAUD_SIGNAL" in codes and "QUANTITY_SUSPECT" in codes:
        for entry in items:
            if entry["code"] == "FRAUD_SIGNAL" and entry["severity"] != "HIGH":
                entry["severity"] = "HIGH"
                entry["reason"] += "；叠加数量异常，升级为高风险"
                break

    items.sort(key=lambda entry: (_SEVERITY_RANK.get(entry["severity"], 3), entry["code"]))
    return items, _access_status(items, demand, fit_report)


def classify_risk_items_from_context(
    *,
    category: str = "",
    demand_title: str = "",
    message_text: str = "",
    quantity: str = "",
    destination: str = "",
    buyer_identity_status: str = "UNRESOLVED",
    contact_gate: str = "",
    contact_email_raw: str = "",
    catalog: dict[str, Any] | None = None,
) -> tuple[list[dict[str, str]], str]:
    """Adapter for the capability CLI: build a minimal RFQ then classify.

    Kept out of ``classify_risk_items`` so that function stays pure; this one is
    allowed to build a ``RfqDemand`` / ``FitReport`` via ``supply_demand_fit_v1``.
    """
    from supply_demand_fit_v1 import FitReport, evaluate, parse_demand

    cat = str(category or "").strip().upper()
    destination = str(destination or "").strip()
    blob = f"{demand_title or ''} {message_text or ''}".casefold()
    spec_present = any(
        needle in blob
        for needle in ("specification", "specifications", "grade", "type:", "type :", "mesh", "particle size")
    )
    row = {
        "category_code": cat,
        "title": str(demand_title or ""),
        "description_raw": str(message_text or ""),
        "quantity_raw": str(quantity or ""),
        "buyer_country_code": destination if len(destination) == 2 else "",
        "buyer_country_raw": destination if len(destination) != 2 else "",
        "contact_gate": contact_gate or "",
        "contact_email_raw": contact_email_raw or "",
        "specs_present": "True" if spec_present else "False",
        "destination_present": "True" if destination else "False",
        "buyer_name_raw": "",
    }
    catalog = catalog if catalog is not None else _lazy_catalog()
    demand = parse_demand(row)
    if cat:
        fit_report: Any = evaluate(row, catalog)
    else:
        fit_report = FitReport(
            supply_pool_status="NO_MATCH", best_verdict="NONE", best_fit_score=0.0,
            eligible_matches=[], all_evaluations=[], summary_zh="",
        )
    return classify_risk_items(
        demand, fit_report, row,
        buyer_identity_status=buyer_identity_status, catalog=catalog,
    )
