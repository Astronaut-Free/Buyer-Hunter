"""Collect active EU procurement notices for the five Buyer Hunter categories."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests


API_URL = "https://api.ted.europa.eu/v3/notices/search"
QUERIES = {
    "MATCHA": ["matcha"],
    "BLUEBERRY": ["blueberry", "blueberries"],
    "ROSA_ROXBURGHII": ["Rosa roxburghii", "cili fruit"],
    "CHILI": ["chili", "chilli", "capsicum", "paprika"],
    "TEA": ["green tea", "black tea", "oolong tea", "tea leaves"],
}
FIELDS = [
    "publication-number", "notice-title", "description-lot", "description-proc",
    "organisation-name-buyer", "organisation-country-buyer", "organisation-email-buyer",
    "touchpoint-email-buyer", "touchpoint-tel-buyer", "publication-date",
    "deadline-receipt-tender-date-lot", "place-of-performance-country-lot",
]


def flatten(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, dict):
        preferred = value.get("eng") or value.get("en")
        if preferred is not None:
            return flatten(preferred)
        return flatten(next(iter(value.values()), None))
    if isinstance(value, list):
        parts = [flatten(item) for item in value]
        return " | ".join(part for part in parts if part) or None
    return re.sub(r"\s+", " ", str(value)).strip() or None


def html_url(notice: dict) -> str | None:
    links = notice.get("links", {}).get("html", {})
    return links.get("ENG") or links.get("MUL") or next(iter(links.values()), None)


def main() -> int:
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = Path(__file__).with_name("data_ted") / run_id
    raw_dir = run_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": "BuyerHunterDemo/1.0 (+public-procurement-research)"})
    observed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = []
    probes = []
    seen = set()

    for category, terms in QUERIES.items():
        for term in terms:
            body = {
                "query": f'FT ~ "{term}"', "fields": FIELDS, "page": 1,
                "limit": 50, "scope": "ACTIVE", "onlyLatestVersions": True,
            }
            started = time.monotonic()
            try:
                response = session.post(API_URL, json=body, timeout=(7, 60))
                status = response.status_code
                payload = response.json() if status == 200 else {"error": response.text[:1000]}
                error = None if status == 200 else flatten(payload)
            except (requests.RequestException, ValueError) as exc:
                response = None
                status = None
                payload = {"error": f"{type(exc).__name__}: {exc}"}
                error = payload["error"]
            raw_bytes = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
            digest = hashlib.sha256(raw_bytes).hexdigest()
            (raw_dir / f"{category}_{re.sub(r'[^a-z0-9]+', '_', term.casefold())}_{digest[:12]}.json").write_bytes(raw_bytes)
            notices = payload.get("notices", []) if isinstance(payload, dict) else []
            accepted = 0
            for notice in notices:
                number = flatten(notice.get("publication-number"))
                key = (category, number)
                if not number or key in seen:
                    continue
                title = flatten(notice.get("notice-title")) or ""
                description = flatten(notice.get("description-lot")) or flatten(notice.get("description-proc")) or ""
                if term.casefold() not in f"{title} {description}".casefold():
                    continue
                seen.add(key)
                rows.append({
                    "source_code": "ted_eu",
                    "source_type": "OFFICIAL_PROCUREMENT",
                    "category_code": category,
                    "query_term": term,
                    "publication_number": number,
                    "title": title,
                    "description_raw": description,
                    "buyer_name_raw": flatten(notice.get("organisation-name-buyer")),
                    "buyer_country_raw": flatten(notice.get("organisation-country-buyer")),
                    "public_business_email": flatten(notice.get("organisation-email-buyer")) or flatten(notice.get("touchpoint-email-buyer")),
                    "public_business_phone": flatten(notice.get("touchpoint-tel-buyer")),
                    "published_at": flatten(notice.get("publication-date")),
                    "deadline_at": flatten(notice.get("deadline-receipt-tender-date-lot")),
                    "place_of_performance_country": flatten(notice.get("place-of-performance-country-lot")),
                    "source_url": html_url(notice),
                    "observed_at": observed_at,
                    "snapshot_sha256": digest,
                    "data_mode": "LIVE",
                    "verification_status": "OFFICIAL_PUBLISHED_NOTICE",
                })
                accepted += 1
            probes.append({
                "category_code": category, "query_term": term, "http_status": status,
                "elapsed_ms": round((time.monotonic() - started) * 1000),
                "api_total": payload.get("totalNoticeCount") if isinstance(payload, dict) else None,
                "returned_count": len(notices), "accepted_count": accepted, "error": error,
            })
            print(f"TED {category} {term!r} http={status} returned={len(notices)} accepted={accepted}", flush=True)
            time.sleep(0.5)

    columns = list(rows[0].keys()) if rows else [
        "source_code", "source_type", "category_code", "query_term", "publication_number",
        "title", "description_raw", "buyer_name_raw", "buyer_country_raw",
        "public_business_email", "public_business_phone", "published_at", "deadline_at",
        "place_of_performance_country", "source_url", "observed_at", "snapshot_sha256",
        "data_mode", "verification_status",
    ]
    with (run_dir / "TED_五品类_有效采购公告.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    (run_dir / "probe_results.json").write_text(json.dumps(probes, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = {
        "run_id": run_id, "query_count": len(probes),
        "successful_query_count": sum(p["http_status"] == 200 for p in probes),
        "accepted_notice_count": len(rows), "unique_notice_category_count": len(seen),
    }
    (run_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
