---
name: buyer-hunter-demand-understanding
description: >-
  将 RFQ、求购详情、贸易记录或官网事件拆成可追溯的标准采购需求。用于回答买家明确要什么；不负责机会评分、采购窗口、供需匹配或行动建议。
---

# 采购需求理解

把来源文本转换为忠于证据的 `Standard Demand` 与一个或多个 `Atomic Demand`，只更新 Opportunity 的 `buyer`、`atomic_demands` 和对应证据引用。

## 输入

- RFQ、求购详情、贸易记录、官网事件或其他原始信号
- 原始正文、来源 URL、发布时间、抓取时间及证据片段
- 卖家目标商品，仅用于品类范围提示，不得反向改写买家需求

## 工作规则

1. 区分直接采购需求、历史采购背景和一般性企业信息；背景信息不能冒充当前需求。
2. 一条来源包含多个产品、交付批次或不同条件时，拆成独立 `atomic_demands`，并保留共同来源。
3. 标准化品类、规格、数量、单位、币种、地区和时间；同时保留原始值。
4. 每个非空事实必须关联 `source_url` 和尽可能精确的 `source_span`。
5. 来源未披露的字段使用 `null` 或 `UNKNOWN`，不得根据常识补齐。
6. 将字段标记为 `FACT`；由单位换算、日期计算等确定性规则得到的值标记为 `DERIVED`。

## 输出

每个 Atomic Demand 至少包含：

- `demand_title`、`buyer_subject`、`category_code`
- `product_specifications`、`quantity_raw`、`quantity_normalized`
- `budget_or_price_range`、`currency`
- `delivery_region`、`delivery_at`、`deadline_at`
- `contact_or_official_channel`
- `published_at`、`source_url`、`source_span`、`source_text`
- `source_language`、`fact_status`、`missing_fields`

同时返回 `buyer_what` 摘要与 `source_refs`。

## 判断边界

- 允许：抽取、拆分、字段标准化、确定性换算、描述 Buyer WHAT。
- 禁止：猜预算、数量、联系人、公司主体或认证要求；生成真实性总分、机会分、窗口分或最终推荐。

## 完成条件

- 所有输出事实都能回指原始证据。
- 未披露信息被明确标为空缺，而不是被推断填充。
- 无法证明存在采购动作时，返回 `MORE_EVIDENCE`，不得继续包装成商机。

项目字段以 `contracts/buyer-signal-api-v1.yaml` 和 `db/schema.sql` 为准。
