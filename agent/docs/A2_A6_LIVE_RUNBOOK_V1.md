# 黔脉 QianPulse｜A2–A6 Live Runbook V1

## 1. 运行目标

当前代码层可运行主链：

```text
Seller Target
→ A2 Buyer Discovery
→ Contact Enrichment
→ Opportunity
→ First-Outreach Human Gate
→ Smartlead Lead Queue
→ Lead ID ↔ Opportunity Binding
→ Signed Smartlead Reply Webhook
→ Conservative Structured Field Extraction
→ A6 Opportunity Progression
→ Automatic A3 / A4 / A5 Dependency Refresh
→ A6 Re-evaluation
→ Opportunity Verified-field Persistence
→ Evidence-safe Reply Draft
→ Human Gate
→ Smartlead Lead Activities
→ email_stats_id Resolution
→ Smartlead Thread Reply
→ Workspace / Audit / Observability
```

自动运行在以下边界停住：

```text
Human Gate
Missing Evidence
Explicit Risk Block
High-risk Commercial Action
```

## 2. 运行模式

```text
QIANPULSE_EXTERNAL_MODE=sandbox   # 默认；允许缺少生产凭据启动
QIANPULSE_EXTERNAL_MODE=live      # 生产外部动作；启动时执行配置完整性校验
```

`live` 模式缺少必需配置时，`server/bootstrap.js` 直接终止启动并返回 `LIVE_CONFIG_INCOMPLETE`。

## 3. Live 必需环境变量

```text
SMARTLEAD_API_KEY
SMARTLEAD_CAMPAIGN_ID
SMARTLEAD_WEBHOOK_SECRET
APOLLO_API_KEY
TRADEMO_BUYER_LIST_URL
```

Trademo 认证协议由实际账号配置注入：

```text
TRADEMO_API_KEY
TRADEMO_API_KEY_HEADER
TRADEMO_API_KEY_PREFIX
```

可选：

```text
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
PORT
SMARTLEAD_BASE_URL
SMARTLEAD_REPLY_MODE
```

`SMARTLEAD_BASE_URL` 用于 sandbox / integration test，可将 Smartlead 请求指向受控测试服务。未设置时使用 Provider 默认地址。

Smartlead 回复默认采用当前 `email_stats_id` 合同：

```text
SMARTLEAD_REPLY_MODE=stats_id
```

仅在已经确认账号仍使用旧合同的环境显式设置：

```text
SMARTLEAD_REPLY_MODE=legacy
```

系统遇到当前合同失败时直接 fail-closed，避免外部动作状态不确定后再次发送。

## 4. Smartlead Campaign 前置条件

A2 首次触达采用 Campaign custom fields 注入个性化内容。目标 Campaign 的发送模板必须包含：

```text
Subject: {{qianpulse_subject}}
Body:    {{qianpulse_body}}
```

A2 Approval 执行前会调用 Campaign Sequence 查询校验这两个 token。缺任意 token 时返回：

```text
CAMPAIGN_TEMPLATE_INVALID
```

系统停止加入 Lead。

每个 Lead 写入：

```text
qianpulse_opportunity_id
qianpulse_subject
qianpulse_body
```

## 5. A2 首次触达

A2 产生 `READY_FOR_OUTREACH_APPROVAL` Opportunity 后，在配置 Campaign ID 时创建：

```text
A2_OUTREACH_DRAFT
```

Approval 支持：

```text
APPROVED
EDITED
REJECTED
```

批准后执行顺序：

```text
Campaign template validation
→ addLeadsToCampaign(return_lead_ids=true)
→ fallback getLeadByEmail when needed
→ Smartlead Lead ID ↔ Opportunity bind
→ Opportunity.status = OUTREACH_QUEUED
```

同一 Approval 使用固定 external-action idempotency key，重复审批不会重复加入 Lead。

## 6. Smartlead Reply Webhook

HTTP endpoint：

```text
POST /api/v1/webhooks/smartlead
```

入口使用 raw request body 做 HMAC SHA256 验签。核心处理顺序：

