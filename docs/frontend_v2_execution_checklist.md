# QianPulse Frontend V2 Execution Checklist

## Branch

`feature/qianpulse-frontend-v2`

## Goal

基于现有 Buyer-Hunter 前端与 Agent Runtime，增量升级为全球商机经营工作台。

原则：

- 保留现有 Opportunity 模型
- 保留 A2-A6 Runtime
- 保留 Evidence 数据层
- 保留 API Contract
- 不重做产品
- 不污染 main

---

# Phase 0 基线确认

- [ ] 确认当前 demo 前端入口
- [ ] 确认 App.jsx 页面结构
- [ ] 确认 api.js 当前接口
- [ ] 确认 data.js mock 数据结构
- [ ] 确认现有 Opportunity 数据字段

---

# Phase 1 前端架构升级

## 页面层 L1

- [ ] Dashboard 商机驾驶舱
- [ ] Opportunity Radar 全球机会雷达
- [ ] Opportunity Workspace 商机工作台
- [ ] Buyer Intelligence 买家情报
- [ ] Mission Workspace 商务任务空间
- [ ] Conversation 沟通推进
- [ ] Playbook 复盘

---

# Phase 2 业务组件 L2

## Opportunity

- [ ] OpportunityCard
- [ ] OpportunityHeader
- [ ] OpportunityScore
- [ ] WhyNowPanel
- [ ] DemandCard
- [ ] NextActionPanel

## Signal

- [ ] SignalTimeline
- [ ] EvidencePanel
- [ ] SourceTag
- [ ] ConfidenceBadge

## Buyer

- [ ] BuyerProfile
- [ ] BuyerContacts
- [ ] BuyerEvents

## Supplier

- [ ] SupplierGraph
- [ ] SupplierChangeTimeline

## Conversation

- [ ] ConversationTimeline
- [ ] ReplySuggestion
- [ ] HumanTakeoverPanel

---

# Phase 3 API 对接

## Opportunity

- [ ] GET /api/v1/opportunities/dashboard
- [ ] GET /api/v1/opportunities/{id}
- [ ] GET /api/v1/opportunities/{id}/signals
- [ ] GET /api/v1/opportunities/{id}/evidence
- [ ] POST /api/v1/opportunities/{id}/next-action

## Buyer

- [ ] GET /api/v1/buyers/{id}
- [ ] GET /api/v1/buyers/{id}/contacts

## Conversation

- [ ] GET /api/v1/opportunities/{id}/conversation
- [ ] POST /api/v1/opportunities/{id}/reply

---

# Phase 4 数据字段

## Buyer

- [ ] 公司名称
- [ ] 国家地区
- [ ] 官网
- [ ] 产业链角色
- [ ] 联系人
- [ ] 企业动态

## Demand

- [ ] 产品
- [ ] 规格
- [ ] 数量
- [ ] 认证
- [ ] 目的地

## Signal

- [ ] 进口记录
- [ ] 进口增长
- [ ] 供应商变化
- [ ] RFQ
- [ ] 新闻
- [ ] 招聘

## Action

- [ ] 联系对象
- [ ] 联系渠道
- [ ] 沟通内容
- [ ] 下一步时间
- [ ] 审批状态

---

# Phase 5 数据源接入预留

统一进入 Evidence Layer：

- [ ] API 数据源
- [ ] 爬虫数据源
- [ ] 浏览器 Agent
- [ ] 用户上传数据
- [ ] 社媒数据
- [ ] 沟通记录

数据流：

```
Data Source
↓
Evidence
↓
Opportunity
↓
Action
↓
Outcome
```

---

# Phase 6 验收标准

## 产品

- [ ] 用户能看到今日值得推进的商机
- [ ] 用户能理解为什么值得联系
- [ ] 用户能看到证据来源
- [ ] 用户能获得下一步动作
- [ ] 用户能持续跟进对话

## 技术

- [ ] 不修改 main
- [ ] 组件可独立维护
- [ ] API 与数据源解耦
- [ ] 支持后续爬虫/API接入
- [ ] 支持 Agent Runtime 扩展
