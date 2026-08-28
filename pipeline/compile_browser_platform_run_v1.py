"""Compile browser snapshots for the remaining public-source platform audit.

The snapshots must be produced by a real Playwright browser session. This
compiler never treats search-index snippets, marketing pages, login screens,
or blocked pages as procurement records.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path


PLATFORMS = [
    {
        "code": "globaltradeplaza",
        "name": "Global Trade Plaza",
        "file": "gtp_final.yml",
        "url": "https://globaltradeplaza.com/user/buy-leads",
        "boundary": "Cloudflare 403; no bypass attempted",
    },
    {
        "code": "connectamericas",
        "name": "ConnectAmericas",
        "file": "connect_final.yml",
        "url": "https://www.connectamericas.com/business-opportunity/tea",
        "boundary": "Origin returned 403; indexed text is not accepted as source proof",
    },
    {
        "code": "tradeford",
        "name": "TradeFord",
        "file": "tradeford_final.yml",
        "url": "https://importer.tradeford.com/chili-powder",
        "boundary": "Cloudflare 403; no bypass attempted",
    },
    {
        "code": "eworldtrade",
        "name": "eWorldTrade",
        "file": "eworld_final.yml",
        "url": "https://eworldtrade.com/importers/",
        "boundary": "Current domain displays a law-enforcement seizure page",
    },
    {
        "code": "hktdc_sourcing",
        "name": "HKTDC Sourcing",
        "file": "hktdc_final.yml",
        "url": "https://sourcing.hktdc.com/en/request-for-quotation",
        "boundary": "RFQ list and search are public; Quote Now requires supplier login",
    },
    {
        "code": "japan_jetro",
        "name": "JETRO e-Venue",
        "file": "jetro_proposal_search.yml",
        "url": "https://e-venue.jetro.go.jp/bizportal/s/selectBusinessCase?language=en_US",
        "boundary": "Proposal search is public; registration/login is required to contact",
    },
    {
        "code": "usda_ams",
        "name": "USDA AMS Solicitations",
        "file": "usda.yml",
        "url": "https://www.ams.usda.gov/selling-food/solicitations",
        "boundary": "Official site returned Access Denied 403 in the browser environment",
    },
    {
        "code": "amazon_business",
        "name": "Amazon Business RFQ",
        "file": "amazon.yml",
        "url": "https://business.amazon.com/en/solutions/bulk-buying/request-for-quote",
        "boundary": "Public explanation only; RFQ dashboard and requests require sign-in",
    },
]

CATEGORY_FILES = {
    "MATCHA": ("matcha", "hktdc_matcha_results.yml", "jetro_matcha_buy_results.yml"),
    "BLUEBERRY": ("blueberry", "hktdc_blueberry_results.yml", "jetro_blueberry_buy_results.yml"),
    "ROSA_ROXBURGHII": ("rosa roxburghii", "hktdc_rosa_results.yml", "jetro_rosa_buy_results.yml"),
    "CHILI": ("chili pepper", "hktdc_chili_results.yml", "jetro_chili_buy_results.yml"),
    "TEA": ("tea", "hktdc_tea_results.yml", "jetro_tea_buy_results.yml"),
}


def classify_snapshot(text: str) -> str:
    folded = text.casefold()
    if (
        "domain seized by law enforcement" in folded
        or "domain name has been seized" in folded
        or "homeland security investigations" in folded
    ):
        return "DOMAIN_SEIZED"
    if (
        "403 forbidden" in folded
        or "access denied" in folded
        or "just a moment" in folded
        or ("cloudflare" in folded and ("安全验证" in text or "恶意自动程序" in text))
    ):
        return "BLOCKED_403"
    if "request for quotation list" in folded and "rfq id:" in folded:
        return "LIVE_PUBLIC_RFQ"
    if "business case search" in folded and "free word search" in folded:
        return "LIVE_PUBLIC_SEARCH"
    if "request for quote" in folded and "sign in" in folded:
        return "PUBLIC_INFO_ACCOUNT_REQUIRED"
    return "PUBLIC_PAGE_NO_RECORDS"


def count_public_records(code: str, text: str) -> int:
    if code == "hktdc_sourcing":
        return len(set(re.findall(r"RFQ ID:\s*([A-Z0-9]+)", text)))
    if code == "japan_jetro":
        return len(set(re.findall(r"\bPI\d{8}\b", text)))
    return 0


def targeted_count(platform: str, text: str) -> int:
    if platform == "hktdc_sourcing":
        return len(set(re.findall(r"RFQ ID:\s*([A-Z0-9]+)", text)))
    return len(set(re.findall(r"\bPI\d{8}\b", text)))


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compile Playwright evidence for eight platforms")
    parser.add_argument(
        "--evidence-dir",
        type=Path,
        default=Path("output/playwright/seven_platforms_20260828"),
    )
    parser.add_argument("--output-root", type=Path, default=Path("pipeline/data_browser_platforms"))
    args = parser.parse_args()

    evidence_dir = args.evidence_dir.resolve()
    missing = [item["file"] for item in PLATFORMS if not (evidence_dir / item["file"]).is_file()]
    for _, (_, hktdc_file, jetro_file) in CATEGORY_FILES.items():
        for name in (hktdc_file, jetro_file):
            if not (evidence_dir / name).is_file():
                missing.append(name)
    if missing:
        raise SystemExit("Missing browser evidence: " + ", ".join(sorted(set(missing))))

    now = datetime.now(timezone.utc)
    run_id = now.strftime("%Y%m%dT%H%M%SZ")
    run_dir = args.output_root / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    observed_at = now.isoformat(timespec="seconds")

    platform_rows: list[dict] = []
    for item in PLATFORMS:
        snapshot = evidence_dir / item["file"]
        text = snapshot.read_text(encoding="utf-8")
        platform_rows.append({
            "source_code": item["code"],
            "platform": item["name"],
            "status": classify_snapshot(text),
            "public_record_count": count_public_records(item["code"], text),
            "target_buying_candidate_count": 0,
            "entry_url": item["url"],
            "access_boundary": item["boundary"],
            "snapshot_path": str(snapshot),
            "observed_at": observed_at,
            "data_mode": "LIVE_BROWSER",
        })

    search_rows: list[dict] = []
    for category, (term, hktdc_file, jetro_file) in CATEGORY_FILES.items():
        for source_code, filename in (
            ("hktdc_sourcing", hktdc_file),
            ("japan_jetro", jetro_file),
        ):
            snapshot = evidence_dir / filename
            text = snapshot.read_text(encoding="utf-8")
            buy_filter = (
                source_code == "hktdc_sourcing"
                or 'checkbox "We want to buy products and parts" [checked]' in text
            )
            search_rows.append({
                "source_code": source_code,
                "category_code": category,
                "search_term": term,
                "buying_intent_filter_confirmed": buy_filter,
                "result_count": targeted_count(source_code, text),
                "snapshot_path": str(snapshot),
                "observed_at": observed_at,
            })

    write_csv(
        run_dir / "八平台浏览器边界结果.csv",
        platform_rows,
        [
            "source_code", "platform", "status", "public_record_count",
            "target_buying_candidate_count", "entry_url", "access_boundary",
            "snapshot_path", "observed_at", "data_mode",
        ],
    )
    write_csv(
        run_dir / "HKTDC_JETRO_五品类搜索结果.csv",
        search_rows,
        [
            "source_code", "category_code", "search_term",
            "buying_intent_filter_confirmed", "result_count", "snapshot_path",
            "observed_at",
        ],
    )
    summary = {
        "run_id": run_id,
        "platform_count": len(platform_rows),
        "live_public_platform_count": sum(row["status"].startswith("LIVE_") for row in platform_rows),
        "blocked_platform_count": sum(row["status"] == "BLOCKED_403" for row in platform_rows),
        "domain_seized_count": sum(row["status"] == "DOMAIN_SEIZED" for row in platform_rows),
        "account_info_only_count": sum(
            row["status"] == "PUBLIC_INFO_ACCOUNT_REQUIRED" for row in platform_rows
        ),
        "public_record_count": sum(row["public_record_count"] for row in platform_rows),
        "target_buying_candidate_count": sum(row["result_count"] for row in search_rows),
        "search_count": len(search_rows),
        "searches_with_confirmed_buying_filter": sum(
            bool(row["buying_intent_filter_confirmed"]) for row in search_rows
        ),
    }
    (run_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    (run_dir / "platform_results.json").write_text(
        json.dumps(platform_rows, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
