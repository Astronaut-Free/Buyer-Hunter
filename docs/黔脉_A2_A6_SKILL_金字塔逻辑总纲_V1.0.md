# 黔脉 QianPulse｜A2 / A6 SKILL 金字塔逻辑总纲 V1.0

> 文档类型：业务总纲 / SKILL 总设计
> 
> 适用模块：A2｜主动商机拓展、A6｜成交自动推进
> 
> 目标：明确业务边界、行业参考、SKILL 结构、一期 MVP 与后续演进方向，作为产品、设计、工程统一母文档。

---

# L0｜系统级总目标

黔脉是一套围绕全球采购商机持续运行的业务系统。

主链：

```text
全球需求捕捉 / 主动商机拓展
↓
采购时机判断
↓
贵州供需匹配
↓
智能匹配风控
↓
成交自动推进
↓
结果回流与持续进化
```

A2 与 A6 分别解决两端最核心的业务问题：

```text
A2：我想进入这个市场，客户怎么自动开发？
A6：这笔商机接下来怎么自动推进？
```

一期坚持四个原则：

1. 复用成熟产品和成熟数据服务，减少自建基础设施。
2. SKILL 只承载专业业务判断，Agent 负责调度、状态、审批、恢复和审计。
3. Email 作为一期唯一自动执行外联渠道。
4. 先跑通完整闭环，再扩展 LinkedIn、WhatsApp 等渠道。

---

# L1｜A2 / A6 业务分工

## A2｜主动商机拓展

业务使命：

> 给定贵州企业的产品、目标市场和目标买家画像，持续找到“可能会买”的海外企业，形成有证据的潜在采购商机，并完成 Email-first 的主动开发。

核心链：

```text
目标市场
×
客户画像
×
自动找客
×
自动研究
×
自动触达
×
未回复动态跟进
```

A2 的结束边界：

```text
买家产生有效回复
→ A2 结束当前开发阶段
→ Opportunity 交给 A6
```

## A6｜成交自动推进

业务使命：

> 围绕一笔已经进入沟通的 Opportunity，根据买家最新反馈、当前客户阶段和未解决问题，持续决定最合适的下一步商业动作。

核心链：

```text
客户阶段
×
回复意向
×
关键问题
×
报价 / 寄样
×
自动跟进
×
人工接管
```

A6 不重新计算采购时机、贵州供需匹配、跨境风控。

当买家反馈改变关键业务字段时：

```text
A6 识别 Changed Fields
↓
QianPulse Agent 根据 Routing Policy
↓
仅重跑受影响的 A3 / A4 / A5
↓
A6 使用最新结果决定下一步
```

---

# L2｜A2 SKILL 结构

SKILL ID：

```text
qianpulse-a2-proactive-buyer-development
```

## A2-S1｜Target Market Parse

将卖家的自然语言目标转为结构化目标。

最小字段：

```yaml
target:
  countries: []
  product_keywords: []
  hs_codes: []
  industries: []

buyer_profile:
  company_types: []
  company_size: optional
  buyer_roles: []
```

若关键条件不足以稳定搜索：

```text
MORE_EVIDENCE
```

## A2-S2｜Buyer Company Discovery

优先发现“企业”，随后再找联系人。

一期数据源：

```text
A. 贸易行为数据
   - Trademo
   - ImportYeti（Demo / 美国市场验证）

B. 公开企业网页
   - 企业官网
   - 产品目录
   - Importer / Distributor Directory
   - 展会参展商页面
   - 商协会公开目录
```

一期暂缓：

```text
TikTok 抓取
Facebook 抓取
Instagram 抓取
X 抓取
LinkedIn 抓取
Reddit 全量爬取
```

## A2-S3｜Buyer Fit Research

每个候选企业至少回答：

```yaml
buyer_fit:
  company:
  country:
  sells_or_uses_product:
  relevant_product_categories: []
  import_evidence: []
  market_evidence: []
  buyer_type:
  likely_use_case:
  why_fit:
  why_now:
  evidence_refs: []
  confidence:
```

核心业务结论：

```text
为什么它可能会买？
为什么值得现在联系？
```

无有效证据：

```text
MORE_EVIDENCE
```

证据冲突：

```text
NEEDS_REVIEW
```

## A2-S4｜Decision Maker Enrichment

公司通过 Buyer Fit Gate 后，再找联系人。

默认使用成熟联系人服务：

```text
Apollo
```

优先角色：

```text
Procurement Director
Purchasing Manager
Sourcing Manager
Import Manager
Category Manager
Supply Chain Director
Founder / Owner（小企业）
```

联系人必须绑定企业与推荐理由。

## A2-S5｜Outreach Readiness Gate

Gate 由以下因素组成：

```text
Company Fit
×
Product Relevance
×
Trade Evidence
×
Contact Relevance
×
Contact Reachability
×
A5 Block Status
```

一期输出三态：

```text
READY
MORE_EVIDENCE
BLOCKED
```

不把复杂 0–100 分作为首版核心。

## A2-S6｜Personalized Outreach

输入：

```text
Seller Value Proposition
+
Buyer Evidence
+
Contact Role
+
Reasons to Engage
```

