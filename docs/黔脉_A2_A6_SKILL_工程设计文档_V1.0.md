# 黔脉 QianPulse｜A2 / A6 SKILL 工程设计文档 V1.0

> 文档类型：Engineering Design / Implementation Spec
> 
> 适用阶段：A2、A6 一期工程实现
> 
> 前置依赖：QianPulse Agent Control Plane、Capability Registry、Capability Adapter、Result Envelope、Opportunity、Conversation、Approval、Checkpoint、Trace

---

# 1. 工程目标

一期只实现一条可运行、可测试、可恢复的业务闭环：

```text
Seller Target
↓
A2 Buyer Discovery
↓
Buyer Research
↓
Decision Maker Enrichment
↓
Email Draft
↓
Approval
↓
Send
↓
Buyer Reply
↓
A6 Reply Understanding
↓
Changed Fields
↓
A3 / A4 / A5 Incremental Refresh
↓
Next Best Action
↓
Draft / Task / Wait / Human Takeover
↓
Outcome Event
```

工程原则：

1. 不新建第二套 Agent Runtime。
2. A2 / A6 作为 Capability / SKILL 接入现有 QianPulse Agent。
3. 数据源与渠道供应商通过 Adapter 隔离。
4. 所有外部副作用经过 Idempotency + Human Gate。
5. 所有专业结论携带 Evidence Refs。
6. 每个 Event 只重跑受影响能力。
7. 状态必须可持久化、恢复、回放。

---

# 2. 总体架构

```text
┌───────────────────────────────────────────────┐
│                 Interaction                    │
│ Seller Chat / Buyer Email / Internal Console   │
└──────────────────────┬────────────────────────┘
                       ↓
┌───────────────────────────────────────────────┐
│             QianPulse Agent Control Plane      │
│ Event Router                                   │
│ Role Resolver                                  │
│ Opportunity Resolver                           │
│ Capability Router                              │
│ Routing Policy                                 │
│ Runtime State                                  │
│ Human Gate                                     │
│ Checkpoint / Resume / Idempotency / Trace      │
└──────────────────────┬────────────────────────┘
                       ↓
┌───────────────────────────────────────────────┐
│                Capability Layer                │
│                                               │
│ A2 Proactive Buyer Development                │
│ A3 Purchase Timing                            │
│ A4 Supply Match                               │
│ A5 Risk Match                                 │
│ A6 Opportunity Progression                    │
└──────────────────────┬────────────────────────┘
                       ↓
┌───────────────────────────────────────────────┐
│                Service / Adapter               │
│ TrademoAdapter                                 │
│ ImportYetiAdapter                              │
│ PublicWebResearchAdapter                       │
│ ApolloAdapter                                  │
│ EmailTransportAdapter                         │
│ EvidenceService                                │
│ DeterministicRuleEngine                        │
└──────────────────────┬────────────────────────┘
                       ↓
┌───────────────────────────────────────────────┐
│                    Data Layer                  │
│ Opportunity / BuyerCompany / Contact /         │
│ Evidence / Conversation / Draft / Approval /   │
│ FollowUp / AgentRun / AgentStep / Outcome      │
└───────────────────────────────────────────────┘
```

---

# 3. 推荐代码目录

