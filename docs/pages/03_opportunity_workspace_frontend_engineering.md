# QianPulse Opportunity Workspace 前端页面工程文档 V2.0

## 1. 页面定位

页面名称：Opportunity Workspace｜商机工作台

页面目标：围绕一个 Opportunity 展示从证据、需求、时机、匹配、准入到推进动作的完整经营上下文。

核心问题：

- 为什么值得追？
- 买家具体要什么？
- 为什么是现在？
- 我方能否接住？
- 当前市场能否进入？
- 下一步由 AI 还是人工执行？

页面输入：`OpportunityDetail`。

页面输出：`Decision + Action + Conversation Context`。

---

## 2. 页面结构

```text
Opportunity Workspace
├── Opportunity Header
├── Why Now Panel
├── Buyer Intelligence Panel
├── Demand Panel
├── Trade / Supplier Intelligence Panel
├── Seller Fit Panel
├── Market Access Panel
├── Evidence Coverage Panel
├── AI Next Action Panel
└── Conversation Progress Panel
```

---

## 3. 大组件设计

### 3.1 Opportunity Header

字段：

- `opportunity_id`
- `buyer_name`
- `country`
- `industry_role`
- `product`
- `opportunity_score`
- `priority`
- `stage`
- `owner`
- `last_updated_at`

组件：`OpportunityHeader`、`ScoreBadge`、`StageTag`、`FreshnessTag`。

### 3.2 Why Now Panel

输入：Signals + Timing Decision + Evidence。

展示：

- 最近进口动作
- 进口增长
- 供应商变化
- RFQ
- 新品 / 扩张 / 招聘
- 截止时间或采购时间窗口

每条理由必须显示 Evidence 状态。

### 3.3 Buyer Intelligence Panel

字段：

- 公司名称 / 官网 / 地址
- 企业类型
- 产业链角色
- 主营产品
- 销售渠道
- 目标市场
- 公司规模
- 关键联系人
- 联系人职位 / 部门 / 公开渠道
- 最近企业事件

支持跳转 Buyer Intelligence 页面。

### 3.4 Demand Panel

字段：

- 产品
- HS Code
- 规格
- 数量 / 单位
- 预算 / 价格区间
- 认证
- MOQ
- 用途
- 目的地
- 交付时间
- 截止时间
- 原始需求来源

UNKNOWN 字段明确展示待确认状态。

### 3.5 Trade / Supplier Intelligence Panel

字段：

- 最近采购时间
- 采购频率
- 采购量趋势
- 来源国家
- 当前供应商
- 主要供应商
- 新增供应商
- 流失供应商
- 供应关系变化时间

组件：`TradeTrend`、`SupplierGraph`、`SupplierChangeTimeline`。

### 3.6 Seller Fit Panel

字段：

- `fit_score`
- 硬条件满足项
- 硬缺口
- 软条件满足项
- 软缺口
- 产能
- MOQ
- 认证
- 价格带
- OEM
- 交期

### 3.7 Market Access Panel

字段：

- 目标国家
- 当前准入状态
- 必要认证
- 标签要求
- 食安 / 农残要求
- 进口文件
- 缺失资料
- 官方 Evidence
- Human Review 状态

状态：`PASS / CONDITIONAL / BLOCK / UNKNOWN`。

### 3.8 Evidence Coverage Panel

展示：

- FACT 数量
- DERIVED 数量
- INFERENCE 数量
- 待验证数量
- 来源覆盖
- 最后更新时间
- 冲突 Evidence

关键字段支持点开原始证据。

### 3.9 AI Next Action Panel

字段：

- `action_type`
- `target_person`
- `channel`
- `reason`
- `message_preview`
- `attachments[]`
- `due_at`
- `automation_mode`
- `approval_status`

动作示例：首轮触达、询问规格、寄样、补认证、报价、跟进、长期维护、人工接管。

### 3.10 Conversation Progress Panel

展示当前沟通阶段、最近消息、买家意向、关键问题、下一个动作和人工接管状态。

---

## 4. 页面数据 Contract

```ts
OpportunityDetail = {
  opportunity,
  buyer,
  demand,
  signals,
  trade_intelligence,
  supplier_intelligence,
  seller_fit,
  market_access,
  evidence_coverage,
  next_action,
  conversation_summary
}
```

页面消费业务 Contract，不消费第三方数据源原始字段。

---

## 5. API Contract

```http
GET /api/v1/opportunities/{id}
GET /api/v1/opportunities/{id}/signals
GET /api/v1/opportunities/{id}/evidence
GET /api/v1/opportunities/{id}/conversation
POST /api/v1/opportunities/{id}/next-action
POST /api/v1/opportunities/{id}/actions/{action_id}/approve
```

---

## 6. React 目录

```text
src/pages/OpportunityWorkspace/
├── index.jsx
├── OpportunityHeader.jsx
├── WhyNowPanel.jsx
├── BuyerIntelligencePanel.jsx
├── DemandPanel.jsx
├── TradeIntelligencePanel.jsx
├── SupplierIntelligencePanel.jsx
├── SellerFitPanel.jsx
├── MarketAccessPanel.jsx
├── EvidenceCoveragePanel.jsx
├── NextActionPanel.jsx
└── ConversationProgressPanel.jsx
```

---

## 7. 验收标准

- 用户进入页面后能判断商机价值、时机、缺口和下一步。
- 关键采购字段可回溯 Evidence。
- 市场准入 BLOCK 时禁止展示可直接执行的报价动作。
- 下一步动作能够进入 Channel Hub 或 Human Gate。
- Conversation 更新后页面可以刷新相关商机判断。