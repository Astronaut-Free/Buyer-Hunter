---
name: buyer-hunter-market-access-risk
description: >-
  按目的地、产品规格、认证、标签、食安和进口文件审查市场准入与风险。用于 PASS、CONDITIONAL、BLOCK 结论；法规证据不足时必须要求人工复核。
---

# 市场准入与风险判断

判断指定产品进入目标市场是否存在硬阻断，更新 Opportunity 的 `market_access`。法规属于高风险时效信息，必须使用当前官方来源或明确标记待核验。

## 输入

- 目的地国家或地区
- 品类、用途、成分、规格、包装与标签声称
- 卖家现有认证、检测、追溯和出口文件
- 带发布日期、适用范围与版本的官方法规证据

## 审查维度

- 强制认证或许可
- 标签、营养、原产地及功能声称
- 农残、污染物、微生物与其他食品安全限制
- 进口商责任、报关、检疫、检测和随附文件
- 法规版本、过渡期和适用产品边界

## 输出

- `access_status`: `PASS | CONDITIONAL | BLOCK | UNKNOWN`
- `risks`: 风险项、严重度、适用条件与证据
- `required_docs`
- `certification_gaps`
- `official_evidence`: 官方 URL、机构、发布日期、版本和证据片段
- `human_review_required` 与复核原因

`PASS` 仅表示当前已知信息未发现硬阻断，不代表法律保证。`CONDITIONAL` 必须列出可执行的补齐条件；`BLOCK` 必须指出明确硬阻断及官方依据。

## 判断边界

- 允许：准入门禁、合规缺口、文件清单和风险分级。
- 禁止：无官方证据时猜法规；把行业经验写成强制要求；生成报价或触达文案。

## 完成条件

- 每个强制性结论都有当前、适用的官方证据。
- 法规版本未知、产品边界不清或证据冲突时输出 `UNKNOWN`/`CONDITIONAL` 并要求人工复核。
- 存在硬阻断时 Opportunity 状态进入 `BLOCKED`，交回总 Agent。
