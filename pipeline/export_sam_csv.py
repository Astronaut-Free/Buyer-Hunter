"""Export the latest SAM crawl to Excel-friendly UTF-8 CSV files."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


COLUMNS = [
    "状态", "查询词", "标题", "采购机构", "公告编号", "发布日期", "响应截止时间",
    "公告类型", "小企业预留", "NAICS", "分类代码", "有效状态", "国家", "邮编",
    "SAM机会链接", "说明API链接", "附件链接", "相关性结论", "产品匹配状态",
    "排除原因", "抓取时间", "快照SHA256",
]


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def csv_row(record: dict[str, Any], status: str, rejection_reason: str = "") -> dict[str, Any]:
    return {
        "状态": status,
        "查询词": record.get("query_term"),
        "标题": record.get("title"),
        "采购机构": record.get("buyer_name_raw"),
        "公告编号": record.get("solicitation_number"),
        "发布日期": record.get("published_at_raw"),
        "响应截止时间": record.get("deadline_raw"),
        "公告类型": record.get("notice_type_raw"),
        "小企业预留": record.get("set_aside_raw"),
        "NAICS": record.get("naics_raw"),
        "分类代码": record.get("classification_code_raw"),
        "有效状态": record.get("active_raw"),
        "国家": record.get("place_country_name") or record.get("place_country_code"),
        "邮编": record.get("place_zip"),
        "SAM机会链接": record.get("source_url"),
        "说明API链接": record.get("description_url"),
        "附件链接": " | ".join(record.get("resource_links") or []),
        "相关性结论": record.get("relevance_status"),
        "产品匹配状态": record.get("product_fit_status"),
        "排除原因": rejection_reason,
        "抓取时间": record.get("observed_at"),
        "快照SHA256": record.get("snapshot_sha256"),
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    root = Path(__file__).with_name("data_sam")
    run = sorted(path for path in root.iterdir() if path.is_dir())[-1]
    raw = load_jsonl(run / "records.jsonl")
    accepted = load_jsonl(run / "accepted_records.jsonl")
    rejected = json.loads((run / "rejected_records.json").read_text(encoding="utf-8"))
    accepted_urls = {row.get("source_url") for row in accepted}
    rejection_by_title = {row.get("title"): row.get("reason", "") for row in rejected}

    accepted_rows = [csv_row(row, "保留-待核采购明细") for row in accepted]
    all_rows = [
        csv_row(
            row,
            "保留-待核采购明细" if row.get("source_url") in accepted_urls else "排除",
            rejection_by_title.get(row.get("title"), ""),
        )
        for row in raw
    ]
    write_csv(run / "SAM_清洗后12条_含验证链接.csv", accepted_rows)
    write_csv(run / "SAM_原始40条_含清洗结论.csv", all_rows)

    lines = ["# SAM.gov 人工验证链接", "", "以下记录来自官方 API；仍需打开公告及附件核对具体采购行项目。", ""]
    for index, row in enumerate(accepted, 1):
        lines.append(f"{index}. [{row.get('title')}]({row.get('source_url')})")
        lines.append(f"   - 公告编号：`{row.get('solicitation_number') or 'UNKNOWN'}`")
        lines.append(f"   - 发布：{row.get('published_at_raw') or 'UNKNOWN'}；截止：{row.get('deadline_raw') or 'UNKNOWN'}")
        attachments = row.get("resource_links") or []
        for attachment_index, attachment in enumerate(attachments, 1):
            lines.append(f"   - [附件 {attachment_index}]({attachment})")
    (run / "SAM_人工验证链接.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"run={run.name} accepted_csv_rows={len(accepted_rows)} all_csv_rows={len(all_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
