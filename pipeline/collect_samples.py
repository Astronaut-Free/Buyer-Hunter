"""Small-sample source probe for Buyer Hunter.

The collector intentionally saves source evidence before deriving a field model.
It does not bypass login, CAPTCHA, paywalls, robots.txt, or access controls.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup


USER_AGENT = "BuyerHunterDemo/0.1 (+public-source research; hackathon demo)"
TIMEOUT = (5, 20)
MAX_BYTES = 2 * 1024 * 1024


@dataclass
class ProbeResult:
    source_code: str
    url: str
    access: str
    status: str
    http_status: int | None
    content_type: str | None
    observed_at: str
    snapshot_sha256: str | None = None
    snapshot_path: str | None = None
    record_count: int = 0
    error: str | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def safe_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", value).strip("_")[:100]


def robots_allowed(session: requests.Session, url: str) -> tuple[bool, str]:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    try:
        response = session.get(robots_url, timeout=TIMEOUT)
        if response.status_code >= 400:
            return True, f"robots_unavailable_http_{response.status_code}"
        parser = RobotFileParser()
        parser.set_url(robots_url)
        parser.parse(response.text.splitlines())
        return parser.can_fetch(USER_AGENT, url), "robots_checked"
    except requests.RequestException as exc:
        return True, f"robots_unavailable_{type(exc).__name__}"


def clean_text(node: Any) -> str:
    text = node.get_text(" ", strip=True) if hasattr(node, "get_text") else str(node)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def first_match(patterns: list[str], text: str) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip(" :-")
    return None


def infer_record(source_code: str, url: str, title: str, text: str) -> dict[str, Any]:
    lower = text.lower()
    products = [term for term in ("matcha", "blueberry", "tea", "food", "beverage") if term in lower]
    record = {
        "source_code": source_code,
        "source_url": url,
        "title": title or None,
        "buyer_name_raw": first_match(
            [r"Purchaser\s+([^|]{2,80})", r"Contact\s*:\s*([^|]{2,80})", r"Buyer\s+([^|]{2,80})"],
            text,
        ),
        "buyer_country_raw": first_match(
            [r"Country/Region\s+([^|]{2,60})", r"Buyer From\s+([^|]{2,80})", r"Country\s*:\s*([^|]{2,60})"],
            text,
        ),
        "published_at_raw": first_match(
            [r"Date Posted\s+([0-9]{1,2}\s+[A-Za-z]{3,9},?\s+[0-9]{4})", r"([A-Z][a-z]{2}-[0-9]{2}-[0-9]{2})"],
            text,
        ),
        "product_terms": products,
        "quantity_raw": first_match(
            [r"Quantity Required\s*:?\s*([^|]{1,80})", r"(?:quantity|qty)\s*(?:required)?\s*:?\s*([0-9.,]+\s*(?:kg|kilograms?|tons?|mt|lb|units?))"],
            text,
        ),
        "buying_frequency_raw": first_match([r"Buying Frequency\s+([^|]{2,40})"], text),
        "packaging_raw": first_match([r"Packaging Terms?\s*:?\s*([^|]{2,120})", r"packed in\s+([^.;]{2,120})"], text),
        "shipping_terms_raw": first_match([r"Shipping Terms?\s*:?\s*([^|]{2,80})"], text),
        "payment_terms_raw": first_match([r"Payment Terms?\s*:?\s*([^|]{2,80})"], text),
        "destination_raw": first_match([r"Destination(?: Port)?\s*:?\s*([^|]{2,100})"], text),
        "contact_gate": "registration_required" if re.search(r"register to contact|login|sign in", text, re.I) else "public_channel_or_unknown",
        "description_raw": text[:2000],
    }
    return record


def parse_html_records(source_code: str, url: str, body: bytes) -> list[dict[str, Any]]:
    soup = BeautifulSoup(body, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    candidates: list[Any] = []
    if source_code.startswith("tradewheel"):
        candidates = soup.select("h3")
    elif source_code.startswith("go4worldbusiness"):
        candidates = soup.select("h4, h5")

    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    for heading in candidates[:30]:
        container = heading.find_parent(["article", "li", "div"]) or heading.parent
        text = clean_text(container)
        if len(text) < 40 or not re.search(r"buy|purchase|require|wanted|sourc|quote", text, re.I):
            continue
        title = clean_text(heading)
        key = hashlib.sha256((title + text[:300]).encode("utf-8")).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        records.append(infer_record(source_code, url, title, text))

    if not records:
        title = clean_text(soup.title) if soup.title else ""
        text = clean_text(soup.body or soup)
        if text:
            records.append(infer_record(source_code, url, title, text))
    return records


def parse_json_records(source_code: str, url: str, payload: Any) -> list[dict[str, Any]]:
    if source_code == "usaspending":
        rows = payload.get("results", []) if isinstance(payload, dict) else []
        return [
            {
                "source_code": source_code,
                "source_url": url,
                "title": row.get("Description") or row.get("Award ID"),
                "buyer_name_raw": row.get("Awarding Agency"),
                "supplier_name_raw": row.get("Recipient Name"),
                "published_at_raw": row.get("Start Date"),
                "amount_raw": row.get("Award Amount"),
                "description_raw": row.get("Description"),
                "product_terms": [
                    term for term in ("matcha", "blueberry", "tea", "food", "beverage")
                    if term in str(row.get("Description", "")).lower()
                ],
                "signal_role": "historical_purchase_background",
            }
            for row in rows
        ]
    if source_code == "sam_gov":
        rows = payload.get("opportunitiesData", []) if isinstance(payload, dict) else []
        return [
            {
                "source_code": source_code,
                "source_url": row.get("uiLink") or url,
                "title": row.get("title"),
                "buyer_name_raw": row.get("department") or row.get("subTier"),
                "published_at_raw": row.get("postedDate"),
                "deadline_raw": row.get("responseDeadLine"),
                "notice_type_raw": row.get("type"),
                "naics_raw": row.get("naicsCode"),
                "description_raw": row.get("description"),
                "product_terms": [],
                "signal_role": "direct_procurement_opportunity",
            }
            for row in rows
        ]
    return []


def fetch_one(
    session: requests.Session,
    source: dict[str, Any],
    url: str,
    raw_dir: Path,
) -> tuple[ProbeResult, list[dict[str, Any]]]:
    observed_at = utc_now()
    allowed, robots_note = robots_allowed(session, url)
    if not allowed:
        return ProbeResult(source["code"], url, source["access"], "ROBOTS_DENIED", None, None, observed_at, error=robots_note), []

    try:
        if source.get("method") == "POST":
            response = session.post(url, json=source.get("json_body"), timeout=TIMEOUT)
        else:
            response = session.get(url, timeout=TIMEOUT, allow_redirects=True)
        content = response.content[: MAX_BYTES + 1]
        if len(content) > MAX_BYTES:
            return ProbeResult(source["code"], url, source["access"], "TOO_LARGE", response.status_code, response.headers.get("content-type"), observed_at, error="response_exceeds_2mb"), []

        content_type = response.headers.get("content-type", "")
        suffix = ".json" if "json" in content_type else ".html"
        digest = hashlib.sha256(content).hexdigest()
        filename = f"{safe_name(source['code'])}_{digest[:12]}{suffix}"
        path = raw_dir / filename
        path.write_bytes(content)

        records: list[dict[str, Any]] = []
        if response.ok and "json" in content_type:
            try:
                records = parse_json_records(source["code"], response.url, response.json())
            except ValueError:
                pass
        elif response.ok and ("html" in content_type or content.lstrip().startswith(b"<")):
            records = parse_html_records(source["code"], response.url, content)

        status = "FETCHED" if response.ok else "HTTP_BLOCKED_OR_ERROR"
        if response.url != url and re.search(r"login|signin|sign-in", response.url, re.I):
            status = "LOGIN_REQUIRED"
        result = ProbeResult(
            source["code"], url, source["access"], status, response.status_code,
            content_type or None, observed_at, digest, str(path), len(records),
            None if response.ok else robots_note,
        )
        return result, records
    except requests.RequestException as exc:
        return ProbeResult(source["code"], url, source["access"], "FETCH_FAILED", None, None, observed_at, error=f"{type(exc).__name__}: {exc}"), []


def write_field_inventory(records: list[dict[str, Any]], output_dir: Path) -> None:
    sources = sorted({str(record.get("source_code")) for record in records})
    fields = sorted({key for record in records for key in record if key != "source_code"})
    counts: dict[str, Counter[str]] = defaultdict(Counter)
    totals = Counter(str(record.get("source_code")) for record in records)
    for record in records:
        source = str(record.get("source_code"))
        for field in fields:
            value = record.get(field)
            if value is not None and value != "" and value != []:
                counts[source][field] += 1

    with (output_dir / "field_inventory.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["field_code", *sources])
        for field in fields:
            writer.writerow([
                field,
                *[
                    f"{counts[source][field]}/{totals[source]}"
                    if totals[source] else "0/0"
                    for source in sources
                ],
            ])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", default=str(Path(__file__).with_name("sources.json")))
    parser.add_argument("--output", default=str(Path(__file__).with_name("data")))
    parser.add_argument("--only", nargs="*", help="Optional source codes")
    args = parser.parse_args()

    sources = json.loads(Path(args.sources).read_text(encoding="utf-8"))
    selected = [source for source in sources if not args.only or source["code"] in set(args.only)]
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = Path(args.output) / run_id
    raw_dir = output_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"})
    probes: list[ProbeResult] = []
    records: list[dict[str, Any]] = []
    for source in selected:
        for url in source["seed_urls"]:
            probe, parsed = fetch_one(session, source, url, raw_dir)
            probes.append(probe)
            records.extend(parsed)
            print(f"{source['code']}: {probe.status} http={probe.http_status} records={len(parsed)}")
            time.sleep(2)

    (output_dir / "probe_results.json").write_text(
        json.dumps([asdict(probe) for probe in probes], ensure_ascii=False, indent=2), encoding="utf-8"
    )
    with (output_dir / "records.jsonl").open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    write_field_inventory(records, output_dir)
    print(f"output={output_dir} probes={len(probes)} records={len(records)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