```text
src/
├─ agent/
│  ├─ orchestrator.py
│  ├─ event_router.py
│  ├─ opportunity_resolver.py
│  ├─ capability_registry.py
│  ├─ capability_adapter.py
│  ├─ routing_policy.py
│  ├─ approval_gate.py
│  ├─ checkpoint.py
│  ├─ idempotency.py
│  └─ trace.py
│
├─ capabilities/
│  ├─ a2_proactive_buyer_development/
│  │  ├─ capability.py
│  │  ├─ schemas.py
│  │  ├─ validators.py
│  │  └─ skill/
│  │     ├─ SKILL.md
│  │     ├─ references/
│  │     └─ evals/
│  │
│  └─ a6_opportunity_progression/
│     ├─ capability.py
│     ├─ schemas.py
│     ├─ validators.py
│     └─ skill/
│        ├─ SKILL.md
│        ├─ references/
│        └─ evals/
│
├─ adapters/
│  ├─ trade_data/
│  │  ├─ base.py
│  │  ├─ trademo.py
│  │  └─ importyeti.py
│  ├─ enrichment/
│  │  ├─ base.py
│  │  └─ apollo.py
│  ├─ web_research/
│  │  └─ public_web.py
│  └─ email/
│     ├─ base.py
│     ├─ smartlead.py
│     └─ instantly.py
│
├─ services/
│  ├─ evidence_service.py
│  ├─ contact_service.py
│  ├─ opportunity_service.py
│  ├─ conversation_service.py
│  ├─ followup_service.py
│  ├─ approval_service.py
│  └─ outcome_service.py
│
├─ engines/
│  ├─ readiness_gate.py
│  ├─ execution_risk_gate.py
│  ├─ followup_scheduler.py
│  └─ state_transition.py
│
├─ contracts/
│  ├─ agent-event.schema.json
│  ├─ capability-result-envelope.schema.json
│  ├─ a2-input.schema.json
│  ├─ a2-result.schema.json
│  ├─ a6-input.schema.json
│  ├─ a6-result.schema.json
│  ├─ reply-understanding.schema.json
│  ├─ next-action.schema.json
│  └─ email-event.schema.json
│
└─ tests/
   ├─ unit/
   ├─ integration/
   ├─ contract/
   ├─ golden/
   └─ fixtures/
```

---

# 4. Capability Registry

A2：

```yaml
capability_id: qianpulse.a2.proactive_buyer_development
version: 1.0.0
description: Discover and qualify potential overseas buyer companies, enrich decision makers, prepare evidence-grounded outreach, and manage pre-reply follow-up.
required_inputs:
  - seller_profile
  - product_context
  - target_definition
produced_outputs:
  - buyer_candidates
  - buyer_fit
  - decision_maker
  - outreach_readiness
  - outreach_draft
  - followup_state
status_contract:
  - DONE
  - MORE_EVIDENCE
  - BLOCKED
  - NOT_APPLICABLE
  - ERROR
allowed_tools:
  - trade_data_search
  - public_web_research
  - contact_enrichment
  - evidence_read
  - internal_state_write
timeout: 120
enabled: true
```

A6：

```yaml
capability_id: qianpulse.a6.opportunity_progression
version: 1.0.0
description: Understand buyer feedback, determine opportunity stage, detect changed fields, resolve the current key blocker, and recommend the next commercial action.
required_inputs:
  - opportunity_context
  - buyer_message_or_system_event
produced_outputs:
  - reply_understanding
  - stage_transition
  - changed_business_fields
  - key_question
  - next_action
  - reply_draft
status_contract:
  - DONE
  - MORE_EVIDENCE
  - BLOCKED
  - NOT_APPLICABLE
  - ERROR
allowed_tools:
  - evidence_read
  - seller_knowledge_read
  - conversation_read
  - internal_state_write
timeout: 60
enabled: true
```

---

# 5. Result Envelope

A2 / A6 都通过统一 Envelope 返回：

```json
{
  "capability_id": "qianpulse.a6.opportunity_progression",
  "capability_version": "1.0.0",
  "run_status": "DONE",
  "changed_fields": [],
  "missing_evidence": [],
  "evidence_refs": [],
  "human_review_required": true,
  "domain_result": {},
  "error": null
}
```

状态：

```text
DONE
MORE_EVIDENCE
BLOCKED
NOT_APPLICABLE
ERROR
```

Agent 只使用 Envelope 做调度，`domain_result` 保留完整业务结果。

---

# 6. A2 工程流程

## 6.1 Entry

触发事件：

```text
SELLER_QUERY
SELLER_UPDATE
SYSTEM_REFRESH
SYSTEM_NEW_SIGNAL
```

最小输入：

```json
{
  "opportunity_id": "opp_xxx",
  "seller_id": "seller_xxx",
  "product_id": "product_xxx",
  "target": {
    "countries": ["US"],
    "product_keywords": ["matcha powder"],
    "hs_codes": []
  },
  "buyer_profile": {
    "company_types": ["importer", "distributor"],
    "buyer_roles": ["procurement", "sourcing", "purchasing"]
  }
}
```

## 6.2 Target Parser

输出：

