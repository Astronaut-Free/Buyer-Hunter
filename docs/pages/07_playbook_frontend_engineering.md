# QianPulse Playbook 前端页面工程文档 V2.0

## 1. 页面定位

页面名称：Playbook｜成交复盘与经营学习中心

页面目标：把 Mission、Opportunity、渠道、对话与成交结果沉淀成可复用的全球生意开发经验，供下一次任务直接调用。

核心对象：`MissionReview`、`SignalPerformance`、`ChannelPerformance`、`MessagePattern`、`OutcomeLearning`、`PlaybookVersion`。

---

## 2. 页面能力边界

Playbook 负责：

- 复盘哪些商机信号最有效
- 复盘哪些买家类型更容易推进
- 复盘哪些渠道更有效
- 复盘哪些切入角度和话术更有效
- 复盘哪些动作需要人工接管
- 记录赢单与丢单原因
- 生成可复用策略建议
- 管理 Playbook 版本

Playbook 不直接修改生产规则。规则变更必须经过版本确认与发布流程。

---

## 3. 页面结构

```text
Playbook Workspace
├── Review Header
├── Outcome Overview
├── Funnel / Stage Performance
├── Signal Performance
├── Buyer Segment Performance
├── Channel Performance
├── Conversation Pattern Analysis
├── Win / Loss Analysis
├── Human Gate Analysis
├── Recommended Playbook
└── Version / Publish Panel
```

---

## 4. 大组件

### 4.1 Review Header

字段：

- `mission_id`
- `mission_name`
- `review_period`
- `seller_product`
- `target_markets[]`
- `mission_status`
- `playbook_version`

支持按 Mission、产品、市场、时间段切换。

### 4.2 Outcome Overview

指标：

- 发现商机数
- Qualified 数
- Actionable 数
- 已触达数
- 有效回复数
- 报价数
- 寄样数
- 谈判数
- Won 数
- Lost 数
- 长期维护数

### 4.3 Funnel / Stage Performance

组件：`StagePerformance`

展示各阶段转化率、平均停留时间、流失原因和积压情况。

### 4.4 Signal Performance

组件：`SignalPerformanceTable`

按信号类型统计：

- 发现数量
- Qualified 率
- 回复率
- 报价率
- Won 率
- 平均推进周期

标准信号：进口活跃、进口增长、供应商变化、RFQ、招聘、新品、扩张、新闻、准入变化。

### 4.5 Buyer Segment Performance

维度：

- 国家 / 地区
- 产业链角色
- 公司类型
- 公司规模
- 产品场景
- 采购频率
- 供应商结构

输出高价值 Buyer Segment 与低价值 Segment。

### 4.6 Channel Performance

组件：`ChannelPerformance`

渠道：Email、LinkedIn、WhatsApp、Telegram、微信、Voice、Manual。

指标：

- 首次触达数
- 送达 / 可达
- 有效回复
- 平均首次回复时间
- Qualified Conversation
- 人工接管率
- Won 贡献

### 4.7 Conversation Pattern Analysis

分析：

- 有效开场角度
- 常见问题
- 常见异议
- 资料请求模式
- 价格触发点
- 样品触发点
- 需要人工介入的表达
- 长期维护条件

页面展示样例时隐藏敏感客户信息。

### 4.8 Win / Loss Analysis

赢单原因：

- 时机正确
- 供应匹配
- 认证齐全
- 价格
- 交期
- 样品
- 关系推进
- 响应速度

丢单原因：

- 价格
- 规格
- MOQ
- 认证
- 交期
- 已有稳定供应商
- 无真实需求
- 联系人错误
- 市场准入
- 竞争对手

### 4.9 Human Gate Analysis

统计：

- Gate 触发原因
- 人工确认通过率
- 人工修改率
- 人工接管后推进率
- AI 低置信度场景
- 高风险动作分布

用于调整自动化边界。

### 4.10 Recommended Playbook

输出结构：

```text
目标市场
目标 Buyer Segment
优先信号
推荐数据源
推荐渠道
推荐切入角度
首轮触达原则
Follow-up 原则
Human Gate 规则
长期维护规则
成功指标
```

每条建议显示来源样本数量和 Evidence 范围。

### 4.11 Version / Publish Panel

状态：`DRAFT / REVIEW / PUBLISHED / ARCHIVED`。

支持：创建新版本、对比版本、发布到新 Mission、回滚。

---

## 5. API Contract

```http
GET /api/v1/playbooks/reviews?mission_id={id}
GET /api/v1/playbooks/metrics
GET /api/v1/playbooks/signals
GET /api/v1/playbooks/channels
GET /api/v1/playbooks/win-loss
GET /api/v1/playbooks/human-gates
POST /api/v1/playbooks/generate
POST /api/v1/playbooks/{id}/versions
POST /api/v1/playbooks/{id}/publish
POST /api/v1/missions/{mission_id}/apply-playbook
```

---

## 6. 数据 Contract

Playbook 只使用已经发生的业务事件：

```text
Opportunity State Events
Conversation Events
Action Events
Validation Events
Outcome Events
Human Gate Events
```

分析结果区分统计事实、派生指标与 AI 建议。

---

## 7. React 结构

```text
src/pages/Playbook/
├── index.jsx
├── ReviewHeader.jsx
├── OutcomeOverview.jsx
├── StagePerformance.jsx
├── SignalPerformanceTable.jsx
├── BuyerSegmentPerformance.jsx
├── ChannelPerformance.jsx
├── ConversationPatternAnalysis.jsx
├── WinLossAnalysis.jsx
├── HumanGateAnalysis.jsx
├── RecommendedPlaybook.jsx
└── VersionPublishPanel.jsx
```

---

## 8. 验收标准

- 复盘指标能回到真实 Mission / Opportunity / Outcome 数据。
- 可识别高价值信号、渠道与 Buyer Segment。
- 赢单与丢单原因可以结构化沉淀。
- Playbook 建议显示数据覆盖与样本规模。
- 新 Playbook 必须经过版本发布后才能被 Mission 使用。
- 支持版本对比与回滚。