"""Collect UNGM public procurement search results through the page's public XHR.

This is browser-discovered page collection, not an official UNGM API. It uses
only the unauthenticated search request made by https://www.ungm.org/Public/Notice,
stores every response before parsing, and stops on access-control responses.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


BASE_URL = "https://www.ungm.org"
SEARCH_URL = f"{BASE_URL}/Public/Notice/Search"
USER_AGENT = "BuyerHunterDemo/1.0 (+public-data-research; contact: repository-owner)"
SEARCHES = {
    "MATCHA": ["matcha"],
    "BLUEBERRY": ["blueberry", "blueberries"],
    "ROSA_ROXBURGHII": ["rosa roxburghii", "cili fruit"],
    "CHILI": ["chili", "chilli", "capsicum", "paprika"],
    "TEA": ["tea leaves", "green tea", "black tea", "oolong tea"],
}


def clean_text(value: str) -> str:
    return " ".join((value or "").split())


def search_payload(title: str, page: int, page_size: int, today: datetime) -> dict[str, Any]:
    date_text = today.strftime("%d-%b-%Y")
    return {
        "PageIndex": max(0, page),
        "PageSize": min(max(1, page_size), 50),
        "Title": title,
        "Description": "",
        "Reference": "",
        "PublishedFrom": "",
        "PublishedTo": date_text,
        "DeadlineFrom": date_text,
        "DeadlineTo": "",
        "Countries": [],
        "Agencies": [],
        "UNSPSCs": [],
        "NoticeTypes": [],
        "SortField": "Deadline",
        "SortAscending": True,
        "isPicker": False,
        "IsSustainable": False,
        "IsActive": True,
        "NoticeDisplayType": None,
        "NoticeSearchTotalLabelId": "noticeSearchTotal",
        "TypeOfCompetitions": [],
    }


def parse_results(html: bytes, listing_url: str = SEARCH_URL) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    rows: list[dict[str, Any]] = []
    for card in soup.select("div.notice-table[data-noticeid]"):
        notice_id = clean_text(card.get("data-noticeid", ""))
        title_node = card.select_one(".resultTitle .ungm-title")
        link = card.select_one('.resultTitle a[href*="/Public/Notice/"]')
        cells = card.select(":scope > .tableCell")
        if not notice_id or not title_node or len(cells) < 7:
            continue
        deadline = clean_text(cells[2].get_text(" ", strip=True))
        published = clean_text(cells[3].get_text(" ", strip=True))
        agency = clean_text(cells[4].get_text(" ", strip=True))
        notice_type = clean_text(cells[5].get_text(" ", strip=True))
        reference = clean_text(cells[6].get_text(" ", strip=True))
        country = clean_text(cells[7].get_text(" ", strip=True)) if len(cells) > 7 else None
        href = link.get("href", "") if link else f"/Public/Notice/{notice_id}"
        rows.append({
            "notice_id": notice_id,
            "title": clean_text(title_node.get_text(" ", strip=True)),
            "deadline_raw": deadline,
            "published_at_raw": published,
            "agency": agency,
            "notice_type": notice_type,
            "reference": reference,
            "buyer_country_raw": country,
            "source_url": urljoin(listing_url, href),
        })
    return rows


def fetch_results(session: requests.Session, payload: dict[str, Any],
                  retries: int = 2) -> tuple[requests.Response | None, list[dict[str, Any]]]:
    attempts: list[dict[str, Any]] = []
    response: requests.Response | None = None
    for attempt in range(1, retries + 2):
        started = time.monotonic()
        try:
            response = session.post(SEARCH_URL, json=payload, timeout=(7, 30))
            attempts.append({
                "attempt": attempt,
                "http_status": response.status_code,
                "elapsed_ms": round((time.monotonic() - started) * 1000),
                "error": None,
            })
            if response.status_code not in {429, 500, 502, 503, 504}:
                break
        except requests.RequestException as exc:
            attempts.append({
                "attempt": attempt,
                "http_status": None,
                "elapsed_ms": round((time.monotonic() - started) * 1000),
                "error": f"{type(exc).__name__}: {exc}",
            })
        if attempt <= retries:
            time.sleep(2 ** (attempt - 1))
    return response, attempts


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    columns = [
        "source_code", "category_code", "search_term", "notice_id", "title",
        "agency", "notice_type", "reference", "buyer_country_raw",
        "published_at_raw", "deadline_raw", "source_url", "observed_at",
        "snapshot_sha256", "snapshot_path", "data_mode", "verification_status",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect active public UNGM procurement notices")
    parser.add_argument("--page-size", type=int, default=15)
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--categories", nargs="*", choices=sorted(SEARCHES), default=sorted(SEARCHES))
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    run_id = now.strftime("%Y%m%dT%H%M%SZ")
    run_dir = Path(__file__).with_name("data_ungm") / run_id
    raw_dir = run_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": f"{BASE_URL}/Public/Notice",
    })
    records: list[dict[str, Any]] = []
    probes: list[dict[str, Any]] = []
    seen: set[str] = set()

    for category in args.categories:
        for term in SEARCHES[category]:
            observed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            started = time.monotonic()
            response, attempts = fetch_results(
                session, search_payload(term, 0, args.page_size, datetime.now()),
            )
            status = response.status_code if response is not None else None
            body = response.content if response is not None else b""
            digest = hashlib.sha256(body).hexdigest()
            snapshot_path: Path | None = None
            parsed: list[dict[str, Any]] = []
            if status == 200 and body:
                safe_term = term.replace(" ", "-")
                snapshot_path = raw_dir / f"{category}_{safe_term}_{digest[:12]}.html"
                snapshot_path.write_bytes(body)
                parsed = parse_results(body)
            accepted = 0
            for row in parsed:
                if row["notice_id"] in seen:
                    continue
                seen.add(row["notice_id"])
                row.update({
                    "source_code": "ungm",
                    "category_code": category,
                    "search_term": term,
                    "observed_at": observed_at,
                    "snapshot_sha256": digest,
                    "snapshot_path": str(snapshot_path) if snapshot_path else None,
                    "data_mode": "LIVE",
                    "verification_status": "PUBLIC_UNGM_NOTICE",
                })
                records.append(row)
                accepted += 1
            probes.append({
                "category_code": category,
                "search_term": term,
                "http_status": status,
                "bytes": len(body),
                "parsed_count": len(parsed),
                "accepted_count": accepted,
                "elapsed_ms": round((time.monotonic() - started) * 1000),
                "snapshot_sha256": digest if body else None,
                "attempts": attempts,
            })
            print(f"ungm {category} {term} http={status} parsed={len(parsed)} accepted={accepted}")
            if status in (401, 403, 429):
                break
            time.sleep(max(1.5, args.delay))

    write_csv(run_dir / "UNGM_公开采购公告.csv", records)
    (run_dir / "probe_results.json").write_text(
        json.dumps(probes, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    summary = {
        "run_id": run_id,
        "request_count": len(probes),
        "successful_request_count": sum(item["http_status"] == 200 for item in probes),
        "record_count": len(records),
        "unique_notice_count": len(seen),
        "access_mode": "PUBLIC_PAGE_XHR",
    }
    (run_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