```json
{
  "countries": ["US"],
  "normalized_products": ["matcha", "green tea powder"],
  "candidate_hs_codes": [],
  "buyer_company_types": ["importer", "ingredient distributor"],
  "decision_maker_roles": ["procurement", "sourcing", "purchasing"]
}
```

验证：

```text
country >= 1
normalized_products >= 1
buyer_company_types >= 1
```

不满足：

```text
MORE_EVIDENCE
```

## 6.3 Buyer Discovery Adapter

统一接口：

```python
class TradeDataAdapter:
    def search_buyers(
        self,
        countries: list[str],
        product_keywords: list[str],
        hs_codes: list[str],
        limit: int,
    ) -> list[BuyerCandidate]:
        ...
```

标准 BuyerCandidate：

```json
{
  "external_id": "...",
  "company_name": "...",
  "country": "US",
  "website": "https://...",
  "trade_products": [],
  "hs_codes": [],
  "supplier_countries": [],
  "shipment_evidence": [],
  "source": "trademo",
  "source_url": "...",
  "retrieved_at": "..."
}
```

要求：

```text
Adapter 不输出最终 Buyer Fit 结论。
Adapter 只输出原始数据与来源。
```

## 6.4 Public Web Research

只对进入候选池的公司执行。

读取：

```text
Homepage
Product / Category pages
About
Distribution / Import / Wholesale information
Relevant recent public pages
```

输出 Evidence Record：

```json
{
  "evidence_id": "ev_xxx",
  "entity_type": "buyer_company",
  "entity_id": "buyer_xxx",
  "source_type": "public_web",
  "url": "https://...",
  "title": "...",
  "excerpt": "...",
  "published_at": null,
  "retrieved_at": "...",
  "confidence": 0.91
}
```

## 6.5 Buyer Fit Skill

输入：

```text
Trade Evidence
+
Public Web Evidence
+
Seller Product Context
+
Target Definition
```

输出：

```json
{
  "buyer_company_id": "buyer_xxx",
  "buyer_type": "ingredient_distributor",
  "product_relevance": "HIGH",
  "trade_relevance": "MEDIUM",
  "likely_use_case": "B2B ingredient distribution",
  "why_fit": "...",
  "why_now": "...",
  "evidence_refs": ["ev_1", "ev_2"],
  "confidence": 0.87
}
```

硬规则：

```text
why_fit 必须有 evidence_refs
why_now 没有新鲜证据时允许为空
不得根据公司名称猜采购需求
不得把产品相关性推断成已确认采购计划
```

## 6.6 Apollo Enrichment

仅对 Buyer Fit Gate 通过的企业调用。

统一接口：

```python
class ContactEnrichmentAdapter:
    def search_contacts(
        self,
        company_domain: str,
        role_keywords: list[str],
        country: str | None = None,
        limit: int = 5,
    ) -> list[ContactCandidate]:
        ...
```

标准输出：

```json
{
  "contact_id": "contact_xxx",
  "full_name": "...",
  "title": "Procurement Manager",
  "seniority": "manager",
  "company_domain": "...",
  "business_email": "...",
  "email_status": "verified",
  "profile_url": "...",
  "source": "apollo"
}
```

## 6.7 Outreach Readiness Engine

建议一期用确定性 Gate + SKILL 解释。

示例：

```python
if a5_status == "BLOCKED":
    status = "BLOCKED"
elif not buyer_fit_evidence:
    status = "MORE_EVIDENCE"
elif not decision_maker:
    status = "MORE_EVIDENCE"
elif contact.email_status not in {"verified", "high_confidence"}:
    status = "MORE_EVIDENCE"
else:
    status = "READY"
```

SKILL 负责生成 reason。

## 6.8 Outreach Draft

Draft 结构：

```json
{
  "draft_id": "draft_xxx",
  "opportunity_id": "opp_xxx",
  "contact_id": "contact_xxx",
  "channel": "email",
  "subject": "...",
  "body": "...",
  "objective": "start_business_conversation",
  "claims": [],
  "evidence_refs": [],
  "risk_level": "LOW",
  "status": "WAITING_APPROVAL"
}
```

## 6.9 Email Send

统一接口：

```python
class EmailTransportAdapter:
    def send_message(
        self,
        thread_id: str,
        to_email: str,
        subject: str,
        body: str,
        idempotency_key: str,
    ) -> SendResult:
        ...
```

