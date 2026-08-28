# A6 Implementation Notes

## Event-driven 调用

```text
BUYER_MESSAGE
→ ConversationEvent persist
→ QianPulse Agent detect change
→ invoke qianpulse.a6.opportunity_progression
→ A6 output changed_fields
→ Routing Policy invalidate related capability results
→ run required A3/A4/A5
→ rerun / finalize A6 action if dependencies refreshed
→ Human Gate
→ external reply
→ WAITING_EXTERNAL
```

## 两阶段决策

当 changed_fields 会使关键依赖失效时，A6 可以先返回中间状态：

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
changed_fields
invalidated_capabilities
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
