"""Quality-gated small-sample collector.

V2 keeps access probes out of the buyer-requirement dataset and follows public
TradeWheel detail links so fields are observed from the real detail page.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

import collect_samples as core


TERMS = ("matcha", "blueberry", "blueberries", "tea", "food", "beverage")


def product_terms(text: str) -> list[str]:
    return [term for term in TERMS if re.search(rf"\b{re.escape(term)}\b", text, re.I)]


def base_record(source: str, url: str, title: str, text: str) -> dict[str, Any]:
    record = core.infer_record(source, url, title, text)
    record["product_terms"] = product_terms(text)
    return record


def parse_html(source: str, url: str, body: bytes) -> list[dict[str, Any]]:
    soup = BeautifulSoup(body, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    if source.startswith("tradewheel") and soup.select_one("h1.buyoffer-title"):
        title = soup.select_one("h1.buyoffer-title")
        detail = title.find_parent("div", class_="bo-detail-left") or soup.body or soup
        record = base_record(source, url, core.clean_text(title), core.clean_text(detail))
        record.update({
            "record_kind": "DIRECT_BUY_REQUIREMENT",
            "verification_status": "UNVERIFIED_MARKETPLACE_POST",
            "detail_url": url,
        })
        return [record]

    if source.startswith("tradewheel"):
        records: list[dict[str, Any]] = []
        for card in soup.select("div.buyffer-list")[:30]:
            heading = card.select_one("h3.b-info-title-h")
            link = heading.select_one("a[href]") if heading else None
            paragraphs = [core.clean_text(node) for node in card.select("div.b-info-left p")]
            record = base_record(source, url, core.clean_text(heading) if heading else "", core.clean_text(card))
            record.update({
                "buyer_name_raw": paragraphs[0] if len(paragraphs) > 0 else None,
                "buyer_country_raw": paragraphs[1] if len(paragraphs) > 1 else None,
                "published_at_raw": paragraphs[2].removeprefix("Date Posted:").strip() if len(paragraphs) > 2 else None,
                "detail_url": link.get("href") if link else None,
                "record_kind": "DIRECT_BUY_REQUIREMENT",
                "verification_status": "UNVERIFIED_MARKETPLACE_POST",
            })
            records.append(record)
        return records

    if source.startswith("go4worldbusiness"):
        records = []
        for card in soup.select("div.search-results")[:30]:
            name = card.select_one("h2.entity-row-title")
            country = card.select_one("span.subtitle")
            date = card.select_one("div.text-right small")
            description = card.select_one("div.entity-row-description-search")
            profile = name.find_parent("a", href=True) if name else None
            text = core.clean_text(card)
            record = base_record(source, url, core.clean_text(name) if name else "", text)
            record.update({
                "buyer_name_raw": core.clean_text(name) if name else None,
                "buyer_country_raw": re.sub(r"^Buyer From\s*", "", core.clean_text(country), flags=re.I) if country else None,
                "published_at_raw": core.clean_text(date) if date else None,
                "description_raw": core.clean_text(description) if description else text[:2000],
                "detail_url": urljoin(url, profile.get("href")) if profile else None,
                "record_kind": "BUYER_DIRECTORY_ENTRY",
                "verification_status": "UNVERIFIED_DIRECTORY_CLAIM",
            })
            records.append(record)
        return records

    if source == "independent_buyer_sites":
        title = core.clean_text(soup.title) if soup.title else ""
        text = core.clean_text(soup.body or soup)
        if not text:
            return []
        record = base_record(source, url, title, text)
        record.update({
            "record_kind": "BUYER_PROCUREMENT_CHANNEL",
            "signal_role": "buyer_background_only",
            "buyer_name_raw": urlparse(url).netloc,
            "access_channel_url": url,
            "verification_status": "PUBLIC_COMPANY_PAGE",
        })
        return [record]

    if source in {"alibaba_rfq", "amazon_business_rfq", "importyeti"}:
        return []
    return []


def parse_json(source: str, url: str, payload: Any) -> list[dict[str, Any]]:
    if source == "usaspending":
        rows = payload.get("results", []) if isinstance(payload, dict) else []
        parsed = []
        for row in rows:
            description = str(row.get("Description") or "")
            terms = product_terms(description)
            if not terms:
                continue
            parsed.append({
                "source_code": source,
                "source_url": url,
                "title": description or row.get("Award ID"),
                "buyer_name_raw": row.get("Awarding Agency"),
                "supplier_name_raw": row.get("Recipient Name"),
                "published_at_raw": row.get("Start Date"),
                "amount_raw": row.get("Award Amount"),
                "description_raw": description,
                "product_terms": terms,
                "signal_role": "historical_purchase_background",
                "record_kind": "HISTORICAL_PURCHASE",
                "verification_status": "OFFICIAL_API",
            })
        return parsed
    if source == "sam_gov":
        rows = payload.get("opportunitiesData", []) if isinstance(payload, dict) else []
        return [{
            "source_code": source,
            "source_url": row.get("uiLink") or url,
            "title": row.get("title"),
            "buyer_name_raw": row.get("department") or row.get("subTier"),
            "published_at_raw": row.get("postedDate"),
            "deadline_raw": row.get("responseDeadLine") or row.get("reponseDeadLine"),
            "notice_type_raw": row.get("type"),
            "naics_raw": row.get("naicsCode"),
            "description_raw": row.get("description"),
            "product_terms": product_terms(str(row.get("title") or "")),
            "signal_role": "direct_procurement_opportunity",
            "record_kind": "DIRECT_PROCUREMENT_OPPORTUNITY",
            "verification_status": "OFFICIAL_API",
        } for row in rows]
    return []


def fetch(session: Any, source: dict[str, Any], url: str, raw_dir: Path):
    required = source.get("requires_env")
    if required and not os.environ.get(required):
        return core.ProbeResult(
            source["code"], url, source["access"], "CREDENTIAL_REQUIRED", None, None,
            core.utc_now(), error=f"missing_env:{required}",
        ), []
    request_url = url
    if required:
        request_url += ("&" if "?" in request_url else "?") + f"api_key={os.environ[required]}"
    original_html = core.parse_html_records
    original_json = core.parse_json_records
    try:
        core.parse_html_records = parse_html
        core.parse_json_records = parse_json
        probe, records = core.fetch_one(session, source, request_url, raw_dir)
        if probe.status == "FETCHED" and source.get("access") == "public_boundary_probe":
            probe.status = "PUBLIC_INFO_ONLY"
        return probe, records
    finally:
        core.parse_html_records = original_html
        core.parse_json_records = original_json


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", default=str(Path(__file__).with_name("sources_v2.json")))
    parser.add_argument("--output", default=str(Path(__file__).with_name("data_v2")))
    parser.add_argument("--only", nargs="*")
    args = parser.parse_args()

    sources = json.loads(Path(args.sources).read_text(encoding="utf-8"))
    selected = [source for source in sources if not args.only or source["code"] in set(args.only)]
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = Path(args.output) / run_id
    raw_dir = output_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    session = core.requests.Session()
    session.headers.update({"User-Agent": core.USER_AGENT, "Accept-Language": "en-US,en;q=0.8"})

    probes = []
    records = []
    for source in selected:
        for url in source["seed_urls"]:
            probe, parsed = fetch(session, source, url, raw_dir)
            probes.append(probe)
            country_filter = {value.casefold() for value in source.get("country_filter", [])}
            if country_filter:
                parsed = [row for row in parsed if str(row.get("buyer_country_raw", "")).casefold() in country_filter]
            if source.get("follow_details"):
                details = []
                for listing in parsed[: int(source.get("max_details", 5))]:
                    detail_url = listing.get("detail_url")
                    if not detail_url:
                        details.append(listing)
                        continue
                    detail_probe, detail_rows = fetch(session, source, detail_url, raw_dir)
                    probes.append(detail_probe)
                    details.extend(detail_rows or [listing])
                    time.sleep(2)
                parsed = details
            records.extend(parsed)
            print(f"{source['code']}: {probe.status} http={probe.http_status} accepted={len(parsed)}")
            time.sleep(2)

    (output_dir / "probe_results.json").write_text(
        json.dumps([asdict(probe) for probe in probes], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    with (output_dir / "records.jsonl").open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    core.write_field_inventory(records, output_dir)
    print(f"output={output_dir} probes={len(probes)} accepted_records={len(records)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
