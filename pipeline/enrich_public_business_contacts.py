"""Enrich identified buyers with public, business-purpose contact channels only."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup


USER_AGENT = "BuyerHunterDemo/0.1 (+public-business-contact research)"
EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE = re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)")


def normalize_company(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def clean_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value)
    if len(digits) == 10:
        digits = "1" + digits
    return "+" + digits if len(digits) == 11 and digits.startswith("1") else value.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path(__file__).with_name("exports") / "BuyerHunter_B2B扩源_公开线索_20260828.csv")
    args = parser.parse_args()
    seeds = json.loads(Path(__file__).with_name("public_business_contact_seeds.json").read_text(encoding="utf-8"))
    seed_index = {normalize_company(name): seed for seed in seeds for name in seed["company_names"]}
    with args.input.open("r", encoding="utf-8-sig", newline="") as handle:
        leads = list(csv.DictReader(handle))

    run = Path(__file__).with_name("data_contact_enrichment") / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    raw_dir = run / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"})
    contacts = []
    audits = []
    fetched_domains = {}

    for lead in leads:
        company = lead.get("buyer_company_raw", "").strip()
        seed = seed_index.get(normalize_company(company)) if company else None
        if not seed:
            audits.append({
                "source_url": lead.get("source_url"),
                "buyer_company_raw": company,
                "buyer_name_raw": lead.get("buyer_name_raw"),
                "contact_enrichment_status": "NO_OFFICIAL_COMPANY_DOMAIN_VERIFIED",
                "public_contact_count": 0,
            })
            continue
        domain = seed["official_domain"]
        domain_contacts = fetched_domains.get(domain)
        if domain_contacts is None:
            domain_contacts = []
            robots_url = f"https://{domain}/robots.txt"
            robots_response = session.get(robots_url, timeout=(5, 25))
            parser_rules = RobotFileParser()
            parser_rules.set_url(robots_url)
            parser_rules.parse(robots_response.text.splitlines() if robots_response.ok else [])
            delay = parser_rules.crawl_delay("*") or 1
            for page_url in seed["official_pages"]:
                if robots_response.ok and not parser_rules.can_fetch(USER_AGENT, page_url):
                    continue
                time.sleep(max(float(delay), 1.0))
                response = session.get(page_url, timeout=(5, 25))
                digest = hashlib.sha256(response.content).hexdigest()
                if response.ok:
                    (raw_dir / f"{domain}_{digest[:12]}.html").write_bytes(response.content)
                    soup = BeautifulSoup(response.content, "html.parser")
                    visible = soup.get_text(" ", strip=True)
                    values = set()
                    for link in soup.select("a[href^='mailto:']"):
                        values.add(("email", link.get("href", "").split(":", 1)[1].split("?", 1)[0]))
                    for link in soup.select("a[href^='tel:']"):
                        values.add(("phone", clean_phone(link.get("href", "").split(":", 1)[1])))
                    values.update(("email", value) for value in EMAIL.findall(visible))
                    values.update(("phone", clean_phone(value)) for value in PHONE.findall(visible))
                    if soup.select_one("form"):
                        values.add(("contact_form", page_url))
                    for contact_type, contact_value in sorted(values):
                        if contact_type == "email" and not contact_value.casefold().endswith("@" + domain):
                            continue
                        domain_contacts.append({
                            "buyer_company_raw": company,
                            "official_domain": domain,
                            "contact_type": contact_type,
                            "contact_value": contact_value,
                            "source_url": page_url,
                            "verification_status": "PUBLIC_ON_OFFICIAL_COMPANY_WEBSITE",
                            "collected_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        })
            for extra in seed.get("supplemental_contacts", []):
                domain_contacts.append({
                    "buyer_company_raw": company,
                    "official_domain": domain,
                    **extra,
                    "collected_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                })
            fetched_domains[domain] = domain_contacts
        contacts.extend({**item, "lead_source_url": lead.get("source_url")} for item in domain_contacts)
        audits.append({
            "source_url": lead.get("source_url"),
            "buyer_company_raw": company,
            "buyer_name_raw": lead.get("buyer_name_raw"),
            "contact_enrichment_status": "PUBLIC_BUSINESS_CONTACT_FOUND" if domain_contacts else "OFFICIAL_SITE_FOUND_NO_PUBLIC_CONTACT",
            "public_contact_count": len(domain_contacts),
        })

    run.mkdir(parents=True, exist_ok=True)
    contact_columns = ["buyer_company_raw", "official_domain", "contact_type", "contact_value", "source_url", "verification_status", "collected_at", "lead_source_url"]
    with (run / "美国买家_公开企业联系方式.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=contact_columns)
        writer.writeheader()
        writer.writerows(contacts)
    with (run / "美国买家_联系方式补全审计.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(audits[0].keys()))
        writer.writeheader()
        writer.writerows(audits)
    print(f"leads={len(leads)} enriched_leads={sum(a['public_contact_count'] > 0 for a in audits)} public_contacts={len(contacts)}")
    print(run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