禁止 Capability 直接调用 Smartlead / Instantly SDK。

## 6.10 Pre-reply Follow-up

FollowUpState：

```json
{
  "opportunity_id": "opp_xxx",
  "contact_id": "contact_xxx",
  "status": "WAITING_EXTERNAL",
  "outreach_count": 1,
  "last_sent_at": "...",
  "next_eligible_at": "...",
  "stop_reason": null
}
```

确定性限制：

```text
Hard Bounce → STOP
Unsubscribe → STOP
Buyer Reply → HANDOFF_A6
Max Outreach Reached → STOP
```

其余由 A2 判断：

```text
WAIT
FOLLOW_UP
REFRESH_RESEARCH
STOP
```

---

# 7. A6 工程流程

## 7.1 Trigger Event

支持：

```text
BUYER_MESSAGE
FOLLOWUP_DUE
QUOTE_UPDATED
SAMPLE_UPDATED
SELLER_UPDATE
APPROVAL_RESULT
SYSTEM_NEW_SIGNAL
```

每个外部事件先进入 AgentEvent。

## 7.2 Buyer Message Ingestion

Webhook / API 入站消息统一转：

```json
{
  "event_id": "evt_xxx",
  "event_type": "BUYER_MESSAGE",
  "actor_role": "BUYER",
  "opportunity_id": "opp_xxx",
  "thread_id": "thread_xxx",
  "payload": {
    "content": "Can you send samples and quote 20 tons to Dubai?",
    "channel": "email"
  },
  "source": "smartlead",
  "timestamp": "...",
  "idempotency_key": "smartlead:message:xxx"
}
```

## 7.3 Opportunity Resolution

优先级：

```text
1. opportunity_id
2. thread_id → opportunity_id
3. source_message_id / external thread mapping
4. account + participant mapping
5. 无法稳定判断 → NEEDS_CONTEXT
```

禁止靠 LLM 猜商机。

## 7.4 Reply Understanding

输出 schema：

```json
{
  "intent": "SAMPLE_REQUEST",
  "secondary_intents": ["PRICE_REQUEST", "DELIVERY_REQUEST"],
  "buyer_role": null,
  "questions": [],
  "requests": [
    "sample",
    "quote"
  ],
  "constraints": [
    {"field": "quantity", "value": 20, "unit": "ton"},
    {"field": "destination", "value": "Dubai"}
  ],
  "objections": [],
  "changed_business_fields": ["quantity", "destination"],
  "evidence_refs": ["msg_xxx"],
  "confidence": 0.94
}
```

## 7.5 Intent Validation

Intent 必须来自固定枚举。

未知：

```text
UNKNOWN
```

低置信度：

```text
MORE_EVIDENCE / HUMAN REVIEW
```

不允许新增自由标签。

## 7.6 Stage Transition Engine

状态机：

```text
CONTACTED
  ↓ buyer reply
REPLIED
  ↓ qualification
QUALIFYING
  ├─ missing info → NEEDS_INFORMATION
  ├─ product fit → SOLUTION_FIT
  └─ not now → NURTURE

SOLUTION_FIT
  ↓ quote / sample
QUOTE_OR_SAMPLE
  ↓ commercial terms
COMMERCIAL_DISCUSSION
  ├─ won → WON
  ├─ lost → LOST
  └─ delay → NURTURE
```

Stage 变化必须保存：

```json
{
  "from": "SOLUTION_FIT",
  "to": "QUOTE_OR_SAMPLE",
  "reason": "Buyer explicitly requested samples and quotation.",
  "evidence_refs": ["msg_xxx"]
}
```

## 7.7 Changed Fields → Routing Policy

示例：

```yaml
quantity:
  invalidate:
    - qianpulse.a4.supply_match
    - qianpulse.a5.risk_match

destination:
  invalidate:
    - qianpulse.a4.supply_match
    - qianpulse.a5.risk_match

requested_delivery_date:
  invalidate:
    - qianpulse.a3.purchase_timing
    - qianpulse.a4.supply_match

payment_terms:
  invalidate:
    - qianpulse.a5.risk_match
```

