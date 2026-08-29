---
name: qianpulse-a6-opportunity-progression
description: >-
  在 Opportunity 已绑定且发生买家或系统事件时，分析意图、事实变化与字段提及，返回受影响的 A3/A4/A5、受控 Stage Transition、Next Action、Gate、Communication Brief 和 Outcome。A6 不执行专业能力、不生成最终回复、不调用 Provider。
canonical_skill: qianpulse.a6.opportunity_progression
version: 1.1.0
---

# A6｜Opportunity Progression

## 输入

```text
Event
Opportunity State
Conversation Context
A3 / A4 / A5 results
Seller Execution Policy
evaluated_at
```

## 输出

```text
Intent + confidence + evidence spans
Field Observations (updates / mentions)
Affected Skills
Stage Transition
Decision State
Next Action
Communication Brief
Outcome
```

## Agent 调用顺序

```text
A6 ANALYSIS
→ Agent 按 input_hash 检查并刷新 affected A3/A4/A5
→ A6 FINAL
→ 校验 Contract
→ Opportunity 只写入一次
→ Reply Composer
→ Human Gate
→ Execution Service
```

## 不负责

```text
A1 / A2
A3 timing
A4 matching
A5 risk
Provider 调用
消息发送
回复撰写
报价、付款、合同、认证、交付承诺
```

## 安全规则

- Update 与 Mention 必须分开。
- Stage 不得非法倒退；WON、LOST、STOPPED 默认锁定。
- PRICE、PAYMENT、COMPLAINT 必须 HUMAN。
- SAMPLE 必须 APPROVAL。
- UNSUBSCRIBE 立即 STOP_CONTACT 并生成 suppression signal。
- A5 BLOCK 不允许外部业务动作。
- `communication_brief.allowed_claims` 中每一项必须有 Evidence。
