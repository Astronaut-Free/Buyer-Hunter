"""Evidence-bound field extraction shared by collection and cleaning.

Only text directly present in a listing card or saved evidence is returned.
Contact people stay separate from legal buyer entities, and invalid quantities
remain conflicts instead of becoming coverage.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any


SPACE = re.compile(r"\s+")
POSTED_DATE = re.compile(r"\bPosted\s+on\s*:\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b", re.I)
STATUS_DATE = re.compile(r"\b(VERIFIED|ARCHIVED)\s+([A-Za-z]{3})-(\d{2})-(\d{2})\b", re.I)
GO4_COUNTRY = re.compile(r"\bBuyer\s+From\s+(.+?)(?=\s+Quantity\s+Required\s*:)", re.I)
GO4_QUANTITY = re.compile(
    r"\bQuantity\s+Required\s*:\s*(.+?)(?=\s+(?:Payment\s+Terms|Shipping\s+Terms|Destination|Looking\s+for\s+suppliers|Inquire\s+Now|Product\s+Description)\b)",
    re.I,
)
GO4_CONTACT = re.compile(r"\bContact\s*:\s*(.+?)(?=\s+Buyer\s+Of\b|$)", re.I)
TRADEKEY_QUANTITY = re.compile(r"\bInitial\s+quantity\s*:\s*(.+?)(?=\s+(?:\W\s*)?(?:Material|Grade|Dimensions?|Packaging)\b|$)", re.I)
TRADEKEY_COUNTRY_POSTED = re.compile(
    r"\b(UAE|United Arab Emirates|United States|USA|United Kingdom|Japan|India|Pakistan|"
    r"Vietnam|Viet Nam|Saudi Arabia|Canada|Australia)\s+Posted\s+on\s*:",
    re.I,
)
TRADEKEY_COUNTRY_BASED = re.compile(
    r"\b(?:buyer|company|importer)\s+based\s+in\s+([A-Za-z ]{2,40}?)(?:\s+(?:requires|needs|seeks|is|wants|for)\b|[,.])",
    re.I,
)
TRADEKEY_COUNTRY_FOR = re.compile(
    r"\b(?:buying|import|procurement)\b.{0,40}?\bfor\s+([A-Za-z ]{2,30}?)(?:[,.]|\s+(?:market|requires|needs)\b)",
    re.I,
)

PRODUCT_PATTERNS = {
    "MATCHA": re.compile(r"\b(?:matcha|macha)\b", re.I),
    "BLUEBERRY": re.compile(r"\bblueberr(?:y|ies)\b", re.I),
    "ROSA_ROXBURGHII": re.compile(r"\b(?:rosa\s+roxburghii|cili\s+(?:fruit|juice)|chestnut\s+rose|burr\s+rose|chinquapin\s+rose)\b", re.I),
    "CHILI": re.compile(r"\b(?:chili|chilli|capsicum|paprika|hot\s+pepper)\b", re.I),
    "TEA": re.compile(r"\b(?:tea|oolong|sencha)\b", re.I),
}


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    cleaned = SPACE.sub(" ", str(value)).strip()
    return cleaned or None


def parse_platform_date(text: str) -> tuple[str | None, str | None, str | None]:
    posted = POSTED_DATE.search(text)
    if posted:
        raw = posted.group(1)
        for pattern in ("%d %b %Y", "%d %B %Y"):
            try:
                return datetime.strptime(raw, pattern).date().isoformat(), raw, posted.group(0)
            except ValueError:
                pass
    status = STATUS_DATE.search(text)
    if status:
        raw = "-".join(status.groups()[1:])
        try:
            return datetime.strptime(raw, "%b-%d-%y").date().isoformat(), raw, status.group(0)
        except ValueError:
            pass
    return None, None, None


def product_matches(category: str, title: str, description: str) -> bool:
    evidence_text = re.split(r"\bBuyer\s+Of\b", f"{title} {description}", maxsplit=1, flags=re.I)[0]
    if category == "TEA" and PRODUCT_PATTERNS["MATCHA"].search(evidence_text):
        return False
    pattern = PRODUCT_PATTERNS.get(category)
    return bool(pattern and pattern.search(evidence_text))


def validate_quantity(value: Any) -> tuple[str | None, str, list[str]]:
    raw = clean_text(value)
    if not raw:
        return None, "MISSING", []
    numbers = [float(item.replace(",", "")) for item in re.findall(r"\d+(?:[.,]\d+)?", raw)]
    if numbers and max(numbers) <= 0:
        return None, "CONFLICT", ["NON_POSITIVE_QUANTITY"]
    return raw, "VALID", []


def extract_tradekey_card(card: Any) -> dict[str, Any]:
    text = clean_text(card.get_text(" ", strip=True)) or ""
    location = card.select_one(".location")
    country = clean_text(location.get_text(" ", strip=True)) if location else None
    date_iso, date_raw, date_span = parse_platform_date(text)
    quantity = TRADEKEY_QUANTITY.search(text)
    quantity_raw = clean_text(quantity.group(1)) if quantity else None
    return {
        "buyer_country_raw": country,
        "buyer_country_span": country,
        "buyer_name_raw": None,
        "buyer_name_span": None,
        "contact_person_raw": None,
        "contact_person_span": None,
        "published_at": date_iso,
        "published_at_raw": date_raw,
        "published_at_span": date_span,
        "quantity_raw": quantity_raw,
        "quantity_span": quantity.group(0) if quantity else None,
    }


def extract_go4worldbusiness_card(card: Any) -> dict[str, Any]:
    text = clean_text(card.get_text(" ", strip=True)) or ""
    country = GO4_COUNTRY.search(text)
    quantity = GO4_QUANTITY.search(text)
    contact = GO4_CONTACT.search(text)
    date_iso, date_raw, date_span = parse_platform_date(text)
    return {
        "buyer_country_raw": clean_text(country.group(1)) if country else None,
        "buyer_country_span": country.group(0) if country else None,
        "buyer_name_raw": None,
        "buyer_name_span": None,
        "contact_person_raw": clean_text(contact.group(1)) if contact else None,
        "contact_person_span": contact.group(0) if contact else None,
        "published_at": date_iso,
        "published_at_raw": date_raw,
        "published_at_span": date_span,
        "quantity_raw": clean_text(quantity.group(1)) if quantity else None,
        "quantity_span": quantity.group(0) if quantity else None,
    }


def repair_cleaning_input(row: dict[str, Any]) -> dict[str, Any]:
    repaired = dict(row)
    description = clean_text(row.get("description_raw")) or ""
    title = clean_text(row.get("title")) or ""
    source = row.get("source_code")

    date_iso, date_raw, date_span = parse_platform_date(description)
    if not repaired.get("published_at") and date_iso:
        repaired["published_at"] = date_iso
        repaired["published_at_raw"] = date_raw
        repaired["published_at_span"] = date_span

    if source == "go4worldbusiness":
        country = GO4_COUNTRY.search(description)
        quantity = GO4_QUANTITY.search(description)
        contact = GO4_CONTACT.search(description)
        if country:
            repaired["buyer_country_raw"] = clean_text(country.group(1))
            repaired["buyer_country_span"] = country.group(0)
        if quantity:
            repaired["quantity_raw"] = clean_text(quantity.group(1))
            repaired["quantity_span"] = quantity.group(0)
        if contact:
            repaired["contact_person_raw"] = clean_text(contact.group(1))
            repaired["contact_person_span"] = contact.group(0)
        legacy_contact = clean_text(repaired.get("buyer_name_raw"))
        if legacy_contact and not repaired.get("contact_person_raw"):
            repaired["contact_person_raw"] = legacy_contact
            repaired["contact_person_span"] = repaired.get("buyer_name_span")
        repaired["buyer_name_raw"] = None
    elif source == "tradekey":
        if not repaired.get("buyer_country_raw"):
            match = (
                TRADEKEY_COUNTRY_POSTED.search(description)
                or TRADEKEY_COUNTRY_BASED.search(description)
                or TRADEKEY_COUNTRY_FOR.search(description)
            )
            if match:
                repaired["buyer_country_raw"] = clean_text(match.group(1))
                repaired["buyer_country_span"] = match.group(1)
        if not repaired.get("quantity_raw"):
            quantity = TRADEKEY_QUANTITY.search(description)
            if quantity:
                repaired["quantity_raw"] = clean_text(quantity.group(1))
                repaired["quantity_span"] = quantity.group(0)

    repaired["exact_product_match"] = product_matches(repaired.get("category_code", ""), title, description)
    if not repaired["exact_product_match"]:
        repaired["record_kind"] = "REJECTED_SELLER_OR_UNCLEAR"
    return repaired
