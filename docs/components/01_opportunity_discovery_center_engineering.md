# QianPulse Opportunity Discovery Center 工程文档 V1

## 1. 组件定位

组件名称：Opportunity Discovery Center

能力边界：

负责发现全球采购机会，将外部信号转换为可分析的 Opportunity。

不负责：

- 买家深度研究
- 沟通触达
- 商务谈判
- 成交管理

输入：数据源

输出：Opportunity Candidate + Evidence

---

# 2. 所属产品层

```
全球商机经营智能平台
        ↓
商机发现中心
        ↓
Opportunity Discovery Component
```

---

# 3. 核心业务流程

```
数据源
 ↓
采集
 ↓
实体识别
 ↓
信号提取
 ↓
机会评分
 ↓
生成Opportunity
 ↓
进入商机工作台
```

---

# 4. 数据输入能力

## API数据源

- 贸易数据API
- 企业数据API
- 联系人数据API
- 行业数据库API

## 爬虫数据源

- 企业官网
- 新闻
- 招聘页面
- 展会页面
- B2B采购页面
- 社媒公开内容

## 用户输入

- CSV
- 网页粘贴
- 客户资料
- 历史沟通记录

---

# 5. 子模块设计

## 5.1 Data Connector

职责：

接入不同数据源。

输出统一 Evidence。

---

## 5.2 Evidence Extractor

职责：

从原始内容提取事实。

输出：

- 公司
- 产品
- 时间
- 来源
- 原文证据

---

## 5.3 Signal Engine

职责：

识别采购变化。

信号类型：

```
IMPORT_ACTIVE
IMPORT_GROWTH
SUPPLIER_CHANGE
RFQ_POSTED
NEWS_EVENT
HIRING_SIGNAL
```

---

## 5.4 Opportunity Scoring

评分维度：

```
需求强度
+
时间窗口
+
匹配程度
+
数据可信度
+
推进价值
```

输出：

Opportunity Score

---

# 6. 前端模块

## Discovery Dashboard

展示：

- 今日新增机会
- 高价值机会
- 最新信号
- 全球区域分布

---

## Signal Timeline

展示：

- 信号时间
- 来源
- 事件
- 可信等级

---

## Opportunity Card

字段：

```json
{
 buyer,
 product,
 score,
 why_now,
 source,
 next_step
}
```

---

# 7. API Contract

## 获取发现机会

```
GET /api/v1/discovery/opportunities
```

## 获取信号

```
GET /api/v1/discovery/signals
```

## 获取证据

```
GET /api/v1/evidence/{id}
```

---

# 8. Agent关系

```
Data & Signal Agent
        ↓
Opportunity Discovery Center
        ↓
Research Agent
        ↓
Conversation Agent
```

---

# 9. 验收标准

产品：

- 能发现采购机会
- 能解释为什么值得关注
- 每个判断有证据来源

技术：

- 数据源可替换
- API与爬虫解耦
- Evidence可追溯
- 输出符合Opportunity Contract

