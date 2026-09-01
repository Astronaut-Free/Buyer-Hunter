# 黔脉 QianPulse｜A2 → Email Reply → A6 E2E Controller V1

## 目标

把已经完成的 A2、Opportunity Store、Smartlead Webhook、A6 Progression 串成同一条可测试业务链，同时保持单一 QianPulse Runtime。

```text
A2 Batch Prospecting
→ Opportunity Store
→ Smartlead lead binding
→ signed webhook
→ idempotency
→ external lead → Opportunity resolution
→ BUYER_MESSAGE
→ A6
→ dependency refresh gate
→ Opportunity update
```

## 新组件

`qianpulse-runtime-controller.js`

- `runProactiveDevelopment()`：执行 A2 Batch 并写入同一 Opportunity Store。
- `bindSmartleadLead()`：邮件 transport 完成后绑定 Smartlead lead id。
- `ingestSmartleadWebhook()`：验签、去重、路由并执行 A6。

Webhook 只有在外部 lead 与 Opportunity 已可靠绑定后才进入 A6。无法绑定时返回 `NEEDS_CONTEXT`。

## Idempotency

同一 `X-Request-Id` 成功进入业务处理后只执行一次 A6。重复请求返回 `DUPLICATE`。

`NEEDS_CONTEXT` 不写入成功去重记录，方便完成外部映射后重新投递。

## 当前边界

真实 Smartlead payload 字段继续通过 `extractSmartleadReply()` 注入。拿到真实账户 sample webhook 之前，不把猜测字段写死进业务 Runtime。