A6 不硬编码上述关系；Routing Policy 单独维护。

## 7.8 Key Question Resolver

输出：

```json
{
  "key_question": "Can the matched supplier support a 20-ton order and sample shipment to Dubai?",
  "blocking_type": "SUPPLY_AND_SAMPLE_FEASIBILITY",
  "required_capabilities": [
    "qianpulse.a4.supply_match",
    "qianpulse.a5.risk_match"
  ]
}
```

## 7.9 Next Best Action

输出固定枚举：

```json
{
  "action": "CREATE_SAMPLE_TASK",
  "reason": "Buyer explicitly requested samples and quantity/destination are now known.",
  "expected_progress": "Move opportunity from product fit to sample validation.",
  "prerequisites": [
    "A4 supplier match valid",
    "A5 no blocking risk",
    "sample policy available"
  ],
  "evidence_refs": ["msg_xxx"]
}
```

## 7.10 Execution Risk Engine

建议确定性规则优先。

```python
HIGH_RISK_ACTIONS = {
    "SEND_FORMAL_QUOTE",
    "AGREE_PAYMENT_TERMS",
    "AGREE_EXCLUSIVITY",
    "AGREE_CONTRACT",
    "COMPENSATION",
}

MEDIUM_RISK_ACTIONS = {
    "CREATE_SAMPLE_TASK",
    "DISCUSS_MOQ",
    "SEND_FORMAL_MATERIAL",
}
```

结果：

```text
AUTO
APPROVAL
HUMAN
```

首版可以将对外 AUTO 统一降级成 APPROVAL。

## 7.11 Reply Draft

必须先有 Next Best Action，再生成 Draft。

禁止流程：

```text
Buyer Message
→ 直接让 LLM 写回复
```

正确流程：

```text
Buyer Message
→ Reply Understanding
→ Stage
→ Changed Fields
→ Refresh affected capability
→ Key Question
→ Next Best Action
→ Risk Gate
→ Draft
```

## 7.12 Wait / Resume

Run 进入：

```text
WAITING_EXTERNAL
WAITING_APPROVAL
WAITING_EVIDENCE
```

新 Event 到达：

```text
Load last successful checkpoint
↓
Detect changed fields
↓
Invalidate affected results
↓
Run required capabilities
↓
Continue
```

禁止从头跑全链。

---

# 8. 数据模型

## 8.1 buyer_companies

```sql
id
name
country
website
domain
company_type
industry
source
source_external_id
created_at
updated_at
```

## 8.2 buyer_company_evidence

```sql
id
buyer_company_id
source_type
source_url
source_record_id
excerpt
published_at
retrieved_at
confidence
hash
```

## 8.3 contacts

```sql
id
buyer_company_id
full_name
title
seniority
business_email
email_status
profile_url
source
source_external_id
created_at
updated_at
```

## 8.4 opportunity_stages

```sql
id
opportunity_id
stage
reason
evidence_refs_json
created_at
```

## 8.5 outreach_drafts

```sql
id
opportunity_id
contact_id
channel
subject
body
objective
risk_level
status
claims_json
evidence_refs_json
created_at
updated_at
```

## 8.6 followup_states

```sql
id
opportunity_id
contact_id
status
outreach_count
last_sent_at
next_eligible_at
stop_reason
updated_at
```

## 8.7 opportunity_actions

```sql
id
opportunity_id
action_type
reason
expected_progress
prerequisites_json
risk_level
status
evidence_refs_json
created_at
```

## 8.8 outcomes

```sql
id
opportunity_id
outcome_type
reason
amount_optional
occurred_at
evidence_refs_json
```

---

# 9. API 设计

## 9.1 创建主动拓展 Run

```http
POST /api/v1/opportunities/{opportunity_id}/a2/run
```

Request：

```json
{
  "target": {
    "countries": ["US"],
    "product_keywords": ["matcha powder"]
  },
  "buyer_profile": {
    "company_types": ["importer", "distributor"]
  }
}
```

## 9.2 查看 A2 结果

```http
GET /api/v1/opportunities/{opportunity_id}/a2
```

## 9.3 创建 / 批准 Outreach Draft

```http
POST /api/v1/opportunities/{opportunity_id}/outreach/drafts
POST /api/v1/approvals/{approval_id}
```

