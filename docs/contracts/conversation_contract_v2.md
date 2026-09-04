# QianPulse V2｜Conversation Contract

> 目标：统一 Email、IM、语音等商务沟通进入 Runtime 后的消息、意图、事实提取、阶段推进、下一步动作与人工接管。

---

# 1. Conversation 聚合结构

```text
Conversation
├── Thread
├── Message
├── Extracted Facts
├── Intent
├── Stage Transition
├── Next Action
├── Approval
└── Human Takeover
```

---

# 2. Thread

```yaml
thread_id: string
opportunity_id: string
party: BUYER | SELLER | INTERNAL
channel: email | linkedin | whatsapp | telegram | wechat | voice | simulated | other
status: string
created_at: datetime
last_message_at: datetime | null
```

一个 Opportunity 可存在多个渠道 Thread。

---

# 3. Message

```yaml
message_id: string
event_id: string | null
thread_id: string
opportunity_id: string
direction: INBOUND | OUTBOUND
channel: string
sender:
  actor_role: BUYER | SELLER | INTERNAL | SYSTEM
  actor_id: string | null
recipient:
  actor_role: BUYER | SELLER | INTERNAL | SYSTEM
  actor_id: string | null
content: string | null
transcript: string | null
source_message_id: string | null
source_ref: string | null
timestamp: datetime
created_at: datetime
```

语音通话的原始音频由独立媒体层管理；Conversation Contract 保存可追溯媒体引用与 transcript。

---

# 4. Extracted Facts

买家消息中的事实必须分离保存：

```yaml
extracted_fact_id: string
message_id: string
field: budget | price | delivery_date | quantity | certification | specification | destination | sample | oem | other
value: any
confidence: number | null
evidence_ref: string
status: FACT | NEEDS_REVIEW | REJECTED
```

规则：

- 明确表达可进入 FACT。
- 模糊表达进入 NEEDS_REVIEW。
- 模型补全不得进入 FACT。
- 每个事实必须能回到原消息。

---

# 5. Intent

```yaml
intent:
  label: HIGH | MEDIUM | LOW | NEGATIVE | UNKNOWN
  score: number | null
  reasons: string[]
  evidence_refs: string[]
  updated_at: datetime
```

Intent 是 INFERENCE，禁止包装成成交概率。

---

# 6. Conversation Progression

```yaml
progression:
  stage_before: string | null
  stage_after: string | null
  trigger_event_id: string
  changed_fields: string[]
  blockers: object[]
  reason: string | null
  decided_at: datetime
```

阶段迁移必须通过状态机与 Hard Gate。

---

# 7. Next Action

```yaml
next_action:
  action: string
  target_person: string | null
  channel: string | null
  message_draft: string | null
  due_at: datetime | null
  reason: string | null
  evidence_refs: string[]
  approval_required: boolean
```

Owner：A6 Runtime。

存在 PENDING Approval、Missing Evidence、Dependency Stale 时，Next Action 应优先处理阻塞项。

---

# 8. AI Reply

```yaml
reply_draft:
  draft_id: string
  opportunity_id: string
  thread_id: string
  content: string
  grounded_evidence_refs: string[]
  risk_summary: string | null
  approval_required: boolean
  status: DRAFT_READY | APPROVED | REJECTED | SENT
```

涉及外部商业承诺、价格、交期、认证、合同、关键承诺时默认进入 Human Gate。

---

# 9. Voice Conversation

语音对话是 Conversation 组件内独立模块：

```yaml
voice_session:
  session_id: string
  opportunity_id: string
  thread_id: string
  media_ref: string | null
  started_at: datetime
  ended_at: datetime | null
  transcript_status: LIVE | FINAL | FAILED
  transcript_ref: string | null
  summary: string | null
  extracted_fact_ids: string[]
  handoff_status: AUTO | HUMAN_ACTIVE | ENDED
```

模块边界：

```text
STT / Streaming Transcript
        ↓
Conversation Message
        ↓
Fact + Intent
        ↓
Reply Assist / TTS
        ↓
Human Takeover
```

语音模块不得独立修改 Opportunity Stage，必须发出 Conversation Event 交给 Runtime。

---

# 10. Human Takeover

```yaml
human_takeover:
  required: boolean
  reason_code: PRICE_COMMITMENT | DELIVERY_COMMITMENT | CONTRACT | CERTIFICATION | HIGH_RISK | BUYER_REQUEST | LOW_CONFIDENCE | OTHER
  assigned_to: string | null
  status: NOT_REQUIRED | PENDING | ACTIVE | RESOLVED
  created_at: datetime | null
  resolved_at: datetime | null
```

---

# 11. Event 入口

当前 Runtime 已支持 `BUYER_MESSAGE`、`APPROVAL_RESULT`、`MANUAL_RESUME` 等事件。

Conversation 统一通过 Event 进入 Agent Runtime：

```text
External Channel / Voice
        ↓
Conversation Adapter
        ↓
AgentEvent
        ↓
A6
        ↓
Opportunity + Next Action
```

---

# 12. Idempotency

外部消息必须提供稳定 `source_message_id`；Agent 执行使用 `idempotency_key`。

同一消息重放不得：

- 重复创建外部动作
- 重复发送回复
- 重复创建报价 / 寄样结果
- 重复推进 Stage

---

# 13. Hard Gates

- 无 Opportunity Context 时返回 NEEDS_CONTEXT。
- Buyer Message 无 Evidence Ref 时只允许保留原消息，不自动升级关键事实。
- 关键商务承诺需要人工审批。
- Dependency Refresh 未完成时禁止越级推进。
- 低置信度提取禁止修改核心事实字段。

---

# 14. 验收

- [ ] Email / IM / Voice 共用统一 Message Contract
- [ ] 买家事实可回到原消息
- [ ] Intent 与 FACT 分层
- [ ] Voice 不直接改 Opportunity State
- [ ] Next Action 由 A6 单一负责
- [ ] Human Takeover 有明确触发原因
- [ ] 外部消息重放具备幂等性
