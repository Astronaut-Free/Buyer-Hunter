---
name: buyer-hunter-buying-window
description: >-
  根据发布时间、截止时间、采购历史和企业事件判断采购窗口为何现在打开、何时跟进。用于 Why Now 与紧迫度判断；不负责产品匹配、准入或最终成交动作。
---

# 采购窗口判断

判断需求是否仍在有效采购窗口，并更新 Opportunity 的 `buying_window`。核心问题是“为什么是现在”，而不是“这家公司是否值得长期关注”。

## 输入

- 标准化 Atomic Demand 及其证据
- 发布时间、截止时间、历史采购时间与频率
- 采购量、供应商或原产地变化
- 新品、扩张、融资、招标、供应链切换等有来源的事件

## 判断顺序

1. 检查直接时效：发布时间、截止时间、需求状态和最后观察时间。
2. 评估 `Recency × Frequency × Change × Reliability`。
3. 区分直接采购证据、贸易历史背景和企业事件信号。
4. 主动检查反证：已过期、采购量下降、长期稳定供应关系、新品撤回、来源已归档。
5. 证据不足时降低可信度并给出补证据时间，不得把近期抓取时间当作近期发布时间。

## 输出

- `window_status`: `OPEN | MONITOR | CLOSED | UNKNOWN`
- `window_score`: 0–100
- `why_now`: 带证据引用的原因列表
- `trigger_events`: 事件、事件时间、来源与可靠性
- `counter_evidence`: 过期或反向信号
- `urgency`: `HIGH | MEDIUM | LOW | UNKNOWN`
- `follow_up_window`: 建议跟进起止时间或复核时间
- `missing_evidence`、`human_review_required`

分数必须附分项，不得只给结论。直接需求的时效权重高于目录页、买家名录和历史贸易记录。

## 判断边界

- 允许：窗口状态、紧迫度、触发事件和复核时间判断。
- 禁止：修改买家原始需求；判断卖家是否匹配；给出市场准入结论或最终销售动作。

## 完成条件

- `why_now` 与反证均有时间和来源。
- 已归档或过期需求不得输出 `OPEN`。
- 缺少发布时间或截止信息且无可靠替代事件时，输出 `UNKNOWN` 或 `MONITOR`。

现有分值口径参考 `pipeline/opportunity_decision_engine_v1.py`，但不得把 `truth_score` 当成交概率。
