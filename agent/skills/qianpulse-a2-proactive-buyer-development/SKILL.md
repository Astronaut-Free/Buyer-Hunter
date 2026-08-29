---
name: qianpulse-a2-proactive-buyer-development
description: Use this skill when QianPulse needs to proactively develop overseas B2B buyers for a seller-defined market and product. Convert a market-development goal into a structured target, discover and verify buyer companies, enrich decision makers, assess outreach readiness, generate evidence-grounded email outreach, manage pre-reply follow-up, and hand off a replied opportunity to A6. Keep company discovery, contact enrichment, evidence, transport, and orchestration separated through adapters and QianPulse CapabilityResultEnvelope.
compatibility: QianPulse Agent Control Plane, Capability Registry, Capability Adapter, Opportunity, Evidence, Conversation, Approval, Checkpoint, Trace.
---

# A2｜主动商机拓展

## 1. 使用条件

当卖家表达主动进入某个目标市场、寻找潜在采购商、进口商、分销商、渠道商或企业客户的目标时使用本 SKILL。

典型问题：

- 我想进入美国市场，哪些企业最可能采购我们的抹茶？
- 帮我找越南可能采购辣椒制品的进口商。
- 找到值得优先开发的买家公司和采购负责人，并准备首封开发邮件。

A2 处理“可能会买”的主动开发。

若系统已捕获明确、正在发生的采购需求，优先交由 A1。

若买家已经产生有效回复，A2 停止当前主动开发周期并交接 A6。

## 2. 业务目标

围绕卖家产品与目标市场建立一条可验证的主动开发链路：

```text
目标市场
→ 客户画像
→ Buyer Company Discovery
→ Buyer Fit Research
→ Decision Maker Enrichment
→ Outreach Readiness Gate
→ Email Draft
→ Human Approval
→ Email Execution
→ Pre-reply Follow-up
→ Buyer Reply
→ Handoff A6
```

最终交付应回答：

1. 哪家公司值得联系。
2. 为什么值得联系。
3. 为什么值得开发；若 A3 提供了近期时机证据，再单独展示可选的 `why_now`。
4. 应联系谁。
5. 证据是什么。
6. 当前是否具备外联条件。
7. 下一步应该做什么。

## 3. 一期边界

### 3.1 一期自动执行渠道

仅支持：

```text
Email
```

### 3.2 一期允许作为信息来源

```text
贸易行为数据
企业官网
公开产品目录
公开企业目录
展会 / 商协会公开页面
第三方联系人数据库
```

### 3.3 一期明确暂缓

```text
LinkedIn 自动抓取 / 自动私信
WhatsApp 自动触达
Facebook 自动抓取 / 私信
Instagram 自动抓取 / 私信
TikTok 自动抓取 / 私信
X 自动抓取 / 私信
Reddit 大规模抓取
Browser Agent 全网自主开发
AI 电话
自动正式报价
自动商务承诺
```

外部平台公开 URL 可以作为人工参考字段保存，但不进入一期自动执行链。

## 4. 输入契约

最小输入：

```yaml
seller:
  seller_id: string
  company_id: string
  product_id: string

target:
  countries: [string]
  product_keywords: [string]
  hs_codes: [string]
  industries: [string]

buyer_profile:
  company_types: [string]
  company_size: optional
  buyer_roles: [string]

constraints:
  max_candidates: integer
  language: string
  exclude_companies: [string]
  exclude_domains: [string]
  contact_limit_per_company: integer

execution:
  channel: email
  human_gate: true
```

若产品、目标国家、买家类型缺失到无法形成可靠搜索条件，返回 `MORE_EVIDENCE`。

## 5. 标准步骤

### S1｜Target Market Parse

将自然语言目标转换为结构化 Target Definition。

输出至少包含：

```yaml
target_definition:
  countries: []
  product_keywords: []
  hs_codes: []
  buyer_company_types: []
  decision_maker_roles: []
  exclusions: []
  evidence_refs: []
```

