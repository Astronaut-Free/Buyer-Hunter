"""Merge US, Japan and Europe discovery outputs into one reviewable CSV."""

from __future__ import annotations

import csv
from pathlib import Path


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def main() -> int:
    base = Path(__file__)
    exports = base.with_name("exports")
    us_rows = read_csv(exports / "BuyerHunter_B2B扩源_公开线索_20260828.csv")
    regional_rows = read_csv(exports / "BuyerHunter_日本欧洲_B2B公开线索_20260828.csv")
    contact_run = sorted(path for path in base.with_name("data_contact_enrichment").iterdir() if path.is_dir())[-1]
    contact_rows = read_csv(contact_run / "美国买家_公开企业联系方式.csv")
    contacts: dict[str, dict[str, list[str]]] = {}
    for row in contact_rows:
        bucket = contacts.setdefault(row["lead_source_url"], {"email": [], "phone": [], "contact_form": [], "sources": []})
        bucket[row["contact_type"]].append(row["contact_value"])
        bucket["sources"].append(row["source_url"])

    merged = []
    for row in us_rows:
        contact = contacts.get(row["source_url"], {})
        merged.append({
            "source_code": row["source_code"],
            "market_region": "US",
            "buyer_country_code": row["buyer_country_code"],
            "category_code": row["category_code"],
            "title": row["title"],
            "description_raw": row["description_raw"],
            "buyer_name_raw": row["buyer_name_raw"],
            "buyer_company_raw": row["buyer_company_raw"],
            "published_at": row["published_at"],
            "deadline": row["deadline"],
            "quantity_raw": row["quantity_raw"],
            "buying_frequency_raw": "",
            "destination_raw": row["destination_raw"],
            "source_url": row["source_url"],
            "data_provenance": row["data_provenance"],
            "verification_status": row["buyer_verification"],
            "fit_status": row["fit_status"],
            "contact_status": "PUBLIC_BUSINESS_CONTACT_FOUND" if contact else row["contact_gate"],
            "public_business_email": "; ".join(sorted(set(contact.get("email", [])))),
            "public_business_phone": "; ".join(sorted(set(contact.get("phone", [])))),
            "public_contact_form": "; ".join(sorted(set(contact.get("contact_form", [])))),
            "contact_evidence_url": "; ".join(sorted(set(contact.get("sources", [])))),
        })
    for row in regional_rows:
        merged.append({
            "source_code": row["source_code"],
            "market_region": row["market_region"],
            "buyer_country_code": row["buyer_country_code"],
            "category_code": row["category_code"],
            "title": row["title"],
            "description_raw": row["description_raw"],
            "buyer_name_raw": row["buyer_name_raw"],
            "buyer_company_raw": row["buyer_company_raw"],
            "published_at": row["published_at"],
            "deadline": "",
            "quantity_raw": row["quantity_raw"],
            "buying_frequency_raw": row["buying_frequency_raw"],
            "destination_raw": row["buyer_country_code"],
            "source_url": row["source_url"],
            "data_provenance": row["data_provenance"],
            "verification_status": "UNVERIFIED_MARKETPLACE_POST",
            "fit_status": row["fit_status"],
            "contact_status": row["contact_status"],
            "public_business_email": "",
            "public_business_phone": "",
            "public_contact_form": "",
            "contact_evidence_url": "",
        })
    seen = set()
    deduped = []
    for row in merged:
        key = (row["source_url"], row["title"].casefold())
        if key not in seen:
            seen.add(key)
            deduped.append(row)
    output = exports / "BuyerHunter_美日欧_精准及待补证线索_20260828.csv"
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(deduped[0].keys()))
        writer.writeheader()
        writer.writerows(deduped)
    print(f"rows={len(deduped)} us={sum(r['market_region'] == 'US' for r in deduped)} japan={sum(r['market_region'] == 'JAPAN' for r in deduped)} europe={sum(r['market_region'] == 'EUROPE' for r in deduped)}")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
