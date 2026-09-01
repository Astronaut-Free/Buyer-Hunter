# 黔脉 QianPulse｜A2 / A6 Email Webhook & Execution V1

## 1. 本轮目标

补齐 Email-first 链路的两个关键工程组件：

```text
Smartlead Webhook Security / Idempotency
Approval → External Reply Executor
```

## 2. Webhook 安全

Smartlead 当前官方建议 Webhook 使用：

```text
Content-Type: application/json
X-Request-Id
X-Webhook-Level
X-Smartlead-Signature: sha256=...
```

签名按原始 request body 和 signing secret 执行 HMAC SHA256 校验。

`webhooks/smartlead.js` 负责：

```text
verifySmartleadWebhook()
normalizeSmartleadWebhook()
makeWebhookIdempotencyKey()
```

同一 `X-Request-Id` 不允许产生第二次业务副作用。

官方参考：
- https://helpcenter.smartlead.ai/en/articles/403-quick-tips-for-testing-with-sample-webhook-payloads

## 3. 外部 Reply Executor

`external-action-executor.js` 负责执行已经通过审批的 Smartlead thread reply。

执行顺序：

```text
A6 Next Action
→ Draft
→ Approval APPROVED / EDITED
→ Output Guard
→ Idempotency Check
→ Smartlead replyEmailThread
→ SENT
```

`executionMode=HUMAN` 时 Executor 不自动发送。

Approval 仍是 QianPulse 的控制权来源，Smartlead 只承担 transport。

## 4. A2 Provider Pipeline

新增 `skill-runtime/a2-pipeline.js`：

```text
Target Definition
→ trade_data.searchBuyers
→ Buyer Fit
→ 选择 Buyer Company
→ 获取 company domain
→ contact_data.findDecisionMakers
→ 绑定 Buyer Company
→ A2 Readiness Gate
```

如果贸易数据能确认公司但缺少 domain，流程停在 `MORE_EVIDENCE`，不会绕过 Company-first 原则直接找随机联系人。

## 5. 下一步

```text
Webhook HTTP endpoint
→ 验签
→ 去重
→ Smartlead event mapping
→ ConversationEvent
→ Opportunity resolve
→ A6 Resume
```

Smartlead Email Reply 的业务 payload 字段需使用账户中的真实 sample webhook 进一步固化 mapping，当前代码保留 raw data，不猜测未公开字段。
