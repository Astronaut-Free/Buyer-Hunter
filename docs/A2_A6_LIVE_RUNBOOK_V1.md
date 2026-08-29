# 黔脉 QianPulse｜A2 / A6 Live Runbook V1

## 1. 运行目标

当前可运行链路：

```text
Seller Target
→ A2 Buyer Discovery
→ Contact Enrichment
→ Opportunity
→ First-Outreach Human Gate
→ Smartlead Lead Queue
→ Lead ID ↔ Opportunity Binding
→ Signed Smartlead Reply Webhook
→ A6 Opportunity Progression
→ Evidence-safe Reply Draft
→ Human Gate
→ Smartlead Lead Activities
→ email_stats_id Resolution
→ Smartlead Thread Reply
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

系统不会遇到新合同失败后自动改走 legacy，从而避免外部动作状态不确定时再次发送。

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
→ A6
```

缺少 Lead ID、Opportunity 映射或消息正文时 fail-closed。

A2 Opportunity 会保留明确提供的 `seller_context`。Webhook 进入 A6 时复用该证据上下文，MOQ、认证、交期等回答继续受 A6 Evidence Guard 与 Human Gate 约束。

## 7. A6 回复执行

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

## 8. 当前自动化验证

模块级完整模拟链：

```text
A2
→ First-Outreach Approval
→ Campaign Token Guard
→ Smartlead Queue
→ Lead Binding
→ Signed EMAIL_REPLIED Webhook
→ Persisted Seller Evidence
→ A6 MOQ Answer Draft
→ Second Approval
→ Smartlead Thread Reply
```

HTTP 黑盒链：

```text
POST signed Smartlead webhook
→ server/index.js
→ Opportunity mapping
→ A6
→ Approval generated
→ POST Approval API with INTERNAL token
→ GET Smartlead Lead Activities
→ email_stats_id resolved
→ POST Smartlead thread reply
```

当前 CI 基线：

```text
90 tests
90 passed
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
HTTP webhook + approval black-box flow
```

## 9. 生产 Smoke 顺序

```text
1. QIANPULSE_EXTERNAL_MODE=live 启动通过
2. /api/health 确认 Smartlead / Webhook configured
3. 校验目标 Campaign 含 qianpulse_subject / qianpulse_body
4. 用单个内部测试 Buyer 跑 A2
5. 人工批准 First-Outreach
6. 确认 Opportunity 保存 Smartlead lead_id
7. 测试 Buyer 回复邮件
8. 确认 Webhook 生成同一 Opportunity 的 A6 Run
9. 人工批准 A6 Reply Draft
10. 确认 Lead Activities 可解析 email_stats_id
11. 确认 Smartlead thread reply 只执行一次
12. 检查 Run / Step / Checkpoint / Approval / external_actions
```

生产 Smoke 在真实 Provider 凭据可用后执行；当前 CI 使用 mock / sandbox transport 验证控制链、安全边界和 HTTP 接线。
