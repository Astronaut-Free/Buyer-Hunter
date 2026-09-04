# QianPulse V2｜State & Event Contract

> 目标：统一 Opportunity、Conversation、Mission 的状态机与事件入口，保证状态迁移可审计、可恢复、可幂等，并受 Evidence / Approval / Dependency Hard Gate 约束。

---

# 1. 事件驱动原则

```text
External / User / System Event
        ↓
AgentEvent
        ↓
Capability / Runtime
        ↓
State Transition Decision
        ↓
Persist + Audit + Next Action
```

前端、渠道适配器、Crawler 均不得直接写最终业务状态。

---

# 2. AgentEvent 基础结构

当前 Runtime 已存在事件 Contract，V2 继续复用：

```yaml
event_id: string
event_type: string
actor_role: SELLER | BUYER | INTERNAL | SYSTEM
actor_id: string | null
opportunity_id: string | null
thread_id: string | null
payload: object
source: api | smartlead | system | string
timestamp: datetime
evidence_ref: string | null
idempotency_key: string
created_at: datetime
```

`idempotency_key` 为必填，缺失时拒绝执行副作用。

---

# 3. 已确认 Runtime Event

当前代码已定义：

```text
SELLER_PROACTIVE_DEVELOPMENT
SYSTEM_NEW_PROSPECT_SIGNAL
PRE_REPLY_FOLLOWUP_DUE
BUYER_MESSAGE
QUOTE_UPDATED
SAMPLE_UPDATED
APPROVAL_RESULT
EVIDENCE_ADDED
MANUAL_RESUME
```

V2 Mission 可 additive 增加：

```text
MISSION_CREATED
MISSION_READY
MISSION_STARTED
MISSION_PAUSED
MISSION_RESUMED
MISSION_COMPLETED
MISSION_FAILED
MISSION_CANCELLED
```

新增事件必须进入统一 Registry，禁止页面层自定义同义事件。

---

# 4. Opportunity State

Opportunity 同时维护两类状态：

```yaml
stage: string   # 商务生命周期
status: string  # Runtime 执行状态
```

当前代码明确出现的业务 Stage / Outcome：

```text
CONTACTED
NEGOTIATING
WON
LOST
STOPPED
```

当前代码明确出现的 Runtime Status：

```text
READY_FOR_OUTREACH_APPROVAL
OUTREACH_QUEUED
WAITING_EVIDENCE
```

完整枚举必须由 A6 Runtime 状态注册表输出后固化，禁止在文档或前端重新猜一套。

---

# 5. Opportunity 迁移规则

最低迁移约束：

```text
发现 / 创建
    ↓
资格判断
    ↓
CONTACTED
    ↓
对话推进
    ↓
NEGOTIATING
    ↓
WON / LOST / STOPPED
```

任何迁移都要携带：

```yaml
transition:
  object_id: string
  state_before: string | null
  state_after: string
  trigger_event_id: string
  run_id: string | null
  reason: string | null
  evidence_refs: string[]
  decided_at: datetime
```

---

# 6. Conversation State

Thread 状态与 Opportunity Stage 分离。

当前代码已经出现：

```text
IDLE
NEEDS_ANALYSIS
REPLIED
```

V2 允许扩展：

```text
WAITING_AI
WAITING_HUMAN
WAITING_BUYER
CLOSED
ERROR
```

Thread State 只表达当前对话处理状态。

---

# 7. Mission State

```text
DRAFT
  ↓
READY
  ↓
RUNNING
  ├── WAITING_APPROVAL
  ├── PAUSED
  └── FAILED
  ↓
COMPLETED
```

终止分支：

```text
CANCELLED
```

规则：

- `PAUSED` 禁止产生新外部动作。
- `CANCELLED` 禁止 Resume。
- `FAILED` 可在修复依赖后由人工触发 Resume。
- `COMPLETED` 只允许生成复盘事件，不重新执行旧 Run。

---

# 8. AgentRun State

当前 Runtime 已有：

```text
RUNNING
COMPLETED
WAITING_EVIDENCE
WAITING_APPROVAL
```

Run 需要保留：

```yaml
run_id: string
opportunity_id: string | null
trigger_event_id: string
status: string
state_before: string | null
state_after: string | null
capabilities_called: string[]
decision_before: string | null
decision_after: string | null
started_at: datetime
completed_at: datetime | null
```

Run 是一次执行记录，禁止覆写历史 Run 形成“最新状态”。

---

# 9. Approval State

```text
PENDING
  ↓
APPROVED → EXECUTING → EXECUTED
  ↓
REJECTED
```

实现中允许存在 `execution_status` 独立字段。

规则：

- Approval 只对一项明确外部动作负责。
- Approval 结果必须写 Event。
- 重复审批请求通过幂等键去重。
- 已 REJECTED 的 Payload 禁止执行。

---

# 10. External Action State

```text
PLANNED
QUEUED
SENDING
SENT
FAILED
CANCELLED
UNKNOWN
```

每个 External Action 需要：

```yaml
external_action_id: string
opportunity_id: string
approval_id: string | null
provider: string
kind: string
status: string
external_id: string | null
error_code: string | null
idempotency_key: string
created_at: datetime
updated_at: datetime
```

---

# 11. Hard Gates

状态迁移前统一检查：

## Evidence Gate

- 关键事实缺失 → `WAITING_EVIDENCE`
- Evidence 冲突未解决 → 禁止高风险迁移

## Dependency Gate

- A3 / A4 / A5 依赖刷新未完成 → 保持阻塞

## Approval Gate

- 外部商业承诺需审批 → `WAITING_APPROVAL`

## Identity Gate

- Opportunity / Buyer 未可靠绑定 → `NEEDS_CONTEXT`

## Risk Gate

- Market Access BLOCKED → 禁止进入可执行外联 / 成交承诺动作

---

# 12. State Transition Owner

```text
Opportunity Stage      → A6 Runtime
Opportunity Decision   → Decision Engine Snapshot
Conversation Thread    → Conversation Runtime
Mission Status         → Mission Orchestrator
Approval Status        → Approval Executor
External Action Status → Provider Adapter / Executor
```

一个状态只有一个 Owner。

---

# 13. Replay / Resume

当前代码支持 Run Resume。

V2 规则：

- Resume 必须带 `idempotency_key`。
- Resume 读取上一 Run 的 Trigger Event 与持久化状态。
- 已完成外部副作用禁止重复执行。
- Checkpoint 用于恢复，不用于篡改历史。

---

# 14. Audit

所有状态迁移记录：

```yaml
audit_id: string
object_type: opportunity | conversation | mission | approval | external_action
object_id: string
state_before: string | null
state_after: string
trigger_event_id: string | null
run_id: string | null
actor_role: string
actor_id: string | null
reason: string | null
created_at: datetime
```

---

# 15. 验收

- [ ] Event 单入口
- [ ] idempotency_key 必填
- [ ] Opportunity Stage 与 Runtime Status 分离
- [ ] Mission / Conversation 有独立状态机
- [ ] 状态迁移有唯一 Owner
- [ ] Evidence / Dependency / Approval / Identity Gate 生效
- [ ] Resume 不重复外部副作用
- [ ] 所有迁移可 Audit
