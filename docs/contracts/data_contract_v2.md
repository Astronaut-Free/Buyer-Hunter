# QianPulse V2｜Data Contract

> 目标：统一 Data Source → Evidence → Opportunity → Action → Conversation → Outcome → Playbook 的数据链，明确每类字段的真值来源、UNKNOWN 规则、数据模式、写入 Owner 与跨层边界。

---

# 1. 数据主链

```text
API / Crawler / Browser Agent / User Input / Trade / News / Jobs / Communication
        ↓
Raw Observation
        ↓
Evidence
        ↓
Signal / Buyer / Demand / Seller Capability
        ↓
Opportunity
        ↓
Decision Snapshot
        ↓
Action / Conversation
        ↓
Outcome
        ↓
Playbook
```

---

# 2. Source Layer

统一来源类型：

```text
API
CRAWLER
BROWSER_AGENT
USER_INPUT
USER_UPLOAD
PUBLIC_WEB
SOCIAL_PUBLIC
TRADE_DATA
NEWS
JOBS
COMMUNICATION
SYSTEM
```

每个来源至少保存：

```yaml
source_id: string
source_type: string
provider: string | null
source_url: string | null
external_id: string | null
collected_at: datetime
data_mode: LIVE | CACHED | SAMPLE | SANDBOX | USER_PROVIDED | UNKNOWN
```

---

# 3. Raw Observation

Raw 层只保存采集结果，不负责业务判断。

```yaml
observation_id: string
source_id: string
schema_version: string
payload_ref: string | null
payload_hash: string
observed_at: datetime | null
collected_at: datetime
parser_status: PENDING | PARSED | FAILED
```

Raw 数据允许保留供应商专属字段；业务层禁止直接消费。

---

# 4. Evidence Layer

业务层第一真值入口：

```yaml
evidence_id: string
level: FACT | DERIVED | INFERENCE | ACTION
subject_type: string
subject_id: string | null
field: string
value: any
source_ref: string
observed_at: datetime | null
collected_at: datetime
confidence: number | null
data_mode: string
parent_evidence_ids: string[]
status: ACTIVE | SUPERSEDED | REJECTED
```

详细规则以 `evidence_contract_v2.md` 为准。

---

# 5. Signal

```yaml
signal_id: string
signal_type: IMPORTING_SIMILAR_PRODUCT | IMPORT_GROWTH | SUPPLIER_CHANGE | RFQ | PROCUREMENT_HIRING | NEWS_POLICY | PRODUCT_LAUNCH | MARKET_EXPANSION | EXHIBITION | OTHER
buyer_id: string | null
product_category: string | null
market: string | null
strength: number | null
freshness: number | null
observed_at: datetime | null
evidence_refs: string[]
status: ACTIVE | STALE | REJECTED
```

Signal 表达“值得关注的变化”，不直接等同于真实采购订单。

---

# 6. Demand

```yaml
demand_id: string
buyer_id: string | null
product: string | null
specification: string | null
quantity: string | null
price_range: string | null
certification: string[]
destination: string | UNKNOWN | null
delivery_time: string | null
moq: string | null
packaging: string | null
usage: string | null
published_at: datetime | null
expires_at: datetime | null
evidence_refs: string[]
```

规则：

- 未披露价格时 `price_range=null`。
- 未披露目的地时 `destination=UNKNOWN`。
- Buyer Country 禁止补到 Destination。

---

# 7. Buyer

Buyer 主体字段、Contact、Procurement Intelligence、Supplier Intelligence 以 `buyer_contract_v2.md` 为准。

主键关系：

```text
buyer_id
  ├── contact.buyer_id
  ├── business_event.buyer_id
  ├── procurement_intelligence.buyer_id
  ├── supplier_intelligence.buyer_id
  └── opportunity.buyer_id
```

---

# 8. Seller Capability

Seller 是供需匹配的另一端真值：

```yaml
seller_id: string
seller_capability_profile_id: string
products: object[]
markets: string[]
certifications: string[]
capacity: object | null
moq: object | null
packaging: string[]
constraints: object[]
evidence_refs: string[]
updated_at: datetime
```

Seller Fit 必须读取 Seller Capability Profile，禁止页面手工拼接匹配分数。

---

# 9. Opportunity

核心存储与聚合规则以 `opportunity_contract_v2.md` 为准。

关系：

```text
Signal / Demand / Buyer / Seller Capability
        ↓
Opportunity
        ↓
Decision Snapshot
        ↓
Runtime
```

---

# 10. Action

