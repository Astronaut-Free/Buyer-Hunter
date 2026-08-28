# 黔脉 QianPulse｜A2 Batch Prospecting & Opportunity Seeding V1

## 1. 工程问题

A2 从一个卖家的市场开发目标开始，天然会返回多个 Buyer Company。现有 QianPulse Agent 围绕单笔 Opportunity 持续运行。

本轮增加一个轻量批处理层：

```text
Seller Goal
→ A2 Batch Prospecting
→ Ranked Buyer Companies
→ Buyer Fit + Contact + Outreach Readiness
→ READY Candidates
→ Opportunity Seeds
→ 每个 Opportunity 继续进入现有 QianPulse Agent
```

Agent Runtime 保持一套。

## 2. 批处理边界

`skill-runtime/a2-batch.js` 控制三种规模：

```text
max_candidates
max_contacted_companies
maxReady
```

这样可以控制贸易数据查询与联系人 enrichment 成本，避免为了提高命中率对所有候选企业、所有社媒和大量联系人无限扩展。

## 3. Company-first

批处理顺序固定：

```text
Trade Buyer Discovery
→ Buyer Company Fit
→ Rank
→ Top Company Domain
→ Decision Maker Enrichment
→ A2 READY Gate
→ Evidence-grounded Outreach Draft
```

联系人 enrichment 只发生在产品相关性已经成立的 Buyer Company 上。

## 4. Opportunity Seed

`opportunity-seeder.js` 只把 `READY + outreach` 的候选转成 seed。

每个 seed 带：

```text
seller
buyer company
contact
product
A2 buyer fit
A2 outreach draft
evidence ids
READY_FOR_OUTREACH_APPROVAL
```

seed 后续由现有 Opportunity Store 分配正式 `opportunity_id`，进入审批、Email、Conversation、A6。

## 5. 主链

```text
A2 Batch
→ Opportunity Seed
→ Human Approval
→ Email
→ CONTACTED
→ Buyer Reply
→ ConversationEvent
→ A6
```

批量主动拓展只负责产生高质量 Opportunity 起点，不引入第二套 Agent Runtime。