输出：

```yaml
outreach:
  subject:
  opening_reason:
  buyer_context:
  relevance:
  value_proposition:
  cta:
  language:
  evidence_refs: []
```

禁止：

```text
虚构对方需求
虚构采购计划
虚构合作记录
虚构客户案例
虚构价格
承诺独家
承诺认证
承诺交期
```

## A2-S7｜Email Execution

一期外发流程：

```text
Draft
↓
Human Approval
↓
Email Adapter
↓
Send
↓
ConversationThread
↓
WAITING_EXTERNAL
```

Email 执行层可以使用：

```text
Smartlead / Instantly Adapter
```

SKILL 不绑定具体服务商。

## A2-S8｜Pre-reply Follow-up

A2 只处理买家尚未产生有效回复的跟进。

输入：

```text
是否已经回复
最近一次发送时间
已发送轮次
Bounce / Unsubscribe
Buyer Fit 是否变化
是否出现新的采购信号
```

输出动作：

```text
WAIT
FOLLOW_UP
REFRESH_RESEARCH
STOP
HANDOFF_A6
```

不把 Day 1 / 3 / 7 / 14 固定 Sequence 作为业务核心。

---

# L2｜A6 SKILL 结构

SKILL ID：

```text
qianpulse-a6-opportunity-progression
```

## A6-S1｜Reply Understanding

每次 BUYER_MESSAGE 先形成结构化理解：

```yaml
reply_understanding:
  intent:
  sentiment:
  buyer_role:
  current_stage:
  questions: []
  requests: []
  objections: []
  constraints: []
  changed_business_fields: []
  evidence_refs: []
  confidence:
```

一期固定 Reply Intent Taxonomy：

```text
INTERESTED
NEED_INFORMATION
PRICE_REQUEST
SAMPLE_REQUEST
MOQ_SPEC_REQUEST
DELIVERY_REQUEST
CERTIFICATION_REQUEST
PAYMENT_TERMS
WRONG_PERSON
REFERRAL
NOT_NOW
NOT_INTERESTED
OUT_OF_OFFICE
UNSUBSCRIBE
COMPLAINT
UNKNOWN
```

## A6-S2｜Opportunity Stage

首版业务阶段：

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

业务 Stage 与 Agent Run State、Conversation State 分离。

## A6-S3｜Changed Fields Detection

识别买家回复是否改变关键业务事实。

示例：

```text
“数量从 5 吨调整为 20 吨，目的地改为 Dubai。”

quantity changed
destination changed
```

只标记变化，不自行重新完成 A3 / A4 / A5 专业分析。

## A6-S4｜Key Question Resolver

每轮只聚焦当前最影响成交推进的关键问题。

原则：

```text
一轮尽量解决一个主要阻塞点
```

避免把多个无关问题塞进同一轮沟通。

## A6-S5｜Next Best Action

固定 Action Taxonomy：

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
  action:
  reason:
  expected_progress:
  prerequisites: []
  evidence_refs: []
```

A6 最核心的产物是“下一步商业动作”。

## A6-S6｜Execution Risk Gate

### LOW RISK

```text
回答已有产品事实
发送公开资料
确认收到
询问一个澄清问题
普通 Follow-up
长期维护
```

首发阶段仍建议 Draft + Human Approval。

### MEDIUM RISK

```text
高价值对象首次推进
涉及 MOQ
样品安排
轻度价格沟通
正式产品资料
上下文置信度不足
```

处理：

```text
APPROVAL
```

### HIGH RISK

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

处理：

```text
HUMAN_TAKEOVER
```

## A6-S7｜Draft Generation

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
  objective:
  content:
  language:
  claims_used: []
  evidence_refs: []
  prohibited_claims_checked: true
```

硬规则：

```text
无授权价格不得承诺
未确认交期不得承诺
无证据认证不得承诺
A5 BLOCKED 时禁止继续外发
```

## A6-S8｜Wait / Resume

发送以后：

```text
WAITING_EXTERNAL
```

以下事件恢复：

```text
Buyer Reply
Follow-up Due
Sample Status Change
Quote Status Change
Seller Update
New Evidence
Approval Result
```

复用 QianPulse Agent：

```text
Checkpoint
Resume
Idempotency
Trace
```

---

# L2｜A2 / A6 交接协议

```text
A2 Buyer Company Discovery
↓
Buyer Fit Research
↓
Decision Maker
↓
Email Outreach
↓
No Reply
├─ A2 Follow-up
└─ Buyer Reply
      ↓
     A6
      ↓
Reply Understanding
↓
Changed Fields
↓
必要时重跑 A3 / A4 / A5
↓
Key Question
↓
Next Best Action
↓
Draft / Task / Wait
↓
Human Gate / Auto
↓
Buyer Reply / Quote / Sample
↓
Outcome Event
```

---

# L3｜行业实现参考

## A2 产品参考

### HubSpot Breeze Prospecting Agent

借鉴：

```text
Target Companies
→ Target Personas
→ Buying Signals
→ Account Research
→ Find Contacts
→ Personalized Outreach
→ Review / Auto Send
```

