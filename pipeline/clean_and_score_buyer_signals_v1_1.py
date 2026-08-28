"""Parser-quality upgrade for v1 scoring.

Fixes platform-specific country/date/quantity/contact parsing and prevents broad
category pages from turning unrelated records into product matches. The scoring
weights remain exactly truth-v1.0.0 from the PRD.
"""

from __future__ import annotations

import re
from datetime import datetime

import clean_and_score_buyer_signals_v1 as base


COUNTRIES = {
    "afghanistan": "AF", "australia": "AU", "austria": "AT", "belgium": "BE",
    "brazil": "BR", "canada": "CA", "china": "CN", "denmark": "DK",
    "egypt": "EG", "finland": "FI", "france": "FR", "germany": "DE",
    "ghana": "GH", "greece": "GR", "hong kong": "HK", "hungary": "HU",
    "india": "IN", "indonesia": "ID", "ireland": "IE", "italy": "IT",
    "japan": "JP", "kuwait": "KW", "malaysia": "MY", "mexico": "MX",
    "netherlands": "NL", "new zealand": "NZ", "nigeria": "NG", "norway": "NO",
    "pakistan": "PK", "philippines": "PH", "poland": "PL", "portugal": "PT",
    "qatar": "QA", "saudi arabia": "SA", "singapore": "SG", "south africa": "ZA",
    "south korea": "KR", "spain": "ES", "sweden": "SE", "switzerland": "CH",
    "thailand": "TH", "turkey": "TR", "türkiye": "TR", "ukraine": "UA",
    "united arab emirates": "AE", "uae": "AE", "united kingdom": "GB",
    "united states": "US", "usa": "US", "viet nam": "VN", "vietnam": "VN",
}
base.COUNTRY_TO_CODE.update(COUNTRIES)
ORIGINAL_CLEAN_ROW = base.clean_row

PRODUCT_PATTERNS = {
    "MATCHA": re.compile(r"\b(?:matcha|macha)\b", re.I),
    "BLUEBERRY": re.compile(r"\bblueberr(?:y|ies)\b", re.I),
    "ROSA_ROXBURGHII": re.compile(r"\b(?:rosa\s+roxburghii|cili\s+(?:fruit|juice)|chestnut\s+rose|burr\s+rose|chinquapin\s+rose)\b", re.I),
    "CHILI": re.compile(r"\b(?:chili|chilli|capsicum|paprika|hot\s+pepper)\b", re.I),
    "TEA": re.compile(r"\b(?:tea|oolong|sencha)\b", re.I),
}


def product_matches(category: str, title: str, description: str) -> bool:
    # Cut taxonomy/navigation suffixes that contain generic "Buyer Of Tea" labels.
    evidence_text = re.split(r"\bBuyer\s+Of\b", f"{title} {description}", maxsplit=1, flags=re.I)[0]
    if category == "TEA" and PRODUCT_PATTERNS["MATCHA"].search(evidence_text):
        return False  # assign the more specific MATCHA category
    return bool(PRODUCT_PATTERNS.get(category, re.compile(r"a^", re.I)).search(evidence_text))


def upgraded_clean_row(row: dict, observed_default):
    row = dict(row)
    description = base.norm(row.get("description_raw")) or ""
    title = base.norm(row.get("title")) or ""
    source = row.get("source_code")

    if source == "go4worldbusiness":
        country = re.search(r"\bBuyer\s+From\s+(.+?)\s+Quantity\s+Required\s*:", description, re.I)
        quantity = re.search(r"\bQuantity\s+Required\s*:\s*(.+?)\s+Payment\s+Terms\s*:", description, re.I)
        contact = re.search(r"\bContact\s*:\s*(.+?)(?:\s+Buyer\s+Of\b|$)", description, re.I)
        posted = re.search(r"\bVERIFIED\s+([A-Za-z]{3})-(\d{2})-(\d{2})\b", description, re.I)
        if country:
            row["buyer_country_raw"] = base.norm(country.group(1))
        if quantity:
            row["quantity_raw"] = base.norm(quantity.group(1))
        if contact:
            row["buyer_name_raw"] = base.norm(contact.group(1))
        if posted:
            parsed = datetime.strptime("-".join(posted.groups()), "%b-%d-%y").date().isoformat()
            row["published_at"] = parsed
            row["published_at_raw"] = posted.group(0).replace("VERIFIED ", "")
    elif source == "tradekey" and not row.get("buyer_country_raw"):
        based = re.search(r"\b(?:buyer|company|importer)\s+based\s+in\s+([A-Za-z ]{2,40}?)(?:\s+(?:requires|needs|seeks|is|wants|for)\b|[,.])", description, re.I)
        for_country = re.search(r"\b(?:buying|import|procurement)\b.{0,40}?\bfor\s+([A-Za-z ]{2,30}?)(?:[,.]|\s+(?:market|requires|needs)\b)", description, re.I)
        match = based or for_country
        if match:
            row["buyer_country_raw"] = base.norm(match.group(1))

    row["exact_product_match"] = product_matches(row.get("category_code", ""), title, description)
    if not row["exact_product_match"]:
        row["record_kind"] = "REJECTED_SELLER_OR_UNCLEAR"
    result = ORIGINAL_CLEAN_ROW(row, observed_default)
    return result


base.clean_row = upgraded_clean_row


if __name__ == "__main__":
    raise SystemExit(base.main())
