---
name: qianpulse-a6-opportunity-progression
description: Use this skill when a QianPulse opportunity has entered active buyer conversation or a progression event occurs. Interpret the latest buyer message, maintain a domain-stage view, detect changed business fields, identify the current key blocking question, choose a controlled next-best action, request A3/A4/A5 refresh through the control plane when relevant inputs changed, generate an evidence-grounded reply draft, and route execution through AUTO, APPROVAL, or HUMAN takeover. Keep professional timing, supply-match, and risk judgments in their own skills.
compatibility: QianPulse Agent Control Plane, Opportunity, ConversationEvent, Capability Registry, Result Envelope, Approval, Checkpoint, Trace, A3/A4/A5 capabilities.
---

# A6｜成交自动推进

## 1. 使用条件

当 Opportunity 已经进入买家对话，或出现会影响成交推进的事件时使用本 SKILL。

典型事件：

```text
BUYER_MESSAGE
FOLLOWUP_DUE
QUOTE_UPDATED
SAMPLE_UPDATED
SELLER_UPDATE
APPROVAL_RESULT
SYSTEM_NEW_SIGNAL
```

A6 负责回答：

> 这笔商机现在处于什么状态，最新反馈改变了什么，当前最关键的问题是什么，下一步应该做什么，应该自动、审批还是人工接管。

## 2. 业务边界

A6 管理 Opportunity Progression。

A6 不拥有：

```text
采购时机专业判断 → A3
贵州供需匹配专业判断 → A4
跨境交易风控专业判断 → A5
```

当买家消息改变了上述能力的关键输入时，A6 只输出 changed fields；由 QianPulse Agent Routing Policy 使相关结果失效并调度对应能力重跑。

## 3. 核心流程

```text
Event
→ Resolve Opportunity Context
→ Reply / Event Understanding
→ Detect Changed Business Fields
→ Refresh A3/A4/A5 when required
→ Resolve Domain Stage
→ Resolve Key Question
→ Select Next Best Action
→ Risk / Human Gate
→ Generate Draft / Task / Wait
→ Execute or Wait Approval
→ Persist State
→ WAIT / RESUME
→ Outcome Event
```

## 4. 输入契约

```yaml
a6_input:
  opportunity_id: string
  trigger_event:
    event_id: string
    event_type: string
    timestamp: timestamp
  latest_buyer_message: optional
  conversation_context: {}
  opportunity_state: {}
  seller_context: {}
  a3_result: optional
  a4_result: optional
  a5_result: optional
  pending_approval: optional
```

若无法可靠绑定 Opportunity，返回 `BLOCKED` / `NEEDS_CONTEXT`，不得猜测。

## 5. Domain Stage

A6 使用独立业务阶段：

```text
CONTACTED
REPLIED
QUALIFYING
NEEDS_INFORMATION
SOLUTION_FIT
QUOTE_OR_SAMPLE
COMMERCIAL_DISCUSSION
NURTURE
WON
LOST
STOPPED
```

该阶段与 Agent Run State、Conversation State 分离。

### 阶段使用原则

- Stage 是业务视图，不等同 CRM Pipeline。
- Stage 需要由可观察事件支撑。
- 一条消息可以不改变 Stage。
- Stage 变化必须可解释、可回放。

## 6. 标准步骤

### S1｜Reply Understanding

对 BUYER_MESSAGE 生成：

```yaml
reply_understanding:
  intent: string
  sentiment: positive|neutral|negative|unknown
  buyer_role: optional
  current_stage: string
  questions: []
  requests: []
  objections: []
  constraints: []
  changed_business_fields: []
  evidence_refs: []
  confidence: low|medium|high
```

Intent 使用固定 taxonomy，禁止每次自由创造标签。

详见 `references/reply-intent-taxonomy.md`。

### S2｜Changed Fields Detection

识别最新事件是否改变业务字段，例如：