### Unify Plays

借鉴：

```text
Trigger
→ Audience
→ Prospect
→ AI Qualification
→ Sequence
→ CRM / Action
```

采用其“一次 Play 解决一个明确场景”的收敛思想。

### Trademo

用途：

```text
全球 Buyer / Supplier 贸易行为
HS Code
贸易伙伴
进出口国家
Shipment Evidence
```

### Apollo

用途：

```text
People Search
Decision Maker Search
Contact Enrichment
Verified Business Email
```

## A6 产品参考

### Instantly AI Reply Agent

借鉴：

```text
Incoming Reply
→ AI Understand
→ Draft Reply
→ HITL / Autopilot
→ Follow-up
→ Objection Handling
→ Human Handover
```

### Instantly Subsequences

借鉴事件 / 状态驱动下一流程：

```text
Interested
Meeting Booked
Won
Out of Office
Wrong Person
Not Interested
Lost
```

### Smartlead

适合承担 Email Transport：

```text
Send
Reply Thread
Webhook
Unsubscribe
Lead / Campaign State
```

黔脉掌握业务决策，第三方只承担 transport / data service。

---

# L3｜一期明确不做

```text
LinkedIn 自动抓取 + 自动私信
WhatsApp 自动触达
Facebook / Instagram / TikTok / X 全量接入
Browser Agent 全网自动找人
AI 电话
自动正式报价
自动承诺交期
自动合同谈判
重 CRM
第二套 Workflow Runtime
```

原因：

```text
先验证 Buyer Discovery → Email → Reply → Next Action 闭环。
```

只有这条链真实跑通，第二个渠道的扩展才有商业依据。

---

# L3｜一期技术组合

```text
目标市场 / 产品
      │
      ├─ Trademo / ImportYeti
      └─ Public Web
             │
             ▼
     A2 Buyer Discovery
             │
             ▼
      Buyer Company
             │
             ▼
       Apollo Enrichment
             │
             ▼
       Decision Maker
             │
             ▼
      A2 Buyer Research
             │
             ▼
     Outreach Readiness
             │
             ▼
         Email Draft
             │
        Human Approval
             │
             ▼
      Smartlead / Instantly
             │
             ▼
         Buyer Reply
             │
             ▼
       QianPulse Event
             │
             ▼
           A6
      ┌──────┼──────┐
      │      │      │
     A3     A4     A5
     时机    匹配    风控
      └──────┼──────┘
             ▼
      Next Best Action
             │
      Draft / Task / Wait
             │
      Human Gate / Auto
             │
             ▼
      Reply / Quote / Sample
             │
             ▼
        Outcome Event
```

---

# SKILL 标准目录

```text
skills/
│
├─ qianpulse-a2-proactive-buyer-development/
│  ├─ SKILL.md
│  ├─ references/
│  │  ├─ buyer-source-policy.md
│  │  ├─ buyer-fit-schema.md
│  │  ├─ contact-role-policy.md
│  │  ├─ outreach-policy.md
│  │  └─ followup-policy.md
│  └─ evals/
│     └─ evals.json
│
└─ qianpulse-a6-opportunity-progression/
   ├─ SKILL.md
   ├─ references/
   │  ├─ stage-machine.md
   │  ├─ reply-intent-taxonomy.md
   │  ├─ next-action-policy.md
   │  ├─ human-gate.md
   │  └─ stop-conditions.md
   └─ evals/
      └─ evals.json
```

SKILL 统一包含：

```text
使用条件
输入契约
标准步骤
允许工具
禁止动作
验证方法
输出证据
失败处理
示例与反例
```

---

# 一期 P0 成功标准

## A2

```text
输入贵州产品 + 目标市场
→ 能找到真实 Buyer Company
→ 能说明为什么值得开发
→ 能找到合适 Decision Maker
→ 能形成可审核的 Email Draft
→ 能发出并维护等待状态
→ 无回复时可以继续或停止
→ 有回复时可靠交给 A6
```

## A6

```text
Buyer Reply
→ 正确绑定 Opportunity
→ 识别 Reply Intent
→ 识别 Changed Fields
→ 只让受影响能力失效
→ 形成 Key Question
→ 形成 Next Best Action
→ 生成有证据的 Draft
→ 进入 Human Gate / Wait / Human Takeover
→ 可以通过新事件恢复
```

## 系统级

```text
一笔 Opportunity 可以持续运行
可以等待
可以恢复
可以增量重跑
可以审计
可以人工接管
可以回放
```

---

# 最终定义

A2：

> 从“我想进入这个市场”开始，找到可能会买的人，并把第一次有效商务对话建立起来。

A6：

> 从“买家已经回复”开始，根据新的事实和反馈持续决定下一步，直到成交、丢单、长期维护或人工接管。

QianPulse Agent：

> 负责什么时候调用 A2 / A3 / A4 / A5 / A6、什么时候等待、什么时候恢复、什么时候停、什么时候交给人。

SKILL：

> 负责专业业务判断。

Engine / Service：

> 负责确定性计算、数据查询、外部执行与第三方服务接入。
