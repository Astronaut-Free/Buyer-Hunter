"""Export high-value B2B leads discovered on public marketplace pages.

These rows are deliberately labelled as search-index discoveries because the
origin sites returned Cloudflare/login gates to the collector at collection
time. They must not be represented as direct HTML/API crawls.
"""

from __future__ import annotations

import csv
from pathlib import Path


AS_OF = "2026-08-28"
ROWS = [
    {
        "source_code": "tradewheel",
        "category_code": "TEA",
        "title": "Buying Green Tea For Retail And Beverage Supply",
        "description_raw": "Import green tea for beverage and retail supply; loose leaf, bags or matcha; premium or organic grade.",
        "buyer_name_raw": "Tony Valenzuela",
        "buyer_company_raw": "",
        "buyer_country_code": "US",
        "published_at": "2025-11-23",
        "deadline": "",
        "quantity_raw": "",
        "destination_raw": "United States",
        "buyer_verification": "UNVERIFIED_MARKETPLACE_POST",
        "buyer_identity_level": "NAMED_PERSON",
        "source_url": "https://www.tradewheel.com/buyers/tea-beverage/usa/",
        "contact_gate": "platform_contact_buyer",
        "data_provenance": "PUBLIC_PAGE_SEARCH_INDEX_SNAPSHOT",
        "fit_status": "RECENT_NEEDS_COMPANY_VERIFICATION",
        "four_dimension_score_100": 75,
    },
    {
        "source_code": "tradewheel",
        "category_code": "TEA",
        "title": "Buying Black Tea - Quantity Depending on Price",
        "description_raw": "Buyer requests black tea; quantity depends on price; country USA.",
        "buyer_name_raw": "Brandon Middleton",
        "buyer_company_raw": "",
        "buyer_country_code": "US",
        "published_at": "2026-08-20",
        "deadline": "",
        "quantity_raw": "Depends on price",
        "destination_raw": "United States",
        "buyer_verification": "UNVERIFIED_MARKETPLACE_POST",
        "buyer_identity_level": "NAMED_PERSON",
        "source_url": "https://www.tradewheel.com/buyers/tea/",
        "contact_gate": "platform_contact_buyer",
        "data_provenance": "PUBLIC_PAGE_SEARCH_INDEX_SNAPSHOT",
        "fit_status": "RECENT_NEEDS_COMPANY_VERIFICATION",
        "four_dimension_score_100": 80,
    },
    {
        "source_code": "tradewheel",
        "category_code": "TEA",
        "title": "Purchasing Request For Black Tea with Consistent Quality",
        "description_raw": "Buyer asks for tea grade, origin, leaf type and packaging for market supply.",
        "buyer_name_raw": "David Thuman",
        "buyer_company_raw": "",
        "buyer_country_code": "US",
        "published_at": "2026-08-14",
        "deadline": "",
        "quantity_raw": "",
        "destination_raw": "United States",
        "buyer_verification": "UNVERIFIED_MARKETPLACE_POST",
        "buyer_identity_level": "NAMED_PERSON",
        "source_url": "https://www.tradewheel.com/buyers/tea/",
        "contact_gate": "platform_contact_buyer",
        "data_provenance": "PUBLIC_PAGE_SEARCH_INDEX_SNAPSHOT",
        "fit_status": "RECENT_NEEDS_COMPANY_VERIFICATION",
        "four_dimension_score_100": 80,
    },
    {
        "source_code": "exporthub",
        "category_code": "TEA",
        "title": "Herbal tea RFQ",
        "description_raw": "US buyer is building a website focused on herbal teas and seeks simple herbal remedy flavors; preferred supplier country China.",
        "buyer_name_raw": "Dayna LamHo",
        "buyer_company_raw": "",
        "buyer_country_code": "US",
        "published_at": "2026-06-05",
        "deadline": "2026-10-17",
        "quantity_raw": "Ask From Buyer",
        "destination_raw": "United States",
        "buyer_verification": "UNVERIFIED_MARKETPLACE_POST",
        "buyer_identity_level": "NAMED_PERSON",
        "source_url": "https://www.exporthub.com/rfq_detail.html?id=s%3A8%3A%22bcahchgb%22%3B",
        "contact_gate": "platform_quote",
        "data_provenance": "PUBLIC_PAGE_SEARCH_INDEX_SNAPSHOT",
        "fit_status": "ACTIVE_NEEDS_COMPANY_VERIFICATION",
        "four_dimension_score_100": 85,
    },
    {
        "source_code": "exporthub",
        "category_code": "TEA",
        "title": "Buying tea buyer",
        "description_raw": "Buyer needs a company to identify and package the product and ship it to the US for retail.",
        "buyer_name_raw": "",
        "buyer_company_raw": "",
        "buyer_country_code": "US",
        "published_at": "2026-08-21",
        "deadline": "2026-09-08",
        "quantity_raw": "Contact Buyer",
        "destination_raw": "United States",
        "buyer_verification": "UNVERIFIED_MARKETPLACE_POST",
        "buyer_identity_level": "ANONYMOUS",
        "source_url": "https://www.exporthub.com/importers/tea/",
        "contact_gate": "platform_contact_buyer",
        "data_provenance": "PUBLIC_PAGE_SEARCH_INDEX_SNAPSHOT",
        "fit_status": "ACTIVE_NEEDS_IDENTITY_UNLOCK",
        "four_dimension_score_100": 65,
    },
    {
        "source_code": "freshdi",
        "category_code": "MATCHA",
        "title": "Matcha",
        "description_raw": "Matcha HS 0902.10; 10 pallets / 3,536 cartons; requested quantity 4,000 PCS; destination Los Angeles.",
        "buyer_name_raw": "",
        "buyer_company_raw": "S****O U.****A. I**C",
        "buyer_country_code": "US",
        "published_at": "2025-09-08",
        "deadline": "",
        "quantity_raw": "4000 PCS",
        "destination_raw": "Los Angeles, California, United States",
        "buyer_verification": "BUYER_NOT_CONFIRMED_BY_PLATFORM",
        "buyer_identity_level": "MASKED_COMPANY",
        "source_url": "https://freshdi.com/request/Matcha",
        "contact_gate": "platform_send_quotation",
        "data_provenance": "PUBLIC_PAGE_SEARCH_INDEX_SNAPSHOT",
        "fit_status": "RECENT_NEEDS_BUYER_VERIFICATION",
        "four_dimension_score_100": 75,
    },
    {
        "source_code": "freshdi",
        "category_code": "MATCHA",
        "title": "Organic matcha products",
        "description_raw": "Buyer requests 6,000 PCS of named organic matcha retail products for Los Angeles.",
        "buyer_name_raw": "",
        "buyer_company_raw": "BVL GROUP USA INC",
        "buyer_country_code": "US",
        "published_at": "2025-07-22",
        "deadline": "",
        "quantity_raw": "6000 PCS",
        "destination_raw": "Los Angeles, California, United States",
        "buyer_verification": "UNVERIFIED_OR_PUBLIC_DATA_DERIVED",
        "buyer_identity_level": "NAMED_COMPANY",
        "source_url": "https://freshdi.com/request/Organic-matcha-products",
        "contact_gate": "platform_send_quotation",
        "data_provenance": "PUBLIC_PAGE_SEARCH_INDEX_SNAPSHOT",
        "fit_status": "STALE_BRAND_SPECIFIC_GAP",
        "four_dimension_score_100": 60,
    },
    {
        "source_code": "freshdi",
        "category_code": "BLUEBERRY",
        "title": "Fresh blueberries",
        "description_raw": "4,080 cases of certified-organic fresh blueberries: 2,652 cases 12x9 oz and 1,428 cases 8x18 oz; cold-treatment requirements.",
        "buyer_name_raw": "",
        "buyer_company_raw": "BERRY FRESH LLC",
        "buyer_country_code": "US",
        "published_at": "2025-07-03",
        "deadline": "",
        "quantity_raw": "4080 cases",
        "destination_raw": "Chester, Pennsylvania, United States",
        "buyer_verification": "BUYER_CONFIRMED_BY_PLATFORM",
        "buyer_identity_level": "NAMED_COMPANY",
        "source_url": "https://freshdi.com/request/Fresh-blueberries-AyH0V8",
        "contact_gate": "platform_send_quotation",
        "data_provenance": "PUBLIC_PAGE_SEARCH_INDEX_SNAPSHOT",
        "fit_status": "STALE_BUT_HIGH_IDENTITY_VALUE",
        "four_dimension_score_100": 75,
    },
    {
        "source_code": "freshdi",
        "category_code": "CHILI",
        "title": "Agri & food products inquiry",
        "description_raw": "US buyer requests fox nuts, bay leaves, black cardamom, crushed chili and chili powder.",
        "buyer_name_raw": "",
        "buyer_company_raw": "------------",
        "buyer_country_code": "US",
        "published_at": "2025-07-06",
        "deadline": "",
        "quantity_raw": "1999 packages",
        "destination_raw": "Norfolk, Virginia, United States",
        "buyer_verification": "UNVERIFIED_MARKETPLACE_POST",
        "buyer_identity_level": "ANONYMOUS",
        "source_url": "https://freshdi.com/request/Agri-food-products-inquiry-ry8UBx",
        "contact_gate": "platform_send_quotation",
        "data_provenance": "PUBLIC_PAGE_SEARCH_INDEX_SNAPSHOT",
        "fit_status": "STALE_NEEDS_IDENTITY_UNLOCK",
        "four_dimension_score_100": 55,
    },
]


def main() -> int:
    output_dir = Path(__file__).with_name("exports")
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / "BuyerHunter_B2B扩源_公开线索_20260828.csv"
    md_path = output_dir / "BuyerHunter_B2B扩源_验证链接_20260828.md"
    columns = ["as_of", *ROWS[0].keys()]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in ROWS:
            writer.writerow({"as_of": AS_OF, **row})
    lines = [
        "# Buyer Hunter B2B 扩源验证链接",
        "",
        "> 这些记录来自公开平台页面的搜索索引快照；源站受 Cloudflare 或登录门槛限制时，不标记为直接爬取。",
        "",
    ]
    for index, row in enumerate(ROWS, 1):
        identity = row["buyer_company_raw"] or row["buyer_name_raw"] or "未公开"
        lines.append(f"{index}. [{row['source_code']}｜{row['category_code']}｜{row['title']}]({row['source_url']}) — 买方：{identity}；状态：{row['fit_status']}")
    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"rows={len(ROWS)}")
    print(csv_path)
    print(md_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