```text
quantity
destination
specification
certification
moq
price_request
delivery_date
payment_terms
buyer_role
buyer_company
sample_request
```

A6 输出：

```yaml
changed_fields:
  - field: quantity
    before: 5000
    after: 20000
    evidence_ref: ev_xxx
```

随后由 Agent Routing Policy 处理：

```text
Changed Fields
→ Invalidate Affected Results
→ Run Required Capabilities
→ Keep Unaffected Results
```

A6 不直接执行 A3/A4/A5 的专业计算。

### S3｜Key Question Resolver

每轮识别当前最大阻塞点：

```yaml
key_question:
  question_id: string
  category: string
  description: string
  why_blocking: string
  required_information: []
  evidence_refs: []
```

原则：

- 优先解决一个最关键阻塞点。
- 避免一次向买家提出过多问题。
- 若阻塞来自卖家侧资料缺失，优先向卖家请求补充。

### S4｜Next Best Action

动作只能来自固定 Action Taxonomy：

```text
ANSWER_WITH_EVIDENCE
ASK_KEY_QUESTION
SEND_MATERIAL
REQUEST_MORE_EVIDENCE
CREATE_QUOTE_TASK
CREATE_SAMPLE_TASK
SCHEDULE_FOLLOWUP
ENTER_NURTURE
REQUEST_REFERRAL
REQUEST_APPROVAL
HUMAN_TAKEOVER
STOP_CONTACT
MARK_WON
MARK_LOST
WAIT
```

输出：

```yaml
next_action:
  action: string
  reason: string
  expected_progress: string
  prerequisites: []
  evidence_refs: []
```

### S5｜Execution Gate

三层模式：

```text
AUTO
APPROVAL
HUMAN
```

#### LOW RISK

候选动作：

```text
回答已有、已验证产品事实
发送公开资料
确认收到
询问一个澄清问题
普通 follow-up
长期维护
```

一期默认仍可要求 Draft + Human Approval。

#### MEDIUM RISK

```text
高价值对象的首次关键推进
涉及 MOQ
样品安排
轻度价格沟通
正式产品资料
AI 置信度不足
```

必须 `APPROVAL`。

#### HIGH RISK

```text
正式报价
支付条件
合同
独家代理
渠道分成
大额订单
赔偿
投诉
政府机构
重大客户
```

必须 `HUMAN_TAKEOVER`。

A5 明确 BLOCKED 时强制停止对外推进。

### S6｜Draft Generation

输入：

```text
Buyer latest message
Conversation history
Seller knowledge
A3 result
A4 result
A5 result
Current stage
Next Best Action
```

输出：

```yaml
reply_draft:
  objective: string
  content: string
  language: string
  claims_used: []
  evidence_refs: []
  prohibited_claims_checked: boolean
```

禁止：

- 未授权价格。
- 未确认交期。
- 未证实认证。
- 未批准合同或独家条件。
- A5 BLOCKED 时生成继续成交导向的外发话术。

### S7｜Execution

外部 Email transport 通过 Adapter 执行。

一期标准链路：

```text
A6 result
→ Draft
→ Human Gate
→ Email Adapter
→ External Message
→ ConversationEvent
→ WAITING_EXTERNAL
```

A6 只定义业务动作，发送实现属于 transport。

### S8｜Wait / Resume

发送后进入等待。

恢复事件：

```text
BUYER_MESSAGE
FOLLOWUP_DUE
SAMPLE_UPDATED
QUOTE_UPDATED
SELLER_UPDATE
EVIDENCE_ADDED
APPROVAL_RESULT
MANUAL_RESUME
```

必须从最近成功 Checkpoint 增量继续。

禁止因为新消息从头全量重跑所有 SKILL。

### S9｜Outcome

成交或丢单形成 Outcome Event：

```yaml
outcome_event:
  opportunity_id: string
  outcome: WON|LOST|STOPPED|NURTURE
  reason: string
  evidence_refs: []
  timestamp: timestamp
```

