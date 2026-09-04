# QianPulse V2｜Evidence Contract

> 目标：统一 API、Crawler、Browser Agent、用户输入、贸易数据、新闻、招聘、沟通记录进入系统后的证据表达，让每个判断都能回到来源。

---

# 1. Evidence Layer 位置

```text
Data Source
    ↓
Evidence
    ↓
Signal / Buyer / Demand
    ↓
Opportunity Decision
    ↓
Action
```

页面、Agent、评分器均禁止直接把第三方原始字段当作业务真值。

---

# 2. Evidence Level

系统统一四类：

## FACT

可直接从来源确认的事实。

示例：

- 某公开 RFQ 的产品、数量、发布时间
- 某贸易记录中的买家、供应商、时间
- 企业官网公开的产品与地址
- 买家在对话中明确表达的交期

## DERIVED

由 FACT 通过确定性规则计算出的结果。

示例：

- 同比增长
- 最近 90 天采购次数
- 新增 / 流失供应商
- Buyer Domain 标准化

## INFERENCE

模型或规则基于多个 Evidence 形成的判断。

示例：

- Why Now
- Supplier Switch Window
- Buyer Intent
- Seller Fit 推断

## ACTION

系统基于判断生成的执行建议或动作。

示例：

- 建议联系采购负责人
- 建议补充认证材料
- 建议 48 小时内跟进

---

# 3. 核心字段

```yaml
evidence_id: string
level: FACT | DERIVED | INFERENCE | ACTION
subject_type: buyer | contact | demand | signal | opportunity | conversation | seller | market
subject_id: string | null
field: string
value: any
source:
  provider: string
  kind: string
  source_url: string | null
  external_id: string | null
observed_at: datetime | null
collected_at: datetime
confidence: number | null
freshness: string | null
data_mode: LIVE | CACHED | SAMPLE | SANDBOX | USER_PROVIDED | UNKNOWN
provenance:
  collector: string | null
  parser_version: string | null
  ruleset_version: string | null
  parent_evidence_ids: string[]
raw_ref: string | null
status: ACTIVE | SUPERSEDED | REJECTED
```

---

# 4. Provenance 规则

1. FACT 必须存在来源。
2. DERIVED 必须列出 `parent_evidence_ids`。
3. INFERENCE 必须能追溯到支撑它的 FACT / DERIVED。
4. ACTION 必须能追溯到判断输入。
5. 用户手工录入使用 `data_mode=USER_PROVIDED`。
6. 沙盒数据使用 `data_mode=SANDBOX`，禁止展示为已验证采购需求。

---

# 5. Source Ref

合法来源引用：

```text
https://...
provider:kind:id
evidence:<id>
```

禁止：

- “网上看到”
- “AI 判断”
- 无 URL / 无 provider id 的事实性引用

---

# 6. Confidence

`confidence` 范围 0–100。

规则：

- FACT 的 confidence 表达来源与抽取可靠度。
- DERIVED 的 confidence 受父 Evidence 影响。
- INFERENCE 的 confidence 表达判断强度，不能伪装成交易概率。
- UNKNOWN 允许保留，不强制生成分数。

---

# 7. Freshness

每条 Evidence 至少保留：

- `observed_at`
- `collected_at`

对采购时机敏感的 Signal 应额外计算 freshness。

默认原则：

```text
最新 Evidence 优先
历史 Evidence 保留
新旧冲突时不覆盖，进入冲突处理
```

---

# 8. 冲突处理

当两个 Evidence 对同一字段冲突：

```yaml
conflict:
  field: string
  evidence_ids: string[]
  resolution_status: OPEN | RESOLVED | HUMAN_REVIEW
  selected_evidence_id: string | null
  reason: string | null
```

自动解决只允许使用明确规则，例如：

- 官方源优先于聚合转载
- 原始时间戳优先于二次摘录
- 买家最新明确回复优先于旧推断

无法确定时进入 `HUMAN_REVIEW`。

---

# 9. UNKNOWN 规则

以下场景必须保留 UNKNOWN：

- 数量未披露
- 目的地未披露
- 联系人未验证
- 供应商变化证据不足
- 认证要求来源不清
- Buyer Domain 未解析

禁止用买家公司国家、行业平均值、模型猜测填充事实字段。

---

# 10. Evidence Bundle

一个业务判断可以引用一个 Bundle：

```yaml
bundle_id: string
subject_id: string
evidence_ids: string[]
claim: string
level: DERIVED | INFERENCE | ACTION
created_at: datetime
```

Why Now、Seller Fit、Market Access、Next Action 均应通过 Evidence Bundle 提供证据链。

---

# 11. 前端要求

前端 Evidence Panel 至少展示：

- claim
- level
- source
- observed_at
- confidence
- freshness
- data_mode

点击后可回到来源或可解析 Evidence ID。

---

# 12. Hard Gates

以下情况禁止把结论升级为可执行事实：

- 无来源
- SANDBOX 被当成 LIVE
- INFERENCE 没有父 Evidence
- 来源时间缺失且时效直接影响判断
- 关键字段冲突未解决
- Evidence 已标记 REJECTED

---

# 13. 验收

- [ ] FACT / DERIVED / INFERENCE / ACTION 全量区分
- [ ] 每个 FACT 可追溯
- [ ] DERIVED / INFERENCE 有父 Evidence
- [ ] UNKNOWN 保留
- [ ] SANDBOX 有显式标记
- [ ] 冲突不会静默覆盖
- [ ] 前端可以打开 Evidence Chain
