---
name: buyer-hunter-deal-action
description: >-
  综合采购窗口、Buyer Buying Profile、真实 Seller×SKU 匹配、市场准入、公开响应渠道和缺口，生成可执行的机会决策、触达路径及高价值全球采购商机简报。只在上游证据和门禁允许时给出行动。
---

# 成交行动与商机简报

把已完成的判断转换为销售今天能执行的动作。联系方式是执行资源，机会价值来自“现在追谁、为什么、能不能做、下一步做什么”。

## 前置输入

- Current Demand、`demand_confidence`、买家身份状态
- Buyer Buying Profile 及每项事实层级
- 采购窗口、交易阶段、Why Now 与反证
- 实际入围 Seller×SKU、硬缺口和软缺口
- 市场准入状态、风险项、公开采购/响应渠道

前置结果缺失时保留待核验项，不得假装全链路已完成。

## 决策状态

- `PURSUE_NOW`: 时机、匹配和准入支持立即投入
- `VERIFY_FIRST`: 机会有价值，但报价/触达前需补关键核验
- `WATCH`: 暂不投入，按明确时间或事件复核
- `PASS`: 窗口关闭或存在不可接受硬阻断

## 行动输出

- `primary_action`、`secondary_action`
- `action_reasoning`: 只引用上游事实和判断
- `contact_strategy`: 公开渠道、对象、目标、材料和待确认问题
- `follow_up`: 时间、负责人、成功条件和停止条件
- `required_assets`、`human_approval_required`

Buyer Buying Profile 用于调整规格提问、样品、包装和跟进节奏；推断不得写成买家已确认事实。

## 全球采购商机简报

对高价值机会生成 2–3 页 PDF 数据包，至少包含：

1. 商机摘要、决策状态、为什么现在和证据链
2. 当前需求、Buyer Buying Profile、身份状态与公开响应渠道
3. 入围 Seller×SKU、硬/软缺口、市场准入风险和下一步行动

PDF 必须标注生成时间、数据模式、未知项和证据 URL；身份未确认时显示“待核验”，不得补造公司名称。

## 边界与完成条件

- 不绕过 `BLOCK`，不使用未授权私人联系方式，不自动发送消息、报价或承诺。
- 第一行动可执行且有成功/停止标准。
- 高价值简报中的事实均可回溯，推断与未知明确标注。
