"""Collect SAM.gov public opportunities without persisting the API key."""

from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests


API_URL = "https://api.sam.gov/opportunities/v2/search"
TERMS = ("matcha", "blueberry", "tea", "food")
USER_AGENT = "BuyerHunterDemo/0.1 (+public-source research; hackathon demo)"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def public_url(term: str) -> str:
    return f"{API_URL}?title={term}&postedFrom=<date>&postedTo=<date>&ptype=o,k"


def parse(term: str, payload: dict[str, Any], observed_at: str, snapshot: str) -> list[dict[str, Any]]:
    records = []
    for row in payload.get("opportunitiesData", []):
        data = row.get("data") or {}
        place = data.get("placeOfPerformance") or {}
        country = place.get("country") or {}
        records.append({
            "source_code": "sam_gov",
            "source_url": row.get("uiLink"),
            "record_kind": "DIRECT_PROCUREMENT_OPPORTUNITY",
            "verification_status": "OFFICIAL_API",
            "query_term": term,
            "title": row.get("title"),
            "solicitation_number": row.get("solicitationNumber"),
            "buyer_name_raw": row.get("fullParentPathName") or row.get("department") or row.get("subtier"),
            "office_raw": row.get("office"),
            "published_at_raw": row.get("postedDate"),
            "deadline_raw": row.get("responseDeadLine") or row.get("reponseDeadLine"),
            "notice_type_raw": row.get("type"),
            "set_aside_raw": row.get("typeOfSetAsideDescription") or row.get("setAside"),
            "naics_raw": row.get("naicsCode"),
            "classification_code_raw": row.get("classificationCode"),
            "active_raw": row.get("active"),
            "description_url": row.get("description"),
            "resource_links": row.get("resourceLinks") or [],
            "place_country_code": country.get("code"),
            "place_country_name": country.get("name"),
            "place_zip": place.get("zip"),
            "observed_at": observed_at,
            "snapshot_sha256": snapshot,
            "data_mode": "LIVE",
        })
    return records


def main() -> int:
    key = os.environ.get("SAM_API_KEY")
    if not key:
        raise SystemExit("SAM_API_KEY is not available in this process")

    run = Path(__file__).with_name("data_sam") / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    raw = run / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    end = date.today()
    start = end - timedelta(days=365)
    common = {
        "api_key": key,
        "postedFrom": start.strftime("%m/%d/%Y"),
        "postedTo": end.strftime("%m/%d/%Y"),
        "ptype": ["o", "k"],
        "limit": 20,
        "offset": 0,
    }

    probes = []
    records = []
    for term in TERMS:
        observed_at = now()
        params = dict(common)
        params["title"] = term
        try:
            response = session.get(API_URL, params=params, timeout=(5, 30))
            content = response.content
            digest = hashlib.sha256(content).hexdigest()
            (raw / f"sam_{term}_{digest[:12]}.json").write_bytes(content)
            payload = response.json() if response.ok else {}
            parsed = parse(term, payload, observed_at, digest) if response.ok else []
            records.extend(parsed)
            probes.append({
                "source_code": "sam_gov",
                "public_request": public_url(term),
                "query_term": term,
                "status": "FETCHED" if response.ok else "HTTP_ERROR",
                "http_status": response.status_code,
                "observed_at": observed_at,
                "snapshot_sha256": digest,
                "record_count": len(parsed),
                "error_body": None if response.ok else response.text[:500],
            })
            print(f"sam_gov term={term} http={response.status_code} records={len(parsed)}")
        except requests.RequestException as exc:
            probes.append({
                "source_code": "sam_gov",
                "public_request": public_url(term),
                "query_term": term,
                "status": "FETCH_FAILED",
                "http_status": None,
                "observed_at": observed_at,
                "record_count": 0,
                "error_body": f"{type(exc).__name__}: {exc}",
            })
        time.sleep(2)

    (run / "probe_results.json").write_text(json.dumps(probes, ensure_ascii=False, indent=2), encoding="utf-8")
    with (run / "records.jsonl").open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    (run / "summary.json").write_text(json.dumps({
        "run": run.name,
        "record_count": len(records),
        "counts_by_term": {term: sum(row["query_term"] == term for row in records) for term in TERMS},
        "key_persisted": False,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"output={run} records={len(records)} key_persisted=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
