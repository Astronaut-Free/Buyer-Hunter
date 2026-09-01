"""目的地市场抽取 —— buyer_country 与 destination_market 必须是两个字段。

修复的问题：整条链路此前没有真实目的地。`build_opportunity_store_v1` 只算了一个
布尔 `destination_present`（正文有没有出现"destination / ship to"字样），
而 `export_opportunities_for_agent` 直接把**买家所在国**填进了 `destination`，
于是下游 A4 供需匹配和 A5 准入判断一直在拿"买家自己的国家"当收货地评估。

规则（对齐任务书 C2 / C3）：
  - `destination_market` 只能来自正文里明确的目的地表述（ship to / deliver to /
    destination / port of discharge / 目的港 / 交货地 ...）
  - 抽不到就是 UNKNOWN，**不允许**用买家国家、默认国家或行业经验补齐
  - 同时保留 `destination_raw`（原文片段）与 `destination_source_span`（可回溯证据）
"""

from __future__ import annotations

import re

# 目的地引导词 -> 其后的地名片段。留出标点/换行作为边界，避免吞掉整段。
_CUES = [
    r"destination\s*(?:port|country|market)?",
    r"port\s+of\s+discharge",
    r"discharge\s+port",
    r"ship(?:ping|ped)?\s+to",
    r"deliver(?:y|ed)?\s+to",
    r"deliver\s+to",
    r"consignee\s+country",
    r"目的[港地国]",
    r"交货地[点]?",
    r"收货[地国]",
    r"发[货运]?到",
]
_CUE_RE = re.compile(
    r"(?:%s)\s*[:：]?\s*([A-Za-z一-鿿][A-Za-z一-鿿 .,'\-]{1,60})" % "|".join(_CUES),
    re.IGNORECASE,
)

# 去掉抽出片段里的尾随噪声（下一个字段名、连接词、B2B 平台的固定话术等）
_TRAILING = re.compile(
    r"\s*(?:and|with|for|please|we|our|looking|interested|(?:the\s+)?(?:quantity|price|payment)|数量|价格|付款|规格).*$",
    re.IGNORECASE,
)

_ALIASES = {
    "usa": "US", "u.s.a": "US", "u.s": "US", "united states": "US", "america": "US",
    "uk": "GB", "u.k": "GB", "united kingdom": "GB", "britain": "GB", "england": "GB",
    "japan": "JP", "germany": "DE", "netherlands": "NL", "holland": "NL",
    "france": "FR", "italy": "IT", "spain": "ES", "poland": "PL", "belgium": "BE",
    "finland": "FI", "hungary": "HU", "australia": "AU", "canada": "CA",
    "singapore": "SG", "malaysia": "MY", "korea": "KR", "south korea": "KR",
    "india": "IN", "thailand": "TH", "vietnam": "VN", "viet nam": "VN",
    "indonesia": "ID", "philippines": "PH", "uae": "AE",
    "united arab emirates": "AE", "dubai": "AE",
    "turkey": "TR", "greece": "GR", "ukraine": "UA", "latvia": "LV",
    "saudi arabia": "SA", "qatar": "QA", "oman": "OM", "kuwait": "KW",
    "new zealand": "NZ", "mexico": "MX", "brazil": "BR", "chile": "CL",
    "china": "CN", "hong kong": "HK",
    "美国": "US", "英国": "GB", "日本": "JP", "德国": "DE", "荷兰": "NL",
    "法国": "FR", "意大利": "IT", "西班牙": "ES", "澳大利亚": "AU", "加拿大": "CA",
    "新加坡": "SG", "马来西亚": "MY", "韩国": "KR", "印度": "IN", "泰国": "TH",
    "越南": "VN", "印尼": "ID", "菲律宾": "PH", "阿联酋": "AE",
    "中国": "CN", "香港": "HK",
}

# 常见港口/城市 -> 国家。只收录高置信度、无歧义的条目。
_CITY_TO_COUNTRY = {
    "los angeles": "US", "long beach": "US", "new york": "US", "oakland": "US",
    "seattle": "US", "houston": "US", "savannah": "US", "chicago": "US",
    "rotterdam": "NL", "amsterdam": "NL", "hamburg": "DE", "bremerhaven": "DE",
    "felixstowe": "GB", "southampton": "GB", "london": "GB",
    "le havre": "FR", "marseille": "FR", "antwerp": "BE", "valencia": "ES",
    "genoa": "IT", "gdansk": "PL", "helsinki": "FI",
    "tokyo": "JP", "yokohama": "JP", "osaka": "JP", "kobe": "JP", "nagoya": "JP",
    "busan": "KR", "incheon": "KR", "shanghai": "CN", "ningbo": "CN",
    "singapore": "SG", "port klang": "MY", "laem chabang": "TH",
    "jebel ali": "AE", "dubai": "AE", "abu dhabi": "AE", "jeddah": "SA", "sydney": "AU",
    "melbourne": "AU", "vancouver": "CA", "montreal": "CA", "toronto": "CA",
    "manila": "PH", "jakarta": "ID", "ho chi minh": "VN", "mumbai": "IN",
    "鹿特丹": "NL", "汉堡": "DE", "洛杉矶": "US", "横滨": "JP", "釜山": "KR",
}

