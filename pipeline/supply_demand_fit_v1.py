"""Supply-demand fit: one RFQ against every Guizhou Seller x SKU.

Phase-1 spec (《6 个 SKILL 完整修改意见》第六节):
- hard conditions first (category, grade, quantity capacity, MOQ, mandatory
  certification, lead time); a hard FAIL is a BLOCK and cannot be offset;
- then soft conditions (price, OEM, private label, packaging, sample, export
  experience);
- per-SKU verdict MATCH / CONDITIONAL / BLOCK;
- no forced Top 3 - every eligible (non-BLOCK) match is returned;
- an empty or all-BLOCK pool returns a plain "no matching Guizhou supply" status.

Pure and deterministic: same RFQ + same catalog -> identical FitReport.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


CATALOG_PATH = Path(__file__).with_name("seller_sku_catalog_v1.json")
RULESET_VERSION = "supply-demand-fit-v1.0.0"

# bakery < culinary < beverage < ceremonial. A demand for grade X is met by an
# equal grade or exactly one step up (a buyer asking for culinary will not fund
# ceremonial pricing, but a seller can always supply a slightly higher grade).
GRADE_RANK = {"bakery": 0, "culinary": 1, "beverage": 2, "ceremonial": 3}

GRADE_TERMS = {
    "ceremonial": ("ceremonial", "ceremony grade", "tea ceremony"),
    "culinary": ("culinary", "cooking grade", "cooking-grade"),
    "bakery": ("bakery", "baking grade", "baking-grade", "for baking"),
    "beverage": ("beverage", "drink", "latte", "smoothie", "rtd"),
}

CERT_TERMS = {
    "USDA_ORGANIC": ("usda organic", "nop organic"),
    "EU_ORGANIC": ("eu organic", "e-coi", "ecoi", "eu-organic"),
    "ORGANIC": (" organic", "certified organic", "organic certificate"),
    "HACCP": ("haccp",),
    "ISO22000": ("iso 22000", "iso22000"),
    "KOSHER": ("kosher",),
    "HALAL": ("halal",),
    "BRC": ("brc",),
}

ORGANIC_CERTS = {"EU_ORGANIC", "USDA_ORGANIC"}

OEM_TERMS = ("oem", "private label", "private-label", "white label", "custom label", "own brand", "customized packaging")
PRIVATE_LABEL_TERMS = ("private label", "private-label", "white label", "own brand")
SAMPLE_TERMS = ("sample", "trial order", "trial batch")
RETAIL_PACKAGING_TERMS = ("retail pack", "retail pouch", "consumer pack", "custom pouch", "custom packaging", "stick pack", "sachet")

COUNTRY_TO_MARKET = {
    "united states": "US", "usa": "US", "u.s.": "US", "america": "US",
    "united kingdom": "GB", "uk": "GB", "britain": "GB",
    "germany": "DE", "netherlands": "NL", "france": "FR", "italy": "IT",
    "spain": "ES", "poland": "PL", "belgium": "BE", "finland": "FI",
    "hungary": "HU", "japan": "JP", "australia": "AU", "canada": "CA",
    "new zealand": "NZ",
}

# Bare "g" / "grams" is deliberately excluded: in RFQ text it is almost always a
# serving size or per-unit weight, not the order quantity.
QUANTITY_RE = re.compile(
    r"(\d[\d,]*(?:\.\d+)?)\s*(kgs?|kilograms?|kilo|mt\b|metric tons?|tons?|tonnes?|lbs?|pounds?|containers?|fcl|20ft|40ft|pallets?)",
    re.IGNORECASE,
)
NON_WEIGHT_QTY_RE = re.compile(r"\d[\d,]*\s*(pcs?|pieces?|units?|bags?|cartons?|boxes|cases?|sets?|packs?)\b", re.IGNORECASE)
PRICE_RE = re.compile(
    r"(?:target price|budget|price target|price around|about)\D{0,12}\$?\s*(\d[\d,]*(?:\.\d+)?)|\$\s*(\d[\d,]*(?:\.\d+)?)\s*(?:/|per)\s*kg",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Check:
    dimension: str
    kind: str  # HARD | SOFT
    status: str  # PASS | FAIL | UNKNOWN | NA
    detail: str


@dataclass(frozen=True)
class SkuMatch:
    seller_id: str
    company_name: str
    company_location: str
    sku: str
    product_name: str
    grade: str
    verdict: str  # MATCH | CONDITIONAL | BLOCK
    fit_points: float
    checks: list[dict[str, Any]]
    blockers: list[str]
    gaps: list[str]


@dataclass(frozen=True)
class FitReport:
    supply_pool_status: str  # HAS_MATCH | CONDITIONAL_ONLY | NO_MATCH
    best_verdict: str  # MATCH | CONDITIONAL | BLOCK | NONE
    best_fit_score: float
    eligible_matches: list[dict[str, Any]]
    all_evaluations: list[dict[str, Any]]
    summary_zh: str
    ruleset_version: str = RULESET_VERSION


@dataclass
class RfqDemand:
    category_code: str
    text: str
    quantity_kg: float | None = None
    quantity_precision: str = "UNKNOWN"  # EXACT | RANGE | UNKNOWN
    required_grade: str | None = None
    required_certs: list[str] = field(default_factory=list)
    destination_market: str | None = None
    deadline_days: int | None = None
    target_price_usd_per_kg: float | None = None
    wants_oem: bool = False
    wants_private_label: bool = False
    wants_sample: bool = False
    wants_retail_packaging: bool = False


# ---------------------------------------------------------------------------
# demand parsing
# ---------------------------------------------------------------------------

def _to_kg(value: float, unit: str) -> float | None:
    unit = unit.lower().rstrip("s")
    if unit in {"kg", "kilogram", "kilo"}:
        return value
    if unit in {"mt", "ton", "tonne", "metric ton"}:
        return value * 1000
    if unit in {"lb", "pound"}:
        return round(value * 0.45359237, 2)
    if unit in {"container", "fcl", "20ft", "40ft"}:
        return value * 18000  # rough full-container-load of packed matcha
    if unit in {"pallet"}:
        return value * 600
    return None


def _weights_in(text: str) -> list[float]:
    values: list[float] = []
    for raw, unit in QUANTITY_RE.findall(text):
        try:
            kg = _to_kg(float(raw.replace(",", "")), unit)
        except ValueError:
            continue
        if kg and kg > 0:
            values.append(kg)
    return values


def _extract_quantity(quantity_raw: str, full_text: str) -> tuple[float | None, str]:
    # The extracted quantity_raw field is the most reliable source; only fall
    # back to scanning free text when it carries no weight.
    for source, precision in ((quantity_raw, "EXACT"), (full_text, "RANGE")):
        values = _weights_in(source or "")
        if len(values) == 1:
            return values[0], precision if source is quantity_raw else "EXACT"
        if values:
            return max(values), "RANGE"
    if NON_WEIGHT_QTY_RE.search(f"{quantity_raw} {full_text}"):
        return None, "NON_WEIGHT_UNIT"
    return None, "UNKNOWN"


def _extract_grade(folded: str) -> str | None:
    for grade, terms in GRADE_TERMS.items():
        if any(term in folded for term in terms):
            return grade
    return None


def _extract_certs(folded: str) -> list[str]:
    found: list[str] = []
    for code, terms in CERT_TERMS.items():
        if any(term in folded for term in terms):
            found.append(code)
    if "ORGANIC" in found and not ORGANIC_CERTS.intersection(found):
        # generic "organic" -> require some organic certification
        found = [c for c in found if c != "ORGANIC"] + ["ORGANIC"]
    else:
        found = [c for c in found if c != "ORGANIC"]
    return sorted(set(found))


def _extract_market(row: dict[str, Any], folded: str) -> str | None:
    code = str(row.get("buyer_country_code") or "").strip().upper()
    if len(code) == 2:
        return code
    raw = str(row.get("buyer_country_raw") or "").strip().casefold()
    if raw in COUNTRY_TO_MARKET:
        return COUNTRY_TO_MARKET[raw]
    for name, market in COUNTRY_TO_MARKET.items():
        if re.search(rf"\b(?:destination|ship to|deliver to)\b[^.]{{0,40}}\b{re.escape(name)}\b", folded):
            return market
    return None


def _extract_price(folded: str) -> float | None:
    match = PRICE_RE.search(folded)
    if not match:
        return None
    raw = next((g for g in match.groups() if g), None)
    try:
        return float(raw.replace(",", "")) if raw else None
    except ValueError:
        return None


def parse_demand(row: dict[str, Any]) -> RfqDemand:
    text = " ".join(
        str(row.get(key) or "")
        for key in ("title", "description_raw", "quantity_raw")
    ).strip()
    folded = text.casefold()
    quantity_kg, precision = _extract_quantity(str(row.get("quantity_raw") or ""), text)
    deadline_days = _deadline_days(row.get("deadline_at") or row.get("deadline_raw"))
    return RfqDemand(
        category_code=str(row.get("category_code") or "").strip().upper(),
        text=text,
        quantity_kg=quantity_kg,
        quantity_precision=precision,
        required_grade=_extract_grade(folded),
        required_certs=_extract_certs(folded),
        destination_market=_extract_market(row, folded),
        deadline_days=deadline_days,
        target_price_usd_per_kg=_extract_price(folded),
        wants_oem=any(term in folded for term in OEM_TERMS),
        wants_private_label=any(term in folded for term in PRIVATE_LABEL_TERMS),
        wants_sample=any(term in folded for term in SAMPLE_TERMS),
        wants_retail_packaging=any(term in folded for term in RETAIL_PACKAGING_TERMS),
    )


def _deadline_days(value: Any) -> int | None:
    text = str(value or "").strip()
    match = re.match(r"(\d{4}-\d{2}-\d{2})", text)
    if not match:
        return None
    from datetime import date

    try:
        return (date.fromisoformat(match.group(1)) - date.today()).days
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# per-SKU evaluation
# ---------------------------------------------------------------------------

def _grade_check(demand: RfqDemand, sku: dict[str, Any]) -> Check:
    sku_grade = str(sku.get("grade") or "").lower()
    if not demand.required_grade:
        return Check("grade", "HARD", "UNKNOWN", "RFQ 未写明等级需求")
    want = GRADE_RANK.get(demand.required_grade, 1)
    have = GRADE_RANK.get(sku_grade, 1)
    if have == want or have == want + 1:
        return Check("grade", "HARD", "PASS", f"需求 {demand.required_grade}，SKU {sku_grade}")
    if have < want:
        return Check("grade", "HARD", "FAIL", f"需求 {demand.required_grade}，SKU 仅 {sku_grade}")
    return Check("grade", "HARD", "UNKNOWN", f"需求 {demand.required_grade}，SKU {sku_grade}（等级偏高，需确认价位可接受）")


def _no_quantity_detail(demand: RfqDemand) -> str:
    return "RFQ 数量为非重量单位（件/袋等），需换算" if demand.quantity_precision == "NON_WEIGHT_UNIT" else "RFQ 未披露数量"


def _capacity_check(demand: RfqDemand, sku: dict[str, Any]) -> Check:
    cap = sku.get("monthly_capacity_kg")
    if demand.quantity_kg is None:
        return Check("quantity_capacity", "HARD", "UNKNOWN", _no_quantity_detail(demand))
    if cap and demand.quantity_kg > cap:
        return Check("quantity_capacity", "HARD", "FAIL", f"需求约 {demand.quantity_kg:g} kg 超过月产能 {cap} kg")
    return Check("quantity_capacity", "HARD", "PASS", f"需求约 {demand.quantity_kg:g} kg 在月产能内")


def _moq_check(demand: RfqDemand, sku: dict[str, Any]) -> Check:
    moq = sku.get("moq_kg")
    if demand.quantity_kg is None:
        return Check("moq", "HARD", "UNKNOWN", _no_quantity_detail(demand))
    if moq and demand.quantity_kg < moq:
        return Check("moq", "HARD", "FAIL", f"需求约 {demand.quantity_kg:g} kg 低于 MOQ {moq} kg")
    return Check("moq", "HARD", "PASS", f"需求约 {demand.quantity_kg:g} kg 满足 MOQ {moq} kg")


def _cert_check(demand: RfqDemand, sku: dict[str, Any]) -> Check:
    if not demand.required_certs:
        return Check("mandatory_certs", "HARD", "PASS", "RFQ 未提出强制认证要求")
    have = {str(c).upper() for c in sku.get("certifications", [])}
    missing: list[str] = []
    for code in demand.required_certs:
        if code == "ORGANIC":
            if not ORGANIC_CERTS.intersection(have):
                missing.append("ORGANIC")
        elif code not in have:
            missing.append(code)
    if missing:
        return Check("mandatory_certs", "HARD", "FAIL", f"缺少认证：{', '.join(missing)}")
    return Check("mandatory_certs", "HARD", "PASS", f"已覆盖：{', '.join(demand.required_certs)}")


def _lead_time_check(demand: RfqDemand, sku: dict[str, Any]) -> Check:
    if demand.deadline_days is None:
        return Check("lead_time", "HARD", "NA", "RFQ 未给交付截止日期，无交期约束")
    days = sku.get("delivery_days")
    if demand.deadline_days < 0:
        return Check("lead_time", "HARD", "FAIL", "RFQ 截止日期已过")
    if days and days > demand.deadline_days:
        return Check("lead_time", "HARD", "FAIL", f"交期 {days} 天，超过剩余 {demand.deadline_days} 天")
    return Check("lead_time", "HARD", "PASS", f"交期 {days} 天，在截止日期内")


def _price_check(demand: RfqDemand, sku: dict[str, Any]) -> Check:
    if demand.target_price_usd_per_kg is None:
        return Check("price", "SOFT", "NA", "RFQ 未给目标价，留待报价谈判")
    lo, hi = (sku.get("price_range_usd_per_kg") or [None, None])[:2]
    if lo is not None and demand.target_price_usd_per_kg < lo:
        return Check("price", "SOFT", "FAIL", f"目标价 ${demand.target_price_usd_per_kg:g}/kg 低于报价下限 ${lo}/kg")
    return Check("price", "SOFT", "PASS", f"目标价 ${demand.target_price_usd_per_kg:g}/kg 在报价区间内")


def _bool_soft(dimension: str, wanted: bool, has: bool, ok_msg: str, fail_msg: str) -> Check:
    if not wanted:
        return Check(dimension, "SOFT", "NA", "RFQ 未提出该要求")
    if has:
        return Check(dimension, "SOFT", "PASS", ok_msg)
    return Check(dimension, "SOFT", "FAIL", fail_msg)


def _export_check(demand: RfqDemand, seller: dict[str, Any]) -> Check:
    markets = {str(m).upper() for m in seller.get("export_experience_markets", [])}
    if not demand.destination_market:
        return Check("export_experience", "SOFT", "NA", "RFQ 未明确目的市场")
    if demand.destination_market in markets:
        return Check("export_experience", "SOFT", "PASS", f"卖方有 {demand.destination_market} 出口经验")
    return Check("export_experience", "SOFT", "UNKNOWN", f"卖方无 {demand.destination_market} 出口记录，需确认")


def evaluate_sku(demand: RfqDemand, seller: dict[str, Any], sku: dict[str, Any]) -> SkuMatch:
    category_status = "PASS" if demand.category_code == str(sku.get("category_code") or "").upper() else "FAIL"
    checks: list[Check] = [
        Check("category", "HARD", category_status, f"需求 {demand.category_code} / SKU {sku.get('category_code')}"),
        _grade_check(demand, sku),
        _capacity_check(demand, sku),
        _moq_check(demand, sku),
        _cert_check(demand, sku),
        _lead_time_check(demand, sku),
        _price_check(demand, sku),
        _bool_soft("oem", demand.wants_oem, bool(sku.get("oem")), "支持 OEM", "不支持 OEM"),
        _bool_soft("private_label", demand.wants_private_label, bool(sku.get("private_label")),
                   "支持自有品牌", "不支持自有品牌"),
        _bool_soft("packaging", demand.wants_retail_packaging,
                   any("custom" in str(p).lower() or "retail" in str(p).lower() or "pouch" in str(p).lower()
                       for p in sku.get("packaging", [])),
                   "可做零售/定制包装", "无零售/定制包装方案"),
        _bool_soft("sample", demand.wants_sample, bool(sku.get("sample_available")),
                   "可提供样品", "不提供样品"),
        _export_check(demand, seller),
    ]

    hard = [c for c in checks if c.kind == "HARD"]
    soft = [c for c in checks if c.kind == "SOFT"]
    blockers = [f"{c.dimension}: {c.detail}" for c in hard if c.status == "FAIL"]
    soft_fail = [c for c in soft if c.status == "FAIL"]
    unknowns = [c for c in checks if c.status == "UNKNOWN"]
    gaps = [f"{c.dimension}: {c.detail}" for c in unknowns] + [f"{c.dimension}: {c.detail}" for c in soft_fail]

    if blockers:
        verdict, points = "BLOCK", 0.0
    elif not unknowns and not soft_fail:
        verdict, points = "MATCH", 100.0
    else:
        gradable = [c for c in checks if c.status in {"PASS", "FAIL", "UNKNOWN"}]
        resolved = sum(1 for c in gradable if c.status == "PASS")
        ratio = resolved / len(gradable) if gradable else 0.0
        points = 55.0 + round(25.0 * ratio) - 5.0 * len(soft_fail)
        points = float(max(40.0, min(78.0, points)))
        verdict = "CONDITIONAL"

    return SkuMatch(
        seller_id=str(seller.get("seller_id")),
        company_name=str(seller.get("company_name")),
        company_location=str(seller.get("company_location") or ""),
        sku=str(sku.get("sku")),
        product_name=str(sku.get("product_name")),
        grade=str(sku.get("grade") or ""),
        verdict=verdict,
        fit_points=points,
        checks=[asdict(c) for c in checks],
        blockers=blockers,
        gaps=gaps,
    )


# ---------------------------------------------------------------------------
# whole-catalog report
# ---------------------------------------------------------------------------

def load_catalog(path: Path = CATALOG_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


_VERDICT_RANK = {"MATCH": 0, "CONDITIONAL": 1, "BLOCK": 2}


def evaluate(row: dict[str, Any], catalog: dict[str, Any] | None = None) -> FitReport:
    catalog = catalog or load_catalog()
    demand = parse_demand(row)

    evaluations: list[SkuMatch] = []
    for seller in catalog.get("sellers", []):
        for sku in seller.get("skus", []):
            if str(sku.get("category_code") or "").upper() != demand.category_code:
                continue
            evaluations.append(evaluate_sku(demand, seller, sku))

    evaluations.sort(key=lambda m: (_VERDICT_RANK[m.verdict], -m.fit_points, m.sku))
    eligible = [m for m in evaluations if m.verdict != "BLOCK"]
    matched = [m for m in evaluations if m.verdict == "MATCH"]
    conditional = [m for m in evaluations if m.verdict == "CONDITIONAL"]

    category_zh = _CATEGORY_ZH.get(demand.category_code, demand.category_code)
    if not evaluations:
        status, best_verdict, score = "NO_MATCH", "NONE", 12.0
        summary = f"贵州现有供给池暂无 {category_zh} 品类产品。"
    elif matched:
        status, best_verdict = "HAS_MATCH", "MATCH"
        score = max(m.fit_points for m in matched)
        summary = f"{len(matched)} 款贵州 {category_zh} SKU 完全匹配，另有 {len(conditional)} 款待确认。"
    elif conditional:
        status, best_verdict = "CONDITIONAL_ONLY", "CONDITIONAL"
        score = max(m.fit_points for m in conditional)
        summary = f"{len(conditional)} 款贵州 {category_zh} SKU 条件性匹配，主要待确认项已列出。"
    else:
        status, best_verdict, score = "NO_MATCH", "BLOCK", 12.0
        reason = evaluations[0].blockers[0] if evaluations[0].blockers else "硬性条件不满足"
        summary = f"贵州现有 {len(evaluations)} 款 {category_zh} 产品均存在硬性不匹配（{reason}）。"

    return FitReport(
        supply_pool_status=status,
        best_verdict=best_verdict,
        best_fit_score=float(score),
        eligible_matches=[asdict(m) for m in eligible],
        all_evaluations=[asdict(m) for m in evaluations],
        summary_zh=summary,
    )


_CATEGORY_ZH = {
    "MATCHA": "抹茶", "BLUEBERRY": "蓝莓", "ROSA_ROXBURGHII": "刺梨",
    "CHILI": "辣椒", "TEA": "茶",
}
