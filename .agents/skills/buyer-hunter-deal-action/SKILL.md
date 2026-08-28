---
name: buyer-hunter-deal-action
description: >-
  综合采购窗口、供需匹配、市场准入、联系方式和缺口，生成可执行的成交路径、触达策略及跟进节点。只在上游证据和门禁状态允许时给出行动。
---

# 成交路径与行动判断

把已完成的机会判断转换为销售今天能执行的动作，更新 Opportunity 的 `deal_action`。联系方式属于执行资源，不是机会价值本身。

## 前置输入

- `buying_window.window_score`、状态与 Why Now
- `seller_fit.fit_score`、硬缺口和软缺口
- `market_access.access_status`、风险与所需文件
- 已验证的联系人或官方采购渠道
- 预算、截止时间、交期及待确认问题

任一前置结果缺失时，不得假装已完成全链路判断。

## 行动路由

- `QUOTE_NOW`: 条件明确且可报价
- `ASK_SPEC_FIRST`: 关键规格未明确
- `SEND_SAMPLE`: 样品验证是合理下一步
- `SECOND_SOURCE_ENTRY`: 存在第二供应源切入信号
- `FIX_COMPLIANCE`: 先补认证、检测或文件
- `FOLLOW_UP_LATER`: 窗口尚未打开或需等待
- `HOLD`: 风险或缺口不支持投入

## 输出

- `primary_action`、`secondary_action`
- `action_reasoning`: 引用上游事实与判断，不引入新事实
- `contact_strategy`: 渠道、对象、目标和所需材料
- `message_drafts`: 按要求生成中文、英文或日文草稿
- `follow_up`: 下一节点、时间、成功条件和停止条件
- `required_assets`、`owner`、`human_approval_required`

文案中未知字段必须留为占位或提问，不得虚构价格、认证、交期、公司身份或联系人。

## 判断边界

- 允许：行动排序、触达策略、沟通草稿和跟进计划。
- 禁止：绕过 `BLOCK`；使用未验证私人联系方式；代表用户实际发送消息、报价或承诺，除非用户另行明确授权。

## 完成条件

- 第一行动可在当前条件下直接执行，且有成功/停止标准。
- `BLOCK` 优先路由至 `FIX_COMPLIANCE` 或 `HOLD`。
- 所有文案清晰区分事实、条件和待确认问题。

API 输出字段参考 `contracts/opportunity-decision-api-v1.yaml`。
