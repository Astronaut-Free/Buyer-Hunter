---
name: buyer-hunter-supply-demand-fit
description: >-
  对比买方 Atomic Demand 与卖方 SKU、产能、MOQ、价格、认证和交付能力，输出硬缺口、软缺口及供需匹配结论。仅用于 Seller Fit，不负责市场法规最终裁定。
---

# 供需机会匹配

将买方要求与指定卖家能力逐字段比较，更新 Opportunity 的 `seller_fit`。不得用通用品类印象替代卖家真实能力数据。

## 输入

- 买方：品类、规格、数量、预算、交期、认证及包装要求
- 卖方：SKU、等级、用途、MOQ、产能、价格、认证、包装、OEM 与交期
- 采购需求证据及卖家能力资料的版本、更新时间和来源

## 匹配规则

1. 先检查硬条件：强制认证、关键规格、数量能力、MOQ、交期和已知准入必要条件。
2. 任一硬条件明确不满足时，记录 `HARD_GAP`；不得用其他优势抵消。
3. 再比较软条件：价格优势、包装、OEM、样品政策和交期弹性。
4. `UNKNOWN` 与 `MISMATCH` 必须分开；资料缺失不能判定为不匹配，也不能默认通过。
5. 每项比较保留 `buyer_value`、`seller_value`、单位、状态和双方证据。

## 输出

- `fit_score`: 0–100，并附分项
- `match_results`: 字段级 `MATCH | PARTIAL | MISMATCH | UNKNOWN`
- `hard_gaps`、`soft_gaps`、`unknowns`
- `commercial_value`: 可解释的商业价值判断
- `recommendation`: `FIT | CONDITIONAL_FIT | NOT_FIT | NEED_MORE_DATA`
- `seller_profile_version`、`evidence_refs`

## 判断边界

- 允许：产品、规格、数量、商业条件和交付能力的供需对比。
- 禁止：猜测卖家未提供的认证、产能或价格；以匹配分替代市场准入；决定最终联系动作。

## 完成条件

- 每个硬条件都有明确状态和证据。
- 所有单位在比较前完成兼容换算，并保留原值。
- 存在未解决硬缺口时，不得输出无条件 `FIT`。

卖方字段参考 `pipeline/seller_capability_profile_demo_v1.json`；当前 Demo 画像必须明确标记为演示配置，不能冒充真实企业资料。