```text
Raw body
→ Signature verification
→ JSON parse
→ Request ID idempotency key
→ Reply payload mapping
→ external lead ID resolution
→ Opportunity resolution
→ BUYER_MESSAGE
→ A6 progression cycle
```

缺少 Lead ID、Opportunity 映射或消息正文时 fail-closed。

A2 Opportunity 会保留明确提供的 `seller_context`。Webhook 进入 A6 后复用该证据上下文，MOQ、认证、交期、供给能力、市场准入等回答继续受 Evidence Guard 与 Human Gate 约束。

## 7. Buyer Message 结构化字段提取

A6 progression cycle 在专业依赖刷新前执行保守字段提取。当前覆盖：

```text
quantity
destination
delivery_date
payment_terms
certification
specification
```

原则：

```text
买家原文存在明确结构 → 提取
API 显式 field_updates 存在 → 显式值优先
文本含糊 → 不猜测
无可靠结构 → 保持原值或进入 Evidence Gate
```

例如：

```text
We need 20 tons delivered to Germany by October 2026.
```

可形成：

```json
{
  "quantity": "20 tons",
  "destination": "Germany",
  "delivery_date": "October 2026"
}
```

可靠提取后的字段会进入当前 A6 changed-field 判断，并在最终 Envelope 应用时写回同一 Opportunity。

## 8. A3 / A4 / A5 自动依赖刷新

A6 首次判断得到 `invalidated_capabilities` 后，Runtime 在同一 progression cycle 自动执行受影响 SKILL。

当前职责：

```text
A3 qianpulse.a3.purchase_timing
   → 最新采购时间窗口 / timing signal

A4 qianpulse.a4.supply_match
   → 数量 / 规格 / 认证 / 交期相关供给事实校验

A5 qianpulse.a5.trade_risk
   → 目的地 / 认证 / 支付条件相关贸易风险校验
```

执行链：

```text
Buyer Message
→ Structured Field Extraction
→ A6 First Pass
→ invalidated_capabilities
→ runInvalidatedDependencies
→ A3 / A4 / A5 only when invalidated
→ Merge dependency_results
→ A6 Second Pass
→ Dependency Gate
→ Persist verified Opportunity fields
→ Draft / Wait / Block / Human Takeover
```

刷新结果规则：

```text
DONE            → dependency refreshed
NOT_APPLICABLE  → dependency refreshed
BLOCKED         → dependency refreshed + preserve block
MORE_EVIDENCE   → dependency unresolved; Opportunity = WAITING_EVIDENCE
ERROR           → execution failure path
```

A4 缺少容量、MOQ、规格、认证或交期依据时不会自行补事实。A5 遇到显式 blocked market 时直接阻断。正式报价、支付条件、合同等高风险动作继续保持 HUMAN 边界。

## 9. AgentRun / Step / Checkpoint 审计

自动依赖刷新已经进入统一 AgentRun 审计链。

一次含 A3 / A4 刷新的 Buyer Message 示例：

```text
AgentRun
├─ Step 1  qianpulse.a4.supply_match
├─ Step 2  qianpulse.a3.purchase_timing
└─ Step 3  qianpulse.a6.opportunity_progression
```

`run.capabilities_called` 与实际 Step 顺序保持一致。每个 Step 保存：

```text
capability_id
capability_version
input_hash
output_hash
run_status
evidence_refs
result
```

最终 Checkpoint 指向当前 progression cycle 的 A6 Step。

Opportunity Workspace 与 INTERNAL observability 可以继续读取这些状态，定位 WAITING_EVIDENCE、BLOCKED、Approval、External Action 和 Provider failure。

## 10. A6 回复执行

A6 生成可对外 Draft 且要求人工确认时创建：

```text
BUYER_MESSAGE_DRAFT
```

Approval API：

```text
POST /api/v1/approvals/{approval_id}
Authorization: Bearer <INTERNAL_TOKEN>
```

批准后从触发 Buyer Message Event 恢复：

```text
campaign_id
lead_id
reply_message_id
reply_email_time
```

当前 Smartlead Reply API 还需要 `email_stats_id`。执行器调用 Provider 后，Provider 使用：

```text
GET /campaigns/all-leads-activities
```

