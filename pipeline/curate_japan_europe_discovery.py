"""Export current Japan/Europe leads found on public B2B search-index pages."""

from __future__ import annotations

import csv
from pathlib import Path


ROWS = [
    ("JAPAN", "JP", "MATCHA", "Ryota Watanabe", "Sourcing Premium Matcha Tea for Beverage and Retail Distribution", "Premium matcha for beverages, food manufacturing and retail packs; 2 MT initial procurement; monthly.", "2 metric tons", "Monthly", "2026-08-26", "https://www.tradewheel.com/buyers/sourcing-premium-matcha-tea-for-beverage-and-retail/1010032/", "GAP_JAPANESE_ORIGIN_PREFERRED"),
    ("JAPAN", "JP", "TEA", "Masami Iwasaki", "Buying Green Tea Leaves and Specialty Tea for Beverage Distribution", "Green tea leaves, black tea and specialty loose-leaf varieties for expanded beverage range.", "", "", "2026-08-24", "https://www.tradewheel.com/buyers/beverages/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("JAPAN", "JP", "MATCHA", "Praise", "Inquiry for Organic Matcha Green Tea Powder at $7-14 per kg", "Organic matcha green tea powder requested at a stated target price of USD 7-14/kg.", "", "", "2026-08-09", "https://www.tradewheel.com/buyers/matcha-powder/", "RECENT_PRICE_NEEDS_VALIDATION"),
    ("JAPAN", "JP", "MATCHA", "Eijiro Tsukada", "Importing Organic Matcha Powder with Food-Grade Certification", "Organic matcha for beverage applications; ceremonial and food-grade requirements.", "", "", "2026-07-20", "https://www.tradewheel.com/buyers/matcha-powder/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("JAPAN", "JP", "MATCHA", "Koyama Family", "Bulk Purchase Inquiry for Matcha Powder", "Matcha for beverages, smoothies, bakery, confectionery, ice cream and nutrition products.", "", "Monthly", "2026-06-12", "https://www.tradewheel.com/buyers/bulk-purchase-inquiry-for-matcha-powder/987038/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("JAPAN", "JP", "TEA", "Alex", "Bulk Purchase Inquiry for Green Tea in Bulk and Retail Packaging", "Green tea in bulk packaging and retail tea bag formats; asks for grades and pricing.", "", "", "2026-06-12", "https://www.tradewheel.com/buyers/green-tea/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("JAPAN", "JP", "MATCHA", "Angela Bondoc", "Interested In Matcha Powder", "Organic ceremonial Grade A+ matcha powder.", "200 kg", "", "2026-06-05", "https://www.tradewheel.com/buyers/matcha-powder/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("EUROPE", "GB", "TEA", "James Cox", "Sourcing Instant and Freeze-Dried Tea Powders for Beverage Distribution", "Black, green, lemon and specialty instant/freeze-dried tea powders for beverage distribution.", "", "", "2026-08-26", "https://www.tradewheel.com/buyers/tea/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("EUROPE", "NL", "TEA", "Brenda Ensing", "Interested in Freeze Dried Tea for Premium Beverage Markets", "Freeze-dried tea with aroma and natural tea character; instant dissolving format.", "", "", "2026-08-24", "https://www.tradewheel.com/buyers/beverages/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("EUROPE", "NL", "TEA", "Ivan", "Buying Vietnam Black Tea Small Tea Leaves", "High-quality Vietnam black tea small leaves.", "500 kg", "", "2026-08-17", "https://www.tradewheel.com/buyers/tea/", "GAP_VIETNAM_ORIGIN_REQUIRED"),
    ("EUROPE", "SE", "MATCHA", "Jennie Ahlqvist", "Buying Organic Matcha Powder", "Organic matcha powder; requests offer and delivery timeline.", "", "", "2026-07-15", "https://www.tradewheel.com/buyers/matcha-powder/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("EUROPE", "DK", "CHILI", "Jesper V. Kristensen", "Importing Premium Red Chilli Powder for Food Processing", "High ASTA color, low moisture and natural aroma for food processing.", "", "", "2026-07-16", "https://www.tradewheel.com/buyers/chilli-powder/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("EUROPE", "AT", "MATCHA", "Eric Gower", "Bulk Purchase Inquiry for Premium Matcha Powder", "Ceremonial or culinary grade matcha for food and beverage applications.", "", "", "2026-07-03", "https://www.tradewheel.com/buyers/matcha-powder/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("EUROPE", "DE", "TEA", "Christian Meckel", "Bulk Purchase Inquiry for Food-Grade Black Tea Extract", "Water-soluble food-grade black tea extract with high polyphenol content and bulk packaging.", "", "", "2026-06-29", "https://www.tradewheel.com/buyers/tea/germany/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("EUROPE", "DE", "TEA", "Tienie Ferriera", "Sourcing Organic and Conventional Herbal Tea", "Herbal tea with customized tea-bag packaging, private label and certifications.", "", "", "2026-06-11", "https://www.tradewheel.com/buyers/tea/germany/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("EUROPE", "DE", "TEA", "Rudolf Anders", "Bulk Purchase Inquiry for Herbal Tea Products", "Herbal tea for retail, wellness and foodservice markets.", "", "", "2026-06-11", "https://www.tradewheel.com/buyers/herbal-tea/", "RECENT_NEEDS_COMPANY_UNLOCK"),
    ("EUROPE", "PL", "CHILI", "", "We Buy Food Additives", "Food additives and seasonings including chili flakes; buyer identity not public on listing.", "", "", "2026-01-17", "https://importer.ec21.com/buy-lead/We_Buy_Food_Additives--24455704.html", "RECENT_NEEDS_IDENTITY_UNLOCK"),
]


def main() -> int:
    output = Path(__file__).with_name("exports") / "BuyerHunter_日本欧洲_B2B公开线索_20260828.csv"
    output.parent.mkdir(parents=True, exist_ok=True)
    columns = ["source_code", "market_region", "buyer_country_code", "category_code", "buyer_name_raw", "buyer_company_raw", "title", "description_raw", "quantity_raw", "buying_frequency_raw", "published_at", "source_url", "data_provenance", "contact_status", "fit_status"]
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for region, country, category, buyer, title, description, quantity, frequency, published, url, fit in ROWS:
            writer.writerow({
                "source_code": "ec21" if "ec21.com" in url else "tradewheel",
                "market_region": region,
                "buyer_country_code": country,
                "category_code": category,
                "buyer_name_raw": buyer,
                "buyer_company_raw": "",
                "title": title,
                "description_raw": description,
                "quantity_raw": quantity,
                "buying_frequency_raw": frequency,
                "published_at": published,
                "source_url": url,
                "data_provenance": "PUBLIC_HTML_COUNTRY_LISTING" if "ec21.com" in url else "PUBLIC_PAGE_SEARCH_INDEX_SNAPSHOT",
                "contact_status": "PLATFORM_LOGIN_REQUIRED",
                "fit_status": fit,
            })
    print(f"rows={len(ROWS)} japan={sum(row[0] == 'JAPAN' for row in ROWS)} europe={sum(row[0] == 'EUROPE' for row in ROWS)}")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
