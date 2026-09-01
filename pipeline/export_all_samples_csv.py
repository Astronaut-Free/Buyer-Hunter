"""Export the first 55 records and the combined 67-record verification sheet."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


COLUMNS = [
    "来源平台", "记录类型", "是否直接需求", "标题", "买家/采购机构", "国家",
    "供应商/历史成交方", "产品关键词", "产品形态", "发布日期", "截止时间",
    "需求描述", "数量", "试单数量", "持续需求量", "采购频率", "金额",
    "等级/认证/OEM", "用途", "包装", "温控要求", "报价要求", "MOQ要求",
    "样品要求", "贸易术语", "目的地", "交期要求", "紧急程度", "长期意向",
    "验证状态", "产品匹配状态", "联系门槛", "原始来源链接", "说明链接",
    "附件链接", "抓取时间", "快照SHA256", "备注",
]


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def join(value: Any) -> str:
    if isinstance(value, list):
        return " | ".join(str(item) for item in value)
    return "" if value is None else str(value)


def first_round_row(record: dict[str, Any]) -> dict[str, Any]:
    source = record["source"]
    buyer = record["buyer"]
    demand = record["demand"]
    product = record["product"]
    commercial = record["commercial"]
    logistics = record["logistics"]
    access = record["access"]
    evidence = record["evidence"]
    quality = record["quality"]
    return {
        "来源平台": source.get("code"),
        "记录类型": source.get("record_kind"),
        "是否直接需求": "是" if demand.get("is_direct") else "否",
        "标题": demand.get("title"),
        "买家/采购机构": buyer.get("name_raw"),
        "国家": buyer.get("country_code") or buyer.get("country_raw"),
        "供应商/历史成交方": buyer.get("supplier_name_raw"),
        "产品关键词": join(product.get("terms")),
        "产品形态": product.get("form"),
        "发布日期": demand.get("published_at"),
        "截止时间": None,
        "需求描述": demand.get("description_raw"),
        "数量": demand.get("quantity_raw"),
        "试单数量": demand.get("trial_order_raw"),
        "持续需求量": demand.get("recurring_quantity_raw"),
        "采购频率": demand.get("frequency_raw"),
        "金额": commercial.get("amount_raw"),
        "等级/认证/OEM": join(product.get("certification_or_grade_terms")),
        "用途": join(product.get("intended_use")),
        "包装": product.get("packaging_raw"),
        "温控要求": product.get("temperature_constraint"),
        "报价要求": commercial.get("price_or_quote_requested"),
        "MOQ要求": commercial.get("moq_requested"),
        "样品要求": commercial.get("sample_requested"),
        "贸易术语": join(commercial.get("incoterms")),
        "目的地": logistics.get("destination_raw"),
        "交期要求": logistics.get("lead_time_requested"),
        "紧急程度": demand.get("urgency"),
        "长期意向": demand.get("long_term_intent"),
        "验证状态": evidence.get("verification_status"),
        "产品匹配状态": "待四维验真" if demand.get("is_direct") else "背景证据",
        "联系门槛": access.get("contact_gate"),
        "原始来源链接": source.get("url"),
        "说明链接": None,
        "附件链接": None,
        "抓取时间": evidence.get("observed_at"),
        "快照SHA256": evidence.get("snapshot_sha256"),
        "备注": "直接需求仍需主体、历史行为和时效证据" if quality.get("direct_demand_requires_corroboration") else "不能单独证明当前采购需求",
    }


def sam_row(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "来源平台": "sam_gov",
        "记录类型": record.get("record_kind"),
        "是否直接需求": "是",
        "标题": record.get("title"),
        "买家/采购机构": record.get("buyer_name_raw"),
        "国家": record.get("place_country_name") or record.get("place_country_code"),
        "产品关键词": record.get("query_term"),
        "发布日期": record.get("published_at_raw"),
        "截止时间": record.get("deadline_raw"),
        "验证状态": record.get("verification_status"),
        "产品匹配状态": record.get("product_fit_status"),
        "原始来源链接": record.get("source_url"),
        "说明链接": record.get("description_url"),
        "附件链接": join(record.get("resource_links")),
        "抓取时间": record.get("observed_at"),
        "快照SHA256": record.get("snapshot_sha256"),
        "备注": "相邻食品采购；必须核对附件行项目，尚非抹茶/蓝莓精确命中",
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    base = Path(__file__).parent
    first_run = sorted(path for path in (base / "data_v2").iterdir() if path.is_dir())[-1]
    sam_run = sorted(path for path in (base / "data_sam").iterdir() if path.is_dir())[-1]
    first_rows = [first_round_row(row) for row in load_jsonl(first_run / "final_records.jsonl")]
    sam_rows = [sam_row(row) for row in load_jsonl(sam_run / "accepted_records.jsonl")]
    direct_rows = [row for row in first_rows if row["是否直接需求"] == "是"]

    output = base / "exports"
    output.mkdir(exist_ok=True)
    write_csv(output / "BuyerHunter_首轮55条全量_含来源链接.csv", first_rows)
    write_csv(output / "BuyerHunter_首轮6条直接需求_含来源链接.csv", direct_rows)
    write_csv(output / "BuyerHunter_当前67条汇总_含来源链接.csv", first_rows + sam_rows)
    print(f"first_round={len(first_rows)} first_direct={len(direct_rows)} sam={len(sam_rows)} combined={len(first_rows) + len(sam_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