规则：

- HS Code 只有在有证据或确定性映射服务支持时才写入。
- 不通过模型猜测精确 HS Code 并当作事实。
- 目标过宽时优先收缩买家公司类型，避免无边界扩大数据源。

### S2｜Buyer Company Discovery

一期按以下优先级寻找 Buyer Company：

```text
P1 贸易行为数据
P2 企业官网 / 产品目录
P3 展会 / 商协会 / 公开企业目录
```

候选单位必须以企业为主实体。

禁止先找一个联系人，再倒推其公司值得开发。

每个候选公司至少保存：

```yaml
buyer_company_candidate:
  buyer_company_id: string
  legal_or_display_name: string
  country: string
  domain: string
  source_refs: []
  discovery_reason: string
```

### S3｜Buyer Fit Research

对每个候选 Buyer Company 输出：

```yaml
buyer_fit:
  buyer_company_id: string
  sells_or_uses_product: unknown|yes|no
  relevant_product_categories: []
  import_evidence: []
  market_evidence: []
  buyer_type: string
  likely_use_case: string
  why_fit: string
  why_now: optional string
  evidence_refs: []
  confidence: low|medium|high
```

判断规则：

- `why_fit` 必须由企业经营范围、产品、贸易行为或公开业务证据支撑。
- `why_now` 仅在 A3 提供近期时机证据时填写；没有 A3 证据时保持为空，但不阻断 A2 Discovery。
- A3 是采购时机与 `why_now` 的唯一权威 SKILL，A2 不从 shipment recency 推断采购窗口。
- 无证据时不得生成采购事实。
- 存在严重冲突证据时标记 `NEEDS_REVIEW`。

### S4｜Decision Maker Enrichment

Buyer Fit 达到可继续条件后才查询具体联系人。

角色优先级默认：

```text
Procurement
Purchasing
Sourcing
Import
Category
Supply Chain
Founder / Owner（小企业）
```

联系人最小字段：

```yaml
contact:
  contact_id: string
  buyer_company_id: string
  name: string
  title: string
  work_email: string
  email_status: verified|unverified|unknown
  role_reason: string
  source_refs: []
```

禁止：

- 将私人邮箱自动视为企业采购联系人。
- 缺少企业绑定时输出“精准采购负责人”。
- 一家公司无限制扩展联系人数量。

### S5｜Outreach Readiness Gate

检查：

```text
Company Fit
Product Relevance
Trade / Market Evidence
Contact Relevance
Contact Reachability
A5 Block Status
Suppression / Opt-out Status
```

只允许三态：

```text
READY
MORE_EVIDENCE
BLOCKED
```

`BLOCKED` 必须停止外联执行。

### S6｜Personalized Outreach

根据 Seller Value Proposition、Buyer Evidence、Contact Role、Reasons to Engage 生成邮件草稿。

输出：

```yaml
outreach:
  subject: string
  opening_reason: string
  buyer_context: string
  relevance: string
  value_proposition: string
  cta: string
  language: string
  evidence_refs: []
```

硬规则：

```text
不得虚构对方需求
不得虚构采购计划
不得虚构合作记录
不得虚构客户案例
不得虚构价格
不得承诺独家
不得承诺未验证认证
不得承诺未验证交期
```

### S7｜Email Execution

一期流程：

```text
Draft
→ Human Approval
→ Email Adapter
→ Send
→ External Message ID
→ ConversationThread
→ WAITING_EXTERNAL
```

SKILL 不依赖具体邮件服务商名称。

服务商通过 Connector / Adapter 接入。

### S8｜Pre-reply Follow-up

A2 仅处理买家尚未产生有效回复之前的 Follow-up。

输入：

```text
是否已回复
最近发送时间
发送轮次
Bounce 状态
Unsubscribe 状态
Buyer Fit 是否变化
是否出现新的有效信号
```

动作固定为：

```text
WAIT
FOLLOW_UP
REFRESH_RESEARCH
STOP
HANDOFF_A6
```