## 9.4 Email Webhook

```http
POST /api/v1/webhooks/email/{provider}
```

统一转 AgentEvent。

## 9.5 读取 A6 当前推进结果

```http
GET /api/v1/opportunities/{opportunity_id}/progression
```

返回：

```json
{
  "stage": "QUOTE_OR_SAMPLE",
  "reply_intent": "SAMPLE_REQUEST",
  "key_question": "...",
  "next_action": "CREATE_SAMPLE_TASK",
  "execution_mode": "APPROVAL",
  "pending_approval_id": "approval_xxx"
}
```

---

# 10. Provider Adapter 边界

## Trade Data Provider

```text
Trademo
ImportYeti
```

禁止把 provider 特有字段直接扩散进业务模型。

统一映射为：

```text
BuyerCandidate
ShipmentEvidence
TradeProduct
```

## Contact Provider

```text
Apollo
```

统一映射为：

```text
ContactCandidate
```

## Email Provider

```text
Smartlead
Instantly
```

统一接口：

```text
send_message
reply_to_thread
get_thread
stop_contact
register_webhook
normalize_event
```

---

# 11. Human Gate

首版所有外部发送都建议审批。

Approval 数据：

```json
{
  "approval_id": "approval_xxx",
  "opportunity_id": "opp_xxx",
  "action_type": "SEND_EMAIL",
  "risk_level": "LOW",
  "draft_id": "draft_xxx",
  "status": "PENDING",
  "created_at": "..."
}
```

决策：

```text
APPROVE
EDIT_AND_APPROVE
REJECT
```

高风险动作不允许一键自动降级。

---

# 12. Idempotency

以下操作必须带 idempotency_key：

```text
外发邮件
回复邮件
创建 Approval
创建 Quote Task
创建 Sample Task
更新 Stage
写 Outcome
```

推荐格式：

```text
{provider}:{event_type}:{external_event_id}
```

示例：

```text
smartlead:reply_received:msg_12345
```

重复 Webhook：

```text
第一次：处理
第二次：返回已处理结果，不产生第二次副作用
```

---

# 13. Retry / Timeout

第三方接口：

```text
429 → exponential backoff
5xx → retry 3 次
timeout → retry 2 次
4xx business error → 不自动重复
```

Adapter 返回统一错误：

```json
{
  "code": "PROVIDER_RATE_LIMIT",
  "retryable": true,
  "provider": "apollo",
  "message": "..."
}
```

Capability 不直接解释 provider 错误字符串。

---

# 14. Cache

适合缓存：

```text
Company Public Profile
Apollo Contact Search
Trade Search Result
Stable Evidence
Capability Metadata
```

每项缓存必须有：

```text
version
timestamp
invalidation_rule
```

禁止缓存：

```text
未完成审批的最终动作状态
刚收到的 Buyer Message 解析结果跨版本长期复用
```

---

# 15. Observability / Trace

每个 Run 必须可回放：

```text
Event
↓
Opportunity Resolution
↓
Context Load
↓
Capability Routing
↓
Provider Calls
↓
Evidence
↓
Domain Result
↓
State Change
↓
Human Gate
↓
External Action
↓
Response
```

每个 Provider Call 保存：

```text
provider
operation
request_hash
response_hash
status
latency_ms
retry_count
error_code
```

---

# 16. 安全与数据边界

1. Buyer 端不得看到 Seller Internal Context。
2. Seller 不得看到平台 Debug Trace。
3. 外部渠道不得调用 Internal-only Tool。
4. 联系方式仅用于明确业务目标，不得脱离 Opportunity 批量扩散。
5. Unsubscribe 立即加入 Suppression List。
6. Hard Bounce 停止继续外发。
7. 所有正式价格、条款、独家、合同类动作进入 Human Gate。
8. A5 返回 BLOCKED 时，A6 不得继续对外推进。

---

# 17. Eval 设计

## A2 Golden Cases

### Case A2-01｜正常开发

输入：

```text
贵州抹茶 → 美国食品原料进口商
```

验收：

```text
找到 Buyer Company
有真实 Evidence
通过 Buyer Fit
找到 Decision Maker
生成 Evidence-grounded Draft
进入 Approval
```

