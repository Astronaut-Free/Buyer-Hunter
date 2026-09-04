# QianPulse Buyer Intelligence Center 工程文档 V1

## 1. 组件定位

Buyer Intelligence Center 是全球商机经营平台中的买家研究组件。

核心目标：

> 理解一个机会背后的企业、组织、关键联系人和商业背景。

输入：

```
Opportunity Candidate
```

输出：

```
Buyer Profile
+
Contact Intelligence
+
Business Context
```

---

# 2. 能力边界

负责：

- 企业画像
- 产业链角色判断
- 产品与业务分析
- 联系人发现
- 企业动态追踪
- 商业关系判断

不负责：

- 采购机会发现
- 触达执行
- 商务谈判
- 成交管理

---

# 3. 输入输出 Contract

## Input

```json
{
 "opportunity_id":"",
 "company_name":"",
 "domain":"",
 "source_evidence":[]
}
```

## Output

```json
{
 "buyer_profile":{},
 "contacts":[],
 "business_events":[],
 "confidence":0
}
```

---

# 4. 子模块

## 4.1 Company Profile

能力：企业基础画像。

字段：

- 公司名称
- 官网
- 国家
- 地址
- 公司规模
- 成立年份
- 主营产品
- 商业模式

---

## 4.2 Industry Role Resolver

能力：判断产业链角色。

输出：

```
BRAND_OWNER
IMPORTER
DISTRIBUTOR
WHOLESALER
MANUFACTURER
RETAILER
```

输入来源：

- 官网
- 产品页
- 新闻
- 贸易记录

---

## 4.3 Contact Intelligence

能力：找到商务关系入口。

字段：

- 姓名
- 职位
- 部门
- 联系方式
- 社交账号

目标角色：

- Purchasing Manager
- Sourcing Manager
- Import Manager
- Product Manager
- Founder

---

## 4.4 Business Event Monitor

能力：发现企业变化。

事件：

- 新品发布
- 招聘
- 扩张
- 融资
- 展会
- 渠道变化

---

# 5. 数据来源

支持：

## API

- Apollo
- 商业数据库

## Crawler

- 官网
- 新闻
- 招聘页面
- 展会页面

## User Input

- CSV
- 历史客户
- 人工补充

统一进入：

```
Evidence Layer
```

---

# 6. 前端页面

## Buyer Profile Page

大组件：

```
Company Header
Business Profile
Contact Panel
Event Timeline
Evidence Panel
```

---

# 7. Agent 关系

关联：

- Research Agent
- Opportunity Hunter Agent
- Conversation Agent

---

# 8. API

## Buyer详情

```
GET /api/v1/buyers/{id}
```

## 联系人

```
GET /api/v1/buyers/{id}/contacts
```

## 企业动态

```
GET /api/v1/buyers/{id}/events
```

---

# 9. 验收标准

用户打开一个机会后，可以回答：

- 这家公司是谁？
- 它属于哪个产业角色？
- 谁可能负责采购？
- 最近发生了什么变化？
- 为什么值得进一步建立关系？
