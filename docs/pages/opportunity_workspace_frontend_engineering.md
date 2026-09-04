# QianPulse Opportunity Workspace 前端页面工程文档 V1

## 1. 页面定位

页面名称：Opportunity Workspace 商机工作台

目标：

围绕一个 Opportunity 展示完整商机经营过程。

核心问题：

> 为什么值得联系？现在应该做什么？如何推进成交？

页面输入：

```
Opportunity Object
```

页面输出：

```
Decision
+
Next Action
+
Conversation Mission
```

---

# 2. 页面结构

```
Opportunity Workspace

├── Opportunity Header
│
├── Why Now 商机判断
│
├── Buyer Intelligence 买家情报
│
├── Demand 采购需求
│
├── Supplier Intelligence 供应链变化
│
├── Market Access 市场准入
│
├── AI Next Action
│
└── Conversation Progress
```

---

# 3. 大组件设计

## 3.1 Opportunity Header

职责：展示商机核心状态。

字段：

- buyer_name
- country
- product
- opportunity_score
- stage
- priority

组件：

```
OpportunityHeader
 ├── ScoreBadge
 ├── StageTag
 └── BuyerSummary
```

---

## 3.2 Why Now Panel

职责：解释为什么现在值得推进。

输入：

```
Signal
Evidence
Decision
```

展示：

- 采购增长
- 供应商变化
- RFQ
- 企业动态
- 新闻事件

组件：

```
WhyNowPanel
 ├── SignalTimeline
 ├── EvidenceCard
 └── ConfidenceBadge
```

---

## 3.3 Buyer Intelligence Panel

职责：理解买家。

模块：

### Company Profile

字段：

- 公司名称
- 官网
- 国家
- 地址
- 产业链角色
- 主营产品

### Contact Intelligence

字段：

- 联系人
- 职位
- 部门
- 联系渠道

### Business Events

字段：

- 新品
- 招聘
- 扩张
- 展会

---

## 3.4 Demand Panel

职责：展示采购需求。

字段：

- 产品
- 规格
- 数量
- 目的地
- 认证要求
- 交付时间

组件：

```
DemandCard
```

---

## 3.5 Supplier Intelligence Panel

职责：展示供应链变化。

字段：

- 当前供应商
- 历史供应商
- 新增供应商
- 减少供应商
- 变化时间

组件：

```
SupplierGraph
SupplierChangeTimeline
```

---

## 3.6 Market Access Panel

职责：判断进入目标市场的条件。

字段：

- 国家
- 法规要求
- 认证要求
- 缺失资料
- 风险等级

组件：

```
CompliancePanel
RiskBadge
```

---

## 3.7 AI Next Action Panel

职责：生成下一步商务动作。

字段：

- action_type
- target_person
- channel
- message
- approval_status
- follow_up_time

组件：

```
ActionPanel
 ├── ContactSelector
 ├── MessagePreview
 └── ApprovalGate
```

---

# 4. 数据 Contract

页面只依赖业务对象。

禁止直接依赖：

- ImportYeti 字段
- Apollo 字段
- 爬虫原始字段

数据流：

```
Data Source
↓
Evidence
↓
Opportunity
↓
Workspace
```

---

# 5. API Contract

## 获取商机详情

```
GET /api/v1/opportunities/{id}
```

返回：

- buyer
- demand
- signals
- evidence
- supplier_intelligence
- market_access
- next_action

---

## 获取沟通记录

```
GET /api/v1/opportunities/{id}/conversation
```

---

## 生成下一步动作

```
POST /api/v1/opportunities/{id}/next-action
```

---

# 6. React 组件结构

```
src/pages/OpportunityWorkspace

├── index.jsx
├── components/
│
├── OpportunityHeader.jsx
├── WhyNowPanel.jsx
├── BuyerIntelligence.jsx
├── DemandCard.jsx
├── SupplierGraph.jsx
├── MarketAccess.jsx
├── NextActionPanel.jsx
└── ConversationProgress.jsx
```

---

# 7. 验收标准

## 产品

- 用户进入页面可以理解商机价值
- 用户知道联系理由
- 用户知道联系对象
- 用户知道下一步动作
- 用户可以持续推进

## 技术

- 页面组件独立
- Contract 驱动
- 支持 API / 爬虫 / Agent 数据接入
- 不依赖具体数据源