```yaml
action_id: string
opportunity_id: string
action_type: string
target_person_id: string | null
channel: string | null
content_ref: string | null
reason: string | null
evidence_refs: string[]
approval_required: boolean
approval_id: string | null
status: PLANNED | WAITING_APPROVAL | QUEUED | EXECUTING | DONE | FAILED | CANCELLED
scheduled_at: datetime | null
executed_at: datetime | null
```

Next Action Owner：A6 Runtime。

---

# 11. Conversation

Message、Thread、Intent、Extracted Fact、Voice Session 等以 `conversation_contract_v2.md` 为准。

Conversation 写入的新事实必须回到 Evidence Layer。

```text
Buyer Message
    ↓
Extracted Fact
    ↓
Evidence
    ↓
Opportunity Dependency Refresh
    ↓
A6 Next Action
```

---

# 12. Outcome

```yaml
outcome_id: string
opportunity_id: string
stage: WON | LOST | STOPPED | NEGOTIATING
reason: string | null
quote_status: string | null
sample_status: string | null
negotiation_status: string | null
reported_at: datetime
source: A6 | SELLER | SYSTEM
```

Outcome 必须保留原因，供 Playbook 复盘。

---

# 13. Playbook Input

Playbook 只读取完成闭环后的可追溯数据：

```yaml
playbook_input:
  opportunity_id: string
  outcome_id: string
  winning_signals: string[]
  losing_reasons: string[]
  channel_history: object[]
  message_history: object[]
  timing_history: object[]
  evidence_refs: string[]
```

禁止使用没有 Outcome 的进行中商机生成“成功打法”。

---

# 14. 字段真值 Owner

```text
Raw Source                 → Source Adapter
Evidence                   → Evidence Layer
Buyer Identity             → Buyer Intelligence / Entity Resolver
Demand Facts               → Evidence-backed Demand Parser
Seller Capability          → Seller Capability Profile
Opportunity Core           → Opportunity Store
Decision Snapshot          → Decision Engine
Next Action                → A6 Runtime
Conversation State         → Conversation Runtime
Approval                   → Approval Executor
External Action Status     → Provider Adapter / Executor
Outcome                    → A6 / Seller-reported Outcome Writer
Playbook                    → Playbook Engine
```

一个字段只能有一个最终 Owner。

---

# 15. UNKNOWN 规则

UNKNOWN 是正式状态。

必须使用 UNKNOWN / null 的典型字段：

- destination 未披露
- contact 未验证
- supplier switch 证据不足
- certification 要求不确定
- company domain 未解析
- price 未披露
- purchase cycle 无时间序列

禁止：

- 用 Buyer Country 推断 Destination
- 用行业平均值填采购量
- 用模型生成联系人邮箱并标记 VERIFIED
- 用单条交易记录推断长期趋势

---

# 16. Data Mode

全链路保留：

```text
LIVE
CACHED
SAMPLE
SANDBOX
USER_PROVIDED
UNKNOWN
```

任何由 SANDBOX 进入的记录在前端、API、评分层都必须保留标记。

---

# 17. Dedup / Identity

## Signal

建议稳定键：来源 + source external id + normalized buyer/product/time。

## Buyer

优先 Domain / Provider Stable ID。

## Opportunity

稳定 ID，禁止重建时随评分变化。

## External Action

幂等键防重复发送。

---

# 18. Retention / Audit

- Raw Observation 可归档，不能影响 Evidence 引用有效性。
- Decision Snapshot 不覆盖历史。
- Message / Approval / Run / Outcome 保留 Audit。
- Evidence 被废弃时标记 `SUPERSEDED` 或 `REJECTED`，禁止物理静默删除导致证据链断裂。

---

# 19. Hard Gates

- Source 无 provenance → 不进入 FACT
- Evidence 冲突未解决 → 不进入高风险 Action
- Seller Capability 缺失 → Seller Fit 保持 UNKNOWN / WAITING_EVIDENCE
- Buyer Entity 未可靠绑定 → 禁止外部触达
- Market Access BLOCKED → 禁止进入承诺性动作
- Approval 未完成 → External Action 不执行

---

# 20. 验收

- [ ] Data Source 与业务对象解耦
- [ ] Raw / Evidence / Inference 分层
- [ ] 字段 Owner 唯一
- [ ] UNKNOWN 为正式状态
- [ ] Data Mode 全链路保留
- [ ] Decision Snapshot 可追溯
- [ ] Conversation 新事实回流 Evidence
- [ ] Outcome 能进入 Playbook
- [ ] 外部副作用具备幂等键
