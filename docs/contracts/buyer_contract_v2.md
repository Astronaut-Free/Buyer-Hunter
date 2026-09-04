# QianPulse V2｜Buyer Contract

> 目标：把 Company、Contact、Business Event、Procurement Intelligence、Supplier Intelligence 收敛为统一 Buyer 业务对象，为 Opportunity 与 Conversation 提供稳定买家上下文。

---

# 1. Buyer 聚合结构

```text
Buyer
├── Company
├── Contacts
├── Business Events
├── Procurement Intelligence
├── Supplier Intelligence
└── Evidence Refs
```

---

# 2. Company

```yaml
buyer_id: string
name: string
normalized_name: string | null
domain: string | null
country: string | null
address: string | null
company_type: string | null
industry: string | null
value_chain_role: string | null
employee_range: string | null
founded_year: integer | null
products: string[]
sales_channels: string[]
target_markets: string[]
entity_status: VERIFIED | QUALIFIED_PENDING_ENTITY | UNVERIFIED | UNKNOWN
created_at: datetime
updated_at: datetime
```

规则：

- `buyer_id` 稳定。
- `domain` 是实体解析高价值键，但缺失时保留 null。
- `country` 表达公司所在地区，禁止代替采购目的地。
- `value_chain_role` 需要 Evidence 支撑。

---

# 3. Contact

```yaml
contact_id: string
buyer_id: string
name: string | null
title: string | null
department: string | null
decision_role: string | null
email: string | null
linkedin_url: string | null
public_channels: object[]
verification_status: VERIFIED | PROBABLE | UNVERIFIED | UNKNOWN
source_refs: string[]
last_verified_at: datetime | null
```

目标角色包括：

- Purchasing Manager
- Sourcing Manager
- Import Manager
- Supply Chain Manager
- Category Manager
- Product Manager

职位匹配只是线索，最终决策角色允许 UNKNOWN。

---

# 4. Business Event

```yaml
event_id: string
buyer_id: string
event_type: PRODUCT_LAUNCH | HIRING | EXPANSION | EXHIBITION | CHANNEL_CHANGE | POLICY_IMPACT | OTHER
title: string
summary: string | null
observed_at: datetime | null
source_refs: string[]
confidence: number | null
```

Business Event 可触发新 Signal，但事件本身不等于采购需求。

---

# 5. Procurement Intelligence

```yaml
buyer_id: string
categories: string[]
hs_codes: string[]
purchase_frequency: string | null
last_purchase_at: datetime | null
volume_trend: UP | DOWN | STABLE | UNKNOWN
value_trend: UP | DOWN | STABLE | UNKNOWN
origin_countries: string[]
purchase_cycle: string | null
seasonality: string | null
recent_records: object[]
evidence_refs: string[]
updated_at: datetime | null
```

任何趋势字段必须来自多个可比较记录。

---

# 6. Supplier Intelligence

```yaml
buyer_id: string
current_suppliers: object[]
historical_suppliers: object[]
new_suppliers: object[]
lost_suppliers: object[]
supplier_switch_score: number | null
supplier_switch_window: string | null
first_seen: datetime | null
last_seen: datetime | null
evidence_refs: string[]
updated_at: datetime | null
```

Supplier Change 需要时间序列证据。

单个供应商记录：

```yaml
supplier_id: string | null
name: string
country: string | null
first_seen: datetime | null
last_seen: datetime | null
relationship_status: CURRENT | NEW | LOST | HISTORICAL | UNKNOWN
source_refs: string[]
```

---

# 7. Entity Resolution

优先级：

```text
Verified Domain
    ↓
External Provider Stable ID
    ↓
Name + Country + Address
    ↓
Human Review
```

规则：

- 同 Domain 可作为强匹配信号。
- Domain 缺失时禁止自动硬合并相似公司名。
- 所有自动合并必须写入 merge audit。

```yaml
merge_audit:
  candidate_ids: string[]
  decision: AUTO_MERGE | HUMAN_MERGE | KEEP_SEPARATE
  score: number | null
  decided_by: string
  evidence_refs: string[]
  created_at: datetime
```

---

# 8. BuyerView

前端消费：

```yaml
company: object
contacts: object[]
business_events: object[]
procurement_intelligence: object | null
supplier_intelligence: object | null
evidence_summary:
  count: integer
  refs: string[]
```

敏感或受权限控制的联系方式由 Access Grant / Channel Contract 控制，BuyerView 不负责绕过权限。

---

# 9. Hard Gates

- 联系人未验证时禁止标记 VERIFIED。
- Buyer Country 禁止覆盖 Demand Destination。
- 单条贸易记录禁止直接推出长期增长趋势。
- Supplier Switch 无时间序列时保持 UNKNOWN。
- 相似公司名禁止自动实体合并。
- 无 Evidence 的企业动态只能作为待验证线索。

---

# 10. 验收

- [ ] Company / Contact / Event 分离
- [ ] Procurement Intelligence 有证据链
- [ ] Supplier Intelligence 有时间序列
- [ ] Buyer 与 Destination 字段彻底分离
- [ ] Contact 有 verification_status
- [ ] Entity Merge 有 Audit
- [ ] BuyerView 可直接供 Opportunity Workspace 使用