Outcome 供自进化与后续评估消费；A6 不在生产运行中直接修改模型权重。

## 7. Stop Conditions

```text
UNSUBSCRIBE
→ STOP_CONTACT

NOT_INTERESTED + clear
→ MARK_LOST / ENTER_NURTURE

COMPLAINT
→ HUMAN_TAKEOVER

A5 BLOCKED
→ BLOCKED

PRICE / CONTRACT / PAYMENT / EXCLUSIVE
→ HUMAN_TAKEOVER

UNKNOWN + low confidence
→ REQUEST_APPROVAL / REQUEST_MORE_EVIDENCE

missing seller information
→ MORE_EVIDENCE

buyer reply needed
→ WAIT

WON
→ OUTCOME_EVENT

LOST
→ OUTCOME_EVENT
```

## 8. 输出契约

```yaml
a6_result:
  opportunity_id: string

  buyer_reply:
    intent: string
    questions: []
    objections: []

  stage:
    before: string
    after: string

  changed_business_fields: []

  key_question: {}

  next_action:
    action: string
    reason: string
    prerequisites: []

  execution_mode: AUTO|APPROVAL|HUMAN

  reply_draft: optional

  followup:
    next_eligible_at: optional

  outcome: optional

  evidence_refs: []
  human_review_required: boolean
```

外层统一返回 `CapabilityResultEnvelope`。

## 9. 允许工具 / 服务

```text
opportunity_store.read
opportunity_store.write
conversation_store.read
conversation_store.append
evidence_store.read
seller_knowledge.read
capability_result.read
approval.create
email_transport.reply
followup_engine.calculate
outcome_store.append
```

A6 不直接调用底层 A3/A4/A5 tool；通过 Agent Capability Routing 调度。

## 10. 禁止动作

- 自行做 A3/A4/A5 专业判断。
- 为推进流程补造缺失事实。
- 把 Buyer 推断意图写成已确认需求。
- 绕过 Human Gate。
- 重复外发同一副作用。
- 收到新消息后全量重跑所有能力。
- 将 Conversation State 当成完整成交阶段。
- 自动谈判合同、独家、支付与正式报价。

## 11. 证据要求

以下字段必须可回溯：

```text
reply intent
changed field
stage change
key question
next action
claim in reply draft
human takeover reason
outcome reason
```

每个关键决策至少带：

```yaml
decision_evidence:
  evidence_refs: []
  source_event_id: string
  capability_versions: []
```

## 12. 失败处理

```text
Opportunity 无法绑定
→ NEEDS_CONTEXT / BLOCKED

消息解析低置信度
→ REQUEST_APPROVAL

依赖能力 MORE_EVIDENCE
→ WAITING_EVIDENCE

依赖能力 BLOCKED
→ BLOCKED

邮件 transport 失败
→ ERROR，不写 SENT

重复 Webhook
→ Idempotency 丢弃

Approval 拒绝
→ 保留原决策，等待人工修改或新事件
```

## 13. 验证方法

上线前至少覆盖：

- 普通兴趣回复。
- 买家要求资料。
- 买家询价。
- 买家要求寄样。
- 数量变化触发 A4 重算。
- 目的地变化触发 A5 重算。
- 普通致谢不导致全量重跑。
- 价格 / 合同触发 Human Takeover。
- A5 BLOCKED 后禁止推进。
- Buyer 表示 wrong person 后请求转介绍。
- Unsubscribe 立即停止。
- 重复 Webhook 不重复回复。
- WAITING_EXTERNAL 后可在第二天恢复。

## 14. 完成标准

A6 一期必须跑通：

```text
Buyer Reply
→ Event
→ Opportunity
→ Reply Intent
→ Changed Fields
→ Incremental Capability Refresh
→ Stage
→ Key Question
→ Next Best Action
→ Human Gate
→ Reply
→ WAITING_EXTERNAL
→ Resume
→ Outcome
```

并且全链可 Trace、可暂停、可恢复、可重放。