在 Buyer Reply 时间窗口内匹配：

```text
campaign_id
lead_id
reply_details.message_id / message_id
```

匹配成功后读取该 Activity 的：

```text
stats_id → email_stats_id
```

随后执行：

```text
POST /campaigns/{campaign_id}/reply-email-thread
{
  email_stats_id,
  email_body,
  add_signature,
  reply_message_id,
  reply_email_time
}
```

找不到 `email_stats_id` 时返回 `SMARTLEAD_EMAIL_STATS_ID_REQUIRED`，外部回复停止发送。

## 11. 当前自动化验证

核心自动闭环模拟链：

```text
A2 Buyer Discovery
→ First-Outreach Approval
→ Campaign Token Guard
→ Smartlead Queue
→ Lead Binding
→ Signed EMAIL_REPLIED Webhook
→ Buyer Field Extraction
→ A6 First Pass
→ Automatic A3/A4/A5 Refresh
→ A6 Second Pass
→ Opportunity Field Persistence
→ Evidence-safe Draft
→ Second Approval
→ Smartlead Thread Reply
```

已覆盖真实主链形态的测试场景：

```text
A2
→ Smartlead
→ Buyer asks delivery lead time
→ A3 timing refresh
→ A4 supply refresh
→ A6 resumes
→ Lead time draft from verified seller evidence
→ Human Gate
→ Smartlead reply
```

多字段变化场景：

```text
quantity + destination + delivery_date changed
→ structured extraction
→ A3 + A4 + A5 refresh
→ verified fields persisted to same Opportunity
→ dependency required = []
```

HTTP 黑盒链：

```text
POST signed Smartlead webhook
→ server/index.js
→ Opportunity mapping
→ A6
→ Approval generated
→ Workspace state projection
→ POST Approval API with INTERNAL token
→ GET Smartlead Lead Activities
→ email_stats_id resolved
→ POST Smartlead thread reply
→ INTERNAL observability reflects flow
```

当前 CI 基线：

```text
GitHub Actions Run #85
109 tests
109 passed
0 failed
```

验证范围包含：

```text
invalid signature
missing lead mapping
invalid campaign template
wrong role approval
duplicate external execution
missing transport context
missing email_stats_id
current stats-id reply contract
explicit legacy reply mode
A3/A4/A5 auto refresh
missing dependency evidence
blocked market
structured buyer field extraction
verified Opportunity field persistence
AgentRun dependency Step audit
Opportunity Workspace projection
runtime observability
HTTP webhook + approval black-box flow
```

## 12. 生产 Smoke 顺序

```text
1. QIANPULSE_EXTERNAL_MODE=live 启动通过
2. /api/health 确认 Smartlead / Webhook configured
3. 校验目标 Campaign 含 qianpulse_subject / qianpulse_body
4. 用单个内部测试 Buyer 跑 A2
5. 人工批准 First-Outreach
6. 确认 Opportunity 保存 Smartlead lead_id
7. 测试 Buyer 回复邮件，至少包含一次交期或数量变化
8. 确认 Webhook 生成同一 Opportunity 的 A6 Run
9. 确认受影响 A3/A4/A5 Step 自动出现
10. 缺证据场景确认进入 WAITING_EVIDENCE
11. 证据完整场景确认 A6 自动完成第二次判断
12. 确认 Opportunity 只写入可靠结构化字段
13. 人工批准 A6 Reply Draft
14. 确认 Lead Activities 可解析 email_stats_id
15. 确认 Smartlead thread reply 只执行一次
16. 检查 Workspace / Run / Step / Checkpoint / Approval / external_actions / observability
```

## 13. 当前闭环边界

```text
代码主自动链               CLOSED
安全控制链                 CLOSED
状态 / 审计 / 可观测链      CLOSED
Sandbox / Mock E2E         CLOSED
Real Provider Smoke        EXTERNAL CREDENTIALS REQUIRED
```

生产 Smoke 需要真实 Provider 凭据与账号配置。凭据就绪前，CI 使用 mock / sandbox transport 验证控制链、安全边界、HTTP 接线、自动依赖刷新和 Opportunity 状态闭环。
