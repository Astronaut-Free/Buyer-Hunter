---
name: buyer-hunter-buying-window
description: >-
  根据可观测的发布时间、截止时间、明确紧迫度、采购阶段、连续性信号和陈旧反证判断采购窗口为何现在打开、何时跟进。用于 Why Now 与紧迫度判断；不负责产品匹配、准入或最终成交动作。
---

# 采购窗口判断

围绕“为什么是现在”判断当前需求是否仍可行动。仅使用公开可观测信号，不把缺失的企业采购频率或历史采购额编入模型。

## 可观测模型

`Recency + Explicit Urgency + Transaction Stage + Continuity Signal - Staleness`

- `Recency`: 发布时间、截止时间、最后公开更新
- `Explicit Urgency`: urgent、immediate、截止日期、交期等原文信号
- `Transaction Stage`: `INQUIRY | SPEC_CONFIRMATION | SAMPLE | TRIAL_ORDER | BULK_RFQ | LONG_TERM_SUPPLY`
- `Continuity Signal`: `LONG_TERM_SIGNAL | FUTURE_VOLUME_SIGNAL | REPEAT_POST_SIGNAL | CATEGORY_CONTINUITY`
- `Staleness`: 已过期、页面归档、长期无更新、状态关闭或反向证据

重复帖子只能标记 `REPEAT_POST_SIGNAL`，不得直接写成真实采购频率或成交历史。

## 处理顺序

1. 核对发布时间、截止时间和页面状态，抓取时间不能替代发布时间。
2. 从原文识别紧迫度和交易阶段，并引用证据。
3. 仅在可靠同账户历史存在时识别连续性信号。
4. 主动检查过期、关闭、已授标和其他反证。
5. 计算分项并给出复核或跟进窗口；无可靠时间时输出未知。

## 输出

- `window_status`: `OPEN | MONITOR | CLOSED | UNKNOWN`
- `window_score`: 0–100，含五类分项
- `transaction_stage`
- `continuity_signals`
- `why_now`: 每条含时间与证据
- `counter_evidence`、`urgency`
- `follow_up_window`、`missing_evidence`、`human_review_required`

## 边界与完成条件

- 不判断卖家匹配、公司实力、市场准入或最终动作。
- 已过期或明确关闭不得输出 `OPEN`。
- 分数必须能由可观测字段复算；未知信号不得按零事实描述。