禁止将固定 Day 1 / Day 3 / Day 7 / Day 14 作为唯一决策规则。

确定性时间策略仅定义：

- 最早可再次发送时间。
- 最大外联轮次。
- 静默期。
- Stop / Suppression 规则。

是否继续触达仍需结合 Opportunity 状态与新信号。

## 6. 交接与终止

```text
BUYER_REPLIED
→ HANDOFF_A6

UNSUBSCRIBE
→ STOP

HARD_BOUNCE
→ STOP

A5_BLOCKED
→ BLOCKED

MAX_OUTREACH_REACHED
→ STOP

NO_VALID_CONTACT
→ MORE_EVIDENCE

NO_BUYER_FIT
→ NOT_APPLICABLE
```

## 7. 输出契约

```yaml
a2_result:
  target_definition: {}

  buyer_company: {}
  buyer_fit: {}
  evidence_refs: []

  contact: {}
  contact_reason: string

  outreach_readiness:
    status: READY|MORE_EVIDENCE|BLOCKED
    reason: string

  outreach:
    draft: {}
    language: string

  followup:
    status: WAIT|FOLLOW_UP|REFRESH_RESEARCH|STOP|HANDOFF_A6
    next_eligible_at: optional

  handoff:
    next_skill: optional
    reason: optional

  human_review_required: boolean
```

外层统一返回 `CapabilityResultEnvelope`。

## 8. 允许工具 / 服务

工具通过 Adapter 使用，SKILL 只声明能力类型：

```text
trade_data.search_buyers
public_web.fetch_company
company_directory.search
contact_data.search_people
contact_data.enrich_person
email_transport.send
email_transport.get_delivery_state
evidence_store.read
evidence_store.write
opportunity_store.read
opportunity_store.write
suppression_store.check
```

## 9. 禁止动作

- 绕过 A5 明确 BLOCKED 的结论继续外联。
- 绕过 Human Gate 执行外部发送。
- 对同一 idempotency key 重复执行发送。
- 把联系人 enrichment 结果升级成采购意向事实。
- 把网站营销文案直接当成采购行为事实。
- 为提高候选数量无限扩展平台与社媒来源。
- 自动创建第二套 Opportunity 真值。

## 10. 证据要求

关键判断必须带 `evidence_refs`：

```text
Buyer Company Discovery
Buyer Fit
Why Now
Contact Role
Outreach Claim
Blocked Reason
```

证据至少保存：

```yaml
evidence:
  evidence_id: string
  source_type: string
  source_url_or_ref: string
  captured_at: timestamp
  excerpt_or_fact: string
  confidence: optional
```

## 11. 失败处理

```text
数据源超时
→ ERROR，可重试

数据源无结果
→ MORE_EVIDENCE / NOT_APPLICABLE

联系人数据库失败
→ 保留 Buyer Company，暂停联系人阶段

邮件服务失败
→ ERROR，不更新为 SENT

重复 Webhook
→ 幂等丢弃

证据冲突
→ NEEDS_REVIEW
```

## 12. 验证方法

上线前至少覆盖：

- 正常 Buyer Discovery。
- 无贸易记录但官网有相关产品。
- 只有联系人没有公司证据。
- 联系人邮箱无效。
- Buyer 回复后立即交接 A6。
- A5 BLOCKED 后禁止发送。
- Unsubscribe 后永久停止当前可联系身份。
- 重复事件不重复发送。
- 数据源故障可恢复。
- 目标过宽时不无限扩平台。

## 13. 完成标准

A2 一期完成必须支持一条真实链路：

```text
Seller Goal
→ Target Definition
→ Buyer Company
→ Evidence-backed Buyer Fit
→ Decision Maker
→ READY Gate
→ Approved Email
→ Sent
→ WAITING_EXTERNAL
→ Follow-up / Reply
→ Handoff A6
```

任何一段缺少证据、状态或审计信息，都不视为完整 A2 运行。