UNKNOWN = "UNKNOWN"

# 裸两字母国别码只有在已知国家集合内才可靠（避免把 "in"/"of" 之类英文词当代码）。
_ISO2 = {value for value in _ALIASES.values()}


def _clean(span: str) -> str:
    # "destination for Germany" -> 先剥掉引导词，否则会被尾随噪声规则整段吃掉
    span = re.sub(r"^for\s+", "", (span or "").strip(), flags=re.IGNORECASE)
    span = _TRAILING.sub("", span)
    return span.strip(" .,:;'-、，。").strip()


_CJK = re.compile(r"[一-鿿]")


def _iter_alias_matches(text: str):
    """别名候选，最长最具体优先。

    ASCII 别名保持词边界（"indiana" 不得命中 "india"）；CJK 别名要求前后
    紧邻字符都不是 CJK（"中国香港"、"香港贸易有限公司" 不命中），符合
    宁缺毋滥契约——"发到中国，" 这类标点邻接仍正常命中。
    """
    for name, iso in sorted(_ALIASES.items(), key=lambda kv: (-len(kv[0]), kv[0])):
        if _CJK.search(name):
            for match in re.finditer(re.escape(name), text):
                start, end = match.span()
                before = text[start - 1] if start > 0 else ""
                after = text[end] if end < len(text) else ""
                if not _CJK.fullmatch(before) and not _CJK.fullmatch(after):
                    yield iso
                    break
        elif re.search(rf"(?<![A-Za-z]){re.escape(name)}(?![A-Za-z])", text):
            yield iso


def _iter_city_matches(text: str):
    """城市候选，最长最具体优先（"port klang" 先于任何更短键）。"""
    for city, iso in sorted(_CITY_TO_COUNTRY.items(), key=lambda kv: (-len(kv[0]), kv[0])):
        if city in text:
            yield iso


def resolve_market(span: str) -> str | None:
    """把一段地名解析成 ISO-2；无法可靠判断时返回 None（绝不猜）。"""
    raw = _clean(span)
    if not raw:
        return None
    if re.fullmatch(r"[A-Z]{2}", raw):
        # 全大写两字母才可能是国别码（小写 "us" 是代词，不解析）
        code = raw.upper()
        if code == "UK":
            return "GB"
        if code in _ISO2:
            return code
    text = raw.lower()
    if text in _ALIASES:
        return _ALIASES[text]
    codes = [iso for iso in _iter_city_matches(text)]
    codes += [iso for iso in _iter_alias_matches(text)]
    unique = set(codes)
    if len(unique) == 1:
        return codes[0]
    # 多个不同国别码同时命中（如 "china but made in usa"）：冲突即放弃，绝不猜。
    return None


def extract_destination(text: str) -> dict[str, str]:
    """从需求正文抽取目的地。

    返回 `destination_raw` / `destination_market` / `destination_source_span`，
    抽不到时 market 为 "UNKNOWN"、raw 与 span 为空串 —— 调用方**不得**用买家国家兜底。
    """
    body = str(text or "")
    for match in _CUE_RE.finditer(body):
        raw = _clean(match.group(1))
        if not raw:
            continue
        market = resolve_market(raw)
        if market:
            return {
                "destination_raw": raw,
                "destination_market": market,
                "destination_source_span": _clean(match.group(0)),
            }
    return {"destination_raw": "", "destination_market": UNKNOWN, "destination_source_span": ""}


def destination_fields(row: dict[str, str]) -> dict[str, str]:
    """行级封装：优先用采集器已给出的显式目的地，其次从正文抽取。"""
    explicit = str(row.get("destination_raw") or "").strip()
    if explicit:
        market = resolve_market(explicit)
        if market:
            return {
                "destination_raw": explicit,
                "destination_market": market,
                "destination_source_span": explicit,
            }
    text = " ".join(str(row.get(key) or "") for key in ("title", "description_raw"))
    return extract_destination(text)
