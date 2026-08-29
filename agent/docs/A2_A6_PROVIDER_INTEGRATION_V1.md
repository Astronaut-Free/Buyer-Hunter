# 黔脉 QianPulse｜A2 / A6 Provider Integration V1

## 1. 目标

把 A2 / A6 的外部数据与邮件执行能力放到可替换 Provider / Adapter 层，SKILL 保留业务判断与边界，QianPulse Agent 继续负责事件、状态、路由、审批、等待、恢复和 Trace。

## 2. 一期 Provider

```text
A2 Buyer Company Discovery → Trademo-compatible trade provider
A2 Decision Maker Enrichment → Apollo
A2 / A6 Email Transport → Smartlead
```

一期自动执行渠道保持 Email。

## 3. Apollo

当前官方接口：

```text
POST https://api.apollo.io/api/v1/mixed_people/api_search
POST https://api.apollo.io/api/v1/people/match
```

People Search 只做候选联系人搜索；搜索结果本身不返回邮箱或电话，选中的联系人再进入 enrichment。

QianPulse 默认设置：

```text
reveal_personal_emails=false
reveal_phone_number=false
```

A2 保持 Buyer Company 先行，Apollo 只在 Buyer Fit Gate 后执行。

官方参考：
- https://docs.apollo.io/reference/people-api-search
- https://docs.apollo.io/reference/people-enrichment

## 4. Trademo

公开文档给出了 Global Buyer/Supplier List API 的请求与响应字段，包括：

```text
companyRole
companyCountryName
productKeywords
hsCodes
countriesTradingWithList
tradeTimePeriod
pageSize
pageNumber
sort
```

公开页面没有给出可直接写死的真实 API endpoint 与认证头，因此工程实现要求：

```text
TRADEMO_BUYER_LIST_URL
TRADEMO_API_KEY
TRADEMO_API_KEY_HEADER
TRADEMO_API_KEY_PREFIX
```

均由部署配置注入。代码禁止猜测 endpoint 或认证协议。

官方参考：
- https://www.trademo.com/apis/global-buyer-supplier-list-api

## 5. Smartlead

当前官方文档确认：

```text
Base: https://server.smartlead.ai/api/v1
POST /campaigns/{campaign_id}/leads
GET  /campaigns/{campaign_id}/leads/{lead_id}/message-history
POST /campaigns/{campaign_id}/reply-email-thread
POST /leads/{lead_id}/unsubscribe
```

认证使用 `api_key` query parameter。

QianPulse 保持两个安全默认值：

1. 不设置 `ignore_global_block_list=true`。
2. 不设置 `ignore_unsubscribe_list=true`。

外发仍受 QianPulse Human Gate 与 idempotency 控制。

官方参考：
- https://helpcenter.smartlead.ai/en/articles/125-full-api-documentation

## 6. Agent Bridge

`agent-skill-bridge.js` 提供：

```text
mergeCapabilityRegistry()
resolveSkillCapabilitiesForEvent()
invokeSkillThroughAdapter()
buildA2ContextFromAgent()
buildA6ContextFromAgent()
```

先以桥接层完成增量集成，避免一次性重写现有 Agent Runtime。

## 7. 下一步

```text
现有 Agent CAPABILITIES 合并 A2/A6 registry
BUYER_MESSAGE → A6
SELLER_PROACTIVE_DEVELOPMENT → A2
Smartlead reply webhook → ConversationEvent
Approval → idempotent external executor
E2E Opportunity demo
```
