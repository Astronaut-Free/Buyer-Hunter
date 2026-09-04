# QianPulse Opportunity Radar 前端页面工程文档 V2.0

## 1. 页面定位

页面名称：Opportunity Radar｜全球机会雷达

页面目标：持续展示全球不同市场、行业与买家正在出现的采购变化，帮助用户发现“哪里正在买、谁开始变化、哪些变化值得进入商机池”。

核心对象：`Signal[]`、`MarketCluster[]`、`OpportunityCandidate[]`。

---

## 2. 页面能力边界

Radar 负责发现、聚合、筛选和解释采购信号。

主要输出：

- 市场热区
- 行业热区
- 买家变化
- Opportunity Candidate
- Evidence 入口

深度买家研究由 Buyer Intelligence 承担；正式商机判断由 Opportunity Intelligence 承担。

---

## 3. 页面结构

```text
Opportunity Radar
├── Radar Header
├── Query / Filter Bar
├── Global Market Map
├── Market Heat Ranking
├── Signal Feed
├── Emerging Buyer List
├── Supplier Change Watch
└── Evidence Drawer
```

---

## 4. 大组件

### 4.1 Query / Filter Bar

组件：`RadarFilterBar`

筛选字段：

- 产品 / SKU
- HS Code
- 国家 / 地区
- 买家类型
- 产业链角色
- 信号类型
- 时间窗口
- 数据源
- 可信等级

支持自然语言输入，例如：

> 找最近 30 天美国抹茶进口增长，同时出现供应商变化的品牌商。

解析后展示结构化筛选条件，用户可人工修正。

### 4.2 Global Market Map

组件：`GlobalOpportunityMap`

地图聚合字段：

- `country_code`
- `signal_count`
- `opportunity_candidate_count`
- `high_priority_count`
- `top_categories[]`
- `freshness`

点击国家进入 Market Drilldown。

### 4.3 Market Heat Ranking

组件：`MarketHeatRanking`

计算维度：

- 新信号数量
- 高强度信号占比
- 采购增长
- 新 RFQ
- 供应商切换事件
- 目标卖方匹配程度

前端只展示聚合结果与解释，不负责生成底层评分。

### 4.4 Signal Feed

组件：`SignalFeed`

标准信号类型：

```text
IMPORT_ACTIVE
IMPORT_GROWTH
SUPPLIER_CHANGE
RFQ_POSTED
HIRING_PURCHASER
NEW_PRODUCT
EXPANSION
NEWS_EVENT
REGULATION_CHANGE
```

单条字段：

- `signal_id`
- `buyer_id`
- `signal_type`
- `title`
- `summary`
- `occurred_at`
- `captured_at`
- `source_name`
- `source_url`
- `fact_level`
- `confidence`
- `related_product`
- `evidence_id`

### 4.5 Emerging Buyer List

组件：`EmergingBuyerList`

用于展示刚刚达到候选阈值的买家。

字段：

- 买家名称
- 国家
- 产业链角色
- 关联产品
- 信号数量
- 最强信号
- 最近变化时间
- Candidate Score

操作：加入商机池、继续研究、忽略、加入监控。

### 4.6 Supplier Change Watch

组件：`SupplierChangeWatch`

展示：

- 当前供应商
- 新增供应商
- 退出供应商
- 首次出现时间
- 最后出现时间
- 变化强度
- 数据覆盖情况

### 4.7 Evidence Drawer

组件：`EvidenceDrawer`

任何信号可展开查看：

- 原始来源
- 原始字段或原文片段
- 抓取时间
- 数据源类型
- FACT / DERIVED / INFERENCE
- 字段级 Evidence Refs

---

## 5. 数据来源兼容

页面不绑定单一供应商。

允许来源：

```text
API Provider
Crawler
Browser Agent
RSS / Search
User Upload
Manual Entry
```

统一进入：

```text
Raw Evidence
→ Normalized Signal
→ Radar View
```

---

## 6. API Contract

```http
GET /api/v1/radar/markets
GET /api/v1/radar/signals
GET /api/v1/radar/buyers
GET /api/v1/radar/supplier-changes
POST /api/v1/radar/query
POST /api/v1/opportunity-candidates/{id}/promote
```

---

## 7. React 结构

```text
src/pages/OpportunityRadar/
├── index.jsx
├── RadarFilterBar.jsx
├── GlobalOpportunityMap.jsx
├── MarketHeatRanking.jsx
├── SignalFeed.jsx
├── EmergingBuyerList.jsx
├── SupplierChangeWatch.jsx
└── EvidenceDrawer.jsx
```

---

## 8. 验收标准

- 用户能从市场、产品、信号三个维度找到采购变化。
- 每条重要信号均可回溯 Evidence。
- Candidate 可一键进入商机判断链路。
- 数据源失效时局部降级，不影响其他来源继续工作。
- 新增数据源无需修改页面业务字段。