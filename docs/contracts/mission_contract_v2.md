# QianPulse V2｜Mission Contract

> 目标：把用户的自然语言生意目标转成可验证、可调度、可暂停、可恢复的 BD Mission，让 Agent 团队围绕同一个任务边界执行。

---

# 1. Mission 结构

```text
Mission Goal
    ↓
Target Market
    ↓
Target Buyer
    ↓
Constraints
    ↓
Execution Strategy
    ↓
Agent Runs
    ↓
Opportunity / Conversation / Outcome
```

---

# 2. Mission Core

```yaml
mission_id: string
seller_id: string
title: string
goal:
  raw_text: string
  normalized_goal: string | null
target_market:
  countries: string[]
  regions: string[]
target_buyer:
  company_types: string[]
  industries: string[]
  product_keywords: string[]
  buyer_roles: string[]
constraints:
  excluded_markets: string[]
  excluded_company_types: string[]
  hard_requirements: object[]
execution_mode: ASSISTED | APPROVAL_GATED | AUTOMATED_WITH_GATES
approval_policy: object
status: DRAFT | READY | RUNNING | PAUSED | WAITING_APPROVAL | COMPLETED | FAILED | CANCELLED
created_at: datetime
updated_at: datetime
```

---

# 3. Natural Language Parse

当前代码已经提供 `/api/v1/agent/nl-targets`，用于把自然语言解析为 A2 可执行 Payload。

V2 Mission 保存两份内容：

```yaml
raw_input:
  text: string
  language: string | null
parsed_target:
  countries: string[]
  product_keywords: string[]
  company_types: string[]
  source: deepseek | rules
```

规则：

- 原始文本永久保留。
- 解析结果可以修订。
- 关键目标缺失时进入 `NEEDS_INPUT`，禁止猜测。
- Country、Product、Buyer Type 为最小可执行目标。

---

# 4. Seller Context

```yaml
seller_context:
  seller_id: string
  seller_capability_profile_id: string | null
  products: object[]
  target_markets: string[]
  certifications: string[]
  production_constraints: object[]
  evidence_refs: string[]
```

Mission 只引用 Seller Context，不复制第二份 Seller 真值。

---

# 5. Execution Strategy

```yaml
strategy:
  discovery_sources: string[]
  ranking_policy: string | null
  outreach_channels: string[]
  contact_roles: string[]
  max_accounts_per_run: integer | null
  follow_up_policy: object | null
  stop_conditions: object[]
```

Strategy 可以由 AI 建议，最终执行边界由 Mission Contract 保存。

---

# 6. Agent Orchestration

Mission 调度结果：

```yaml
execution:
  run_ids: string[]
  generated_opportunity_ids: string[]
  latest_run_id: string | null
  progress:
    discovered: integer
    qualified: integer
    contacted: integer
    replied: integer
    won: integer
    lost: integer
  blockers: object[]
```

Mission 本身不替代 AgentRun；Run 是一次执行实例，Mission 是长期业务目标容器。

---

# 7. Approval Policy

```yaml
approval_policy:
  first_outreach: REQUIRED | OPTIONAL | AUTO
  reply_send: REQUIRED | RISK_BASED | AUTO
  price_commitment: REQUIRED
  delivery_commitment: REQUIRED
  certification_commitment: REQUIRED
  contract_related: REQUIRED
```

生产默认：高风险外部承诺必须 Human Gate。

---

# 8. Pause / Resume

```yaml
pause:
  reason: string
  paused_by: string
  paused_at: datetime
resume:
  idempotency_key: string
  resumed_by: string
  resumed_at: datetime
```

当前 Runtime 已有 `MANUAL_RESUME` 与 Run Resume 机制；Mission Resume 应复用同一幂等原则。

---

# 9. Mission Event

关键事件：

```text
MISSION_CREATED
MISSION_TARGET_PARSED
MISSION_READY
MISSION_STARTED
MISSION_PAUSED
MISSION_APPROVAL_REQUIRED
MISSION_RESUMED
MISSION_COMPLETED
MISSION_FAILED
MISSION_CANCELLED
```

事件统一进入 State/Event Contract。

---

# 10. MissionView

前端页面消费：

```yaml
mission: object
target_summary: object
strategy_summary: object
progress: object
recent_runs: object[]
recent_opportunities: object[]
blockers: object[]
pending_approvals: object[]
next_action: object | null
```

---

# 11. Hard Gates

- 国家缺失 → 不执行 A2
- 产品关键词缺失 → 不执行 A2
- Buyer Type 缺失 → 不执行 A2
- Seller Context 不足且影响供需匹配 → 进入 WAITING_EVIDENCE
- 外联政策要求审批 → 无审批不得发送
- Mission PAUSED / CANCELLED → 禁止创建新的外部动作

---

# 12. 验收

- [ ] 原始目标与解析结果同时保存
- [ ] Mission 与 AgentRun 分离
- [ ] Mission 可 Pause / Resume
- [ ] 目标缺失时返回 NEEDS_INPUT
- [ ] Approval Policy 可执行
- [ ] Mission Progress 由真实 Run / Opportunity / Outcome 聚合
- [ ] Mission 不创建第二份 Seller 真值
