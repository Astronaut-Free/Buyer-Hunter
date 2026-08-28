"""Search SAM.gov with exact product variants without persisting the API key."""

from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests


API_URL = "https://api.sam.gov/opportunities/v2/search"
QUERIES = (
    "matcha", "matcha powder", "green tea powder", "tea powder",
    "blueberry", "blueberries", "blueberry powder", "dried blueberry",
    "frozen blueberry", "berry powder",
)
USER_AGENT = "BuyerHunterDemo/0.1 (+public-source research; hackathon demo)"


def notice_id(row: dict) -> str:
    link = row.get("uiLink") or ""
    parts = [part for part in urlparse(link).path.split("/") if part]
    return parts[-2] if len(parts) >= 2 and parts[-1] == "view" else hashlib.sha256(link.encode()).hexdigest()


def main() -> int:
    key = os.environ.get("SAM_API_KEY")
    if not key:
        raise SystemExit("SAM_API_KEY is missing")
    run = Path(__file__).with_name("data_sam_precise") / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    raw = run / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    end = date.today()
    start = end - timedelta(days=364)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    probes = []
    found = {}
    for query in QUERIES:
        params = {
            "api_key": key,
            "postedFrom": start.strftime("%m/%d/%Y"),
            "postedTo": end.strftime("%m/%d/%Y"),
            "ptype": ["o", "k", "p", "r"],
            "title": query,
            "limit": 100,
            "offset": 0,
        }
        response = session.get(API_URL, params=params, timeout=(5, 30))
        digest = hashlib.sha256(response.content).hexdigest()
        (raw / f"query_{hashlib.sha256(query.encode()).hexdigest()[:10]}_{digest[:10]}.json").write_bytes(response.content)
        payload = response.json() if response.ok else {}
        rows = payload.get("opportunitiesData", []) if isinstance(payload, dict) else []
        probes.append({
            "query": query,
            "http_status": response.status_code,
            "record_count": len(rows),
            "snapshot_sha256": digest,
            "error": None if response.ok else response.text[:500],
        })
        for row in rows:
            identifier = notice_id(row)
            item = found.setdefault(identifier, {
                "notice_id": identifier,
                "matched_queries": [],
                "title": row.get("title"),
                "solicitation_number": row.get("solicitationNumber"),
                "buyer_name_raw": row.get("fullParentPathName") or row.get("department") or row.get("subTier"),
                "published_at_raw": row.get("postedDate"),
                "deadline_raw": row.get("responseDeadLine") or row.get("reponseDeadLine"),
                "notice_type_raw": row.get("type"),
                "naics_raw": row.get("naicsCode"),
                "source_url": row.get("uiLink"),
                "description_url": row.get("description"),
                "resource_links": row.get("resourceLinks") or [],
                "verification_status": "OFFICIAL_API",
            })
            item["matched_queries"].append(query)
        print(f"query={query!r} http={response.status_code} records={len(rows)}")
        time.sleep(1)
    records = list(found.values())
    (run / "probe_results.json").write_text(json.dumps(probes, ensure_ascii=False, indent=2), encoding="utf-8")
    with (run / "records.jsonl").open("w", encoding="utf-8") as handle:
        for row in records:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    summary = {"query_count": len(QUERIES), "unique_candidate_count": len(records), "key_persisted": False}
    (run / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
