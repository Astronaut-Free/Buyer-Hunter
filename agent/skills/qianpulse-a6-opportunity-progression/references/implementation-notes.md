# A6 Implementation Notes

## Event-driven 调用

```text
BUYER_MESSAGE
→ ConversationEvent persist
→ QianPulse Agent detect change
→ invoke qianpulse.a6.opportunity_progression
→ A6 ANALYSIS outputs field_observations + affected_skills
→ Agent compares each skill_result.input_hash
→ Agent runs stale A3/A4/A5
→ A6 FINAL consumes fresh skill_results
→ validate A6 v1.1 contract and apply Opportunity once
→ Reply Composer consumes communication_brief
→ Human Gate
→ external reply
→ WAITING_EXTERNAL
```

## 两阶段决策

当 field_observations 会使关键依赖失效时，Agent 在同一 Run 中记录分析步骤和刷新步骤：

```text
MORE_EVIDENCE / WAITING_DEPENDENCY
```

Agent 完成 A3/A4/A5 刷新后，再恢复同一 Opportunity 的后续决策。

避免 A6 用旧 A4/A5 结果生成新回复。

## 可观测性

至少记录：

```text
source_event_id
intent
confidence
field_observations.updates
field_observations.mentions
affected_skills
skill_result.input_hash
skill_result.generated_at
stage_before
stage_after
key_question
next_action
execution_mode
approval_id
external_message_id
outcome
```

## 副作用

任何 Email reply / sample task / quote task / approval creation 都必须携带 idempotency key。
