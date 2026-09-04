# QianPulse V2｜Opportunity Contract

> 状态：V2 工程 Contract
>
> 目标：统一商机主对象、判断快照、运行时推进状态与前端聚合视图，消除多个 Opportunity 口径并存造成的真值冲突。

---

# 1. Contract Owner

- 主对象 Owner：`core.opportunity`
- 商业判断 Owner：`intel.opportunity_decision_snapshot`
- 下一步动作 Owner：A6 Runtime
- 前端读取对象：`OpportunityView`
- ID：稳定、跨 Runtime、禁止重建后漂移

当前仓库仍存在 Python Free Store 与 Node Agent Runtime 两类 Opportunity 表达，V2 Contract 负责统一读取口径；迁移期间保留现有 bridge，禁止前端自行合并两个对象。

---

# 2. 核心数据流

```text
Signal / Buyer / Seller Capability
        ↓
core.opportunity
        ↓
Decision Snapshot
        ↓
A2 / A6 Runtime
        ↓
Action / Conversation / Outcome
        ↓
OpportunityView
```

---

# 3. core.opportunity

最小稳定字段：

```yaml
id: string
seller_id: string
buyer_id: string
origin: A1_INBOUND_DEMAND | A2_PROACTIVE
source_signal_id: string | null
product_category: string
fields:
  product: string | null
  demand_title: string | null
  quantity: string | null
  certification: string | null
  destination: string | UNKNOWN | null
stage: string
status: string
created_at: datetime
updated_at: datetime
```

## 3.1 不变量

1. `origin` 创建后不可修改。
2. `id` 不因评分、状态、买家回复、Runtime 切换而变化。
3. `destination` 缺失时使用 `UNKNOWN`，禁止用买家公司所在国补位。
4. Buyer 合并必须走实体解析，禁止仅凭名称模糊覆盖。
5. 业务判断不得直接覆盖原始 Evidence。

---

# 4. Decision Snapshot

商业判断采用快照，保留历史判断依据：

```yaml
opportunity_id: string
truth_score: number | null
timing_score: number | null
seller_fit_score: number | null
market_access_score: number | null
commercial_execution_score: number | null
procurement_channel_actionability_score: number | null
opportunity_score: number | null
decision: string | null
why_now: string[]
gaps: string[]
blockers: object[]
ruleset_version: string | null
input_snapshot_sha256: string | null
created_at: datetime
```

规则：

- 一次判断生成一个 snapshot。
- 新证据触发新 snapshot。
- 旧 snapshot 不修改。
- 前端默认展示最新 snapshot，并允许追溯历史版本。

---

# 5. Runtime 字段

A2 / A6 Runtime 管理持续推进信息：

```yaml
stage: string
status: string
next_action: object | null
approvals: object[]
blockers: object[]
latest_run_id: string | null
conversation_state: object | null
outcome: object | null
```

## 5.1 Next Action 单一 Owner

`next_action` 由 A6 Runtime 负责。

Free / Decision Engine 提供商业判断与建议输入；运行时根据买家回复、审批、证据刷新、依赖状态生成最终执行动作。

---

# 6. OpportunityView

前端只消费聚合后的业务视图：

```yaml
opportunity:
  id: string
  source: string | null
  origin: string | null
  stage: string | null
  status: string | null
  buyer: object | null
  seller: object | null
  product: string | null
  updated_at: datetime | null
score:
  opportunity: number | null
  truth: number | null
  timing: number | null
  fit: number | null
  intent: number | null
why_now: string[]
next_action: object | null
blockers: object[]
approvals: object[]
evidence:
  count: integer
  refs: string[]
activity:
  runs: object[]
  messages: object[]
outcome: object | null
```

前端禁止直接读取 ImportYeti、Apollo、Trademo、Smartlead 等供应商原始字段。

---

# 7. Stage 与 Status

Stage 表达商务生命周期；Status 表达运行时执行状态。

当前代码已经出现的 Stage / Outcome 值包括：

- `CONTACTED`
- `NEGOTIATING`
- `WON`
- `LOST`
- `STOPPED`

当前运行时已经出现的 Status 包括：

- `READY_FOR_OUTREACH_APPROVAL`
- `OUTREACH_QUEUED`
- `WAITING_EVIDENCE`
- Runtime 产生的其他状态

V2 实现时必须从 A6 状态注册表生成完整枚举，禁止前端另建第二套状态字典。

---

# 8. Priority

```yaml
priority:
  level: P0 | P1 | P2 | P3 | UNKNOWN
  reason: string | null
  computed_at: datetime | null
```

Priority 只能基于最新 Decision Snapshot + Runtime Context 生成。

缺少关键证据时允许 `UNKNOWN`。

---

# 9. Outcome

```yaml
outcome:
  stage: WON | LOST | STOPPED | NEGOTIATING | null
  reason: string | null
  reported_at: datetime | null
  source: A6 | SELLER | SYSTEM | null
```

Outcome 写入后进入 Playbook 复盘输入。

---

# 10. Evidence 约束

`evidence_refs` 只能保存：

- URL
- `provider:kind:id`
- 系统可解析的 Evidence ID

禁止保存无法追溯来源的自由文本作为证据引用。

---

# 11. Hard Gates

以下任一条件成立时，禁止自动推进高风险外部动作：

- Opportunity 无稳定 ID
- Buyer 未可靠绑定
- 关键结论无 Evidence
- Hard Condition 冲突
- Market Access 为 BLOCKED
- Runtime 等待证据
- 存在 PENDING Approval
- next_action 依赖未刷新

---

# 12. 兼容策略

迁移期：

```text
Python Free Store
      +
Node Agent Runtime
      ↓
V2 Aggregation / Bridge
      ↓
OpportunityView
```

完成统一 Store 后，Bridge 可退役；前端 Contract 保持不变。

---

# 13. 验收

- [ ] 一个商机只有一个稳定 Opportunity ID
- [ ] 一个判断保留一个不可变 snapshot
- [ ] next_action 只有 A6 一个 Owner
- [ ] Evidence 可追溯
- [ ] UNKNOWN 不被猜测值覆盖
- [ ] 前端只读 OpportunityView
- [ ] WON / LOST / STOPPED 可进入 Outcome 与 Playbook
