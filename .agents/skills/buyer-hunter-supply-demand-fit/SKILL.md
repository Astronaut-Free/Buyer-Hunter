---
name: buyer-hunter-supply-demand-fit
description: >-
  将买方 Current Demand 与指定卖家的真实 Seller×SKU 档案逐项比较，先审硬条件，再评软条件，输出可入围 SKU、缺口和供需匹配结论。仅负责 Seller Fit，不负责市场法规最终裁定。
---

# Seller × SKU 供需匹配

一期必须使用可追溯的真实卖家和 SKU 数据；抹茶作为首个完整品类。通用 Demo 档案只能测试流程，必须明确标记，不能冒充企业能力。

## 卖家档案最小字段

`company`、`location`、`product`、`sku`、`specification`、`grade`、`moq`、`capacity`、`price_range`、`packaging`、`certifications`、`oem`、`sample`、`delivery_days`、`target_markets`、`evidence_refs`、`updated_at`。

## 匹配顺序

1. 从 Current Demand 提取硬条件：精准品类、关键规格、强制认证、MOQ/数量能力、交期和明确目的地必要条件。
2. 对同一卖家的每个实际 SKU 单独比较硬条件；任一明确失败记 `HARD_GAP`，不得被总分抵消。
3. 对硬条件未失败的 SKU 比较软条件：价格区间、包装、OEM、样品、用途适配和交期弹性。
4. 每项保留买方值、卖方值、单位、状态及双方证据；`UNKNOWN` 与 `MISMATCH` 分开。
5. 返回所有符合条件的 SKU，不强制凑 Top 3；入围数为零时明确输出“暂无合格 SKU”。

## 输出

- `eligible_sku_count`
- `eligible_skus`: 卖家、SKU、`fit_score`、字段级匹配及证据
- `hard_gaps`、`soft_gaps`、`unknowns`
- `recommendation`: `FIT | CONDITIONAL_FIT | NOT_FIT | NEED_MORE_DATA`
- `seller_profile_version`、`evaluated_at`

## 边界与完成条件

- 不猜测卖家未提供的认证、产能、价格或市场能力。
- 市场准入由准入 Skill 最终裁定；本 Skill 只消费其明确硬条件。
- 每个硬条件都有状态，单位已换算且保留原值。
- 演示画像必须输出 `data_mode=DEMO`，真实画像输出来源与更新时间。