### Case A2-02｜无 Buyer Evidence

验收：

```text
MORE_EVIDENCE
不得生成“对方有采购需求”结论
```

### Case A2-03｜无联系人

验收：

```text
Company 可保留
Contact = missing
Outreach = MORE_EVIDENCE
```

### Case A2-04｜退订

验收：

```text
STOP
Suppression List 更新
不得继续 Follow-up
```

## A6 Golden Cases

### Case A6-01｜样品请求

Buyer：

```text
Can you send samples?
```

验收：

```text
intent = SAMPLE_REQUEST
next_action = CREATE_SAMPLE_TASK
execution_mode >= APPROVAL
```

### Case A6-02｜价格请求

Buyer：

```text
What is your best price?
```

验收：

```text
intent = PRICE_REQUEST
不得虚构价格
进入 APPROVAL / HUMAN
```

### Case A6-03｜数量变化

Buyer：

```text
We need 20 tons, not 5 tons.
```

验收：

```text
changed_fields contains quantity
只使受影响 Capability 失效
不重跑无关能力
```

### Case A6-04｜Unknown

验收：

```text
UNKNOWN
低置信度时不得继续猜
MORE_EVIDENCE / HUMAN REVIEW
```

### Case A6-05｜重复 Webhook

验收：

```text
只产生一次状态变化
只发送一次外部消息
```

---

# 18. 测试层级

```text
Schema Validation
↓
Unit Test
↓
Provider Contract Test
↓
Capability Integration Test
↓
Sandbox Dry Run
↓
Golden Eval
↓
End-to-End Demo
```

重点覆盖：

```text
正常路径
模糊输入
证据缺失
Provider 失败
权限不足
重复 Event
中途暂停
人工拒绝
A5 BLOCKED
Unsubscribe
Hard Bounce
Stage 回退
新旧结果失效
```

---

# 19. 开发优先级

## P0-1｜A2 Discovery + Research

```text
Trade Adapter
Public Web Evidence
Buyer Company Model
Buyer Fit SKILL
```

## P0-2｜Contact + Outreach

```text
Apollo Adapter
Contact Model
Outreach Draft
Approval
```

## P0-3｜Email Loop

```text
Email Adapter
Send
Webhook
Thread Mapping
Idempotency
```

## P0-4｜A6 Core

```text
Reply Understanding
Intent Taxonomy
Stage Machine
Changed Fields
Next Best Action
Risk Gate
```

## P0-5｜Incremental Refresh

```text
Routing Policy
A3 / A4 / A5 Invalidation
Checkpoint
Resume
```

## P0-6｜Outcome

```text
WON
LOST
NURTURE
STOPPED
Outcome Event
```

---

# 20. 一期 Demo 最小场景

建议现场 Demo 固定一个真实贸易产品场景，例如：

```text
贵州抹茶
→ 美国食品原料进口商
```

Demo 过程：

```text
1. Seller 输入目标市场
2. A2 返回 Buyer Company
3. 展示贸易证据 / 官网证据
4. Apollo 找 Decision Maker
5. 生成 Outreach Draft
6. 人工批准
7. 模拟 / 真实发送 Email
8. Buyer Reply：要求样品 + 20 吨 + Dubai
9. A6 识别 Sample / Price / Destination / Quantity
10. Quantity / Destination 触发 A4 / A5 增量重算
11. A6 给出 Next Best Action
12. 进入 Sample Task / Approval
13. 展示 Trace：这一轮发生了哪些变化、调用了哪些能力
```

这个 Demo 可以完整证明：

```text
主动开发
+
真实证据
+
持续商机
+
增量判断
+
自动推进
+
人工可控
```

---

# 21. Definition of Done

A2 完成：

```text
真实目标 → Buyer Company → Evidence → Contact → Draft → Approval → Send → Wait / Follow-up / Handoff A6
```

A6 完成：

```text
Buyer Event → Reply Understanding → Stage → Changed Fields → Incremental Refresh → Key Question → Next Action → Human Gate → Wait / Resume / Outcome
```

工程完成：

```text
Provider 可替换
Run 可恢复
Event 幂等
结论可追证据
状态可回放
外发可审批
A2 / A6 与 Agent Control Plane 解耦
```
