# A6 Human Gate

## 1. 模式

```text
AUTO
APPROVAL
HUMAN
```

## 2. LOW RISK

候选：

- 已验证事实答复。
- 公开资料发送。
- 收到确认。
- 单个澄清问题。
- 普通 Follow-up。
- Nurture。

一期可以全量配置为 APPROVAL。

## 3. MEDIUM RISK

必须 APPROVAL：

- 高价值对象关键推进。
- MOQ 解释涉及商务边界。
- 样品安排。
- 正式产品资料。
- 轻度价格沟通。
- AI 置信度不足。

## 4. HIGH RISK

必须 HUMAN：

- 正式报价。
- 支付条件。
- 合同。
- 独家代理。
- 渠道分成。
- 投资 / 股权。
- 大额订单。
- 投诉 / 赔偿。
- 政府 / 重大机构。

## 5. Block 优先

A5 BLOCKED、UNSUBSCRIBE、SUPPRESSION 命中时，不允许 Human Gate 被用于绕过停止条件。