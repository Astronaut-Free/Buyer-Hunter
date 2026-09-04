# QianPulse Buyer Intelligence 前端页面工程文档 V2.0

## 1. 页面定位

页面名称：Buyer Intelligence｜买家情报中心

页面目标：围绕一个 Buyer 汇总企业身份、产业链角色、采购行为、供应商关系、联系人与近期企业事件，为 Opportunity 判断和主动触达提供可信上下文。

核心对象：`BuyerProfile`、`ContactIntelligence`、`TradeIntelligence`、`BusinessEvent[]`。

---

## 2. 页面能力边界

Buyer Intelligence 负责回答：

- 这家公司是谁？
- 在产业链中扮演什么角色？
- 过去怎么买？
- 当前供应商有哪些？
- 谁可能负责采购？
- 最近发生了什么变化？

页面不直接决定 Opportunity Score，也不直接执行外联动作。

---

## 3. 页面结构

```text
Buyer Intelligence
├── Buyer Header
├── Company Profile
├── Industry Role
├── Product / Channel Footprint
├── Trade Intelligence
├── Supplier Network
├── Contact Intelligence
├── Business Event Timeline
├── Evidence Coverage
└── Related Opportunities
```

---

## 4. 大组件

### 4.1 Buyer Header

字段：

- `buyer_id`
- `company_name`
- `domain`
- `country`
- `address`
- `company_type`
- `industry_role`
- `employee_size`
- `profile_confidence`

### 4.2 Company Profile

展示：

- 公司简介
- 成立年份
- 主营产品
- 主要市场
- 商业模式
- 销售渠道
- 品牌 / 子品牌
- 公开联系方式

每个字段保留来源与更新时间。

### 4.3 Industry Role

角色标准：

```text
BRAND_OWNER
IMPORTER
DISTRIBUTOR
WHOLESALER
MANUFACTURER
RETAILER
SERVICE_PROVIDER
UNKNOWN
```

展示角色结论、支持 Evidence、置信度和可能的次级角色。

### 4.4 Product / Channel Footprint

展示：

- 当前产品线
- 新增产品
- 目标消费场景
- 线上渠道
- 线下渠道
- 主要销售市场

来源可包含官网、产品页、零售页面、新闻和用户资料。

### 4.5 Trade Intelligence

字段：

- 采购品类
- HS Code
- 最近采购时间
- 采购次数
- 采购频率
- 采购量趋势
- 来源国家
- 主要港口 / 目的地
- 数据覆盖期

### 4.6 Supplier Network

组件：`SupplierNetworkGraph`

展示：

- 当前供应商
- 主要供应商
- 历史供应商
- 新增供应商
- 流失供应商
- 供应商集中度
- 关系首次 / 最近出现时间

### 4.7 Contact Intelligence

组件：`ContactList`

字段：

- 姓名
- 职位
- 部门
- seniority
- role_fit
- 邮箱
- 电话
- LinkedIn / 公开社交主页
- 联系渠道可用性
- Evidence

采购角色优先级：采购、寻源、进口、供应链、品类、产品负责人。

### 4.8 Business Event Timeline

事件：

- 新品发布
- 扩张
- 招聘
- 新市场进入
- 门店变化
- 融资
- 高管变动
- 展会参展
- 供应链变化

### 4.9 Evidence Coverage

展示字段覆盖、来源数量、冲突字段、更新时间和人工复核状态。

### 4.10 Related Opportunities

展示该 Buyer 与不同 Seller SKU / Market 形成的 Opportunity，防止一个公司只能挂一条商机。

---

## 5. 数据来源兼容

```text
API Provider
Company Website Crawler
Search / News
Browser Agent
User Upload
Manual Validation
```

所有来源先进入 Evidence / Entity Resolution，再生成 Buyer Profile。

---

## 6. API Contract

```http
GET /api/v1/buyers/{id}
GET /api/v1/buyers/{id}/contacts
GET /api/v1/buyers/{id}/trade-activity
GET /api/v1/buyers/{id}/suppliers
GET /api/v1/buyers/{id}/events
GET /api/v1/buyers/{id}/evidence
GET /api/v1/buyers/{id}/opportunities
```

---

## 7. React 结构

```text
src/pages/BuyerIntelligence/
├── index.jsx
├── BuyerHeader.jsx
├── CompanyProfile.jsx
├── IndustryRole.jsx
├── ProductChannelFootprint.jsx
├── TradeIntelligence.jsx
├── SupplierNetworkGraph.jsx
├── ContactList.jsx
├── BusinessEventTimeline.jsx
├── EvidenceCoverage.jsx
└── RelatedOpportunities.jsx
```

---

## 8. 验收标准

- 买家主体可验证，无法确认时展示 UNRESOLVED。
- 产业链角色有 Evidence 和置信度。
- 采购历史与供应商变化可以按时间查看。
- 联系人字段明确公开来源或授权来源。
- 页面能够支持一个 Buyer 对应多个 Opportunity。