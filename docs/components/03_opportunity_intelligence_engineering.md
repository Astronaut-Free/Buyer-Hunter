# QianPulse Opportunity Intelligence Center Engineering

## 1. Component定位

组件名称：商机判断中心

职责：将发现的对象和数据证据转化为可推进的商业判断。

输入：

- Opportunity Candidate
- Buyer Intelligence
- Demand
- Evidence
- Signal

输出：

- Opportunity Score
- Why Now
- Risk
- Next Action

---

## 2. 能力边界

负责：

- 商机评分
- 采购时机判断
- 供需匹配判断
- 风险识别
- 下一步动作推荐

不负责：

- 数据采集
- 主动触达
- 对话执行
- 合同成交

---

## 3. 核心流程

Signal
↓
Evidence
↓
AI Analysis
↓
Opportunity Score
↓
Action Recommendation

---

## 4. 子模块

### Opportunity Scoring

输入：

- 需求强度
- 时间窗口
- 买家匹配度
- 联系可达性
- 市场准入

输出：

0-100 商机评分。

---

### Why Now Engine

回答：

为什么现在值得联系？

依据：

- 新采购记录
- 进口增长
- 供应商变化
- 企业事件

---

### Risk Assessment

识别：

- 数据不足
- 认证缺口
- 市场限制
- 商业风险

---

### Next Action Planner

输出：

- 联系对象
- 联系渠道
- 沟通建议
- 下一步时间

---

## 5. 前端模块

- OpportunityScoreCard
- WhyNowPanel
- EvidencePanel
- RiskPanel
- ActionPanel

---

## 6. 数据契约

输入：

Evidence Contract
Opportunity Contract

输出：

Opportunity Decision Contract

---

## 7. API

GET /api/v1/opportunities/{id}/decision

POST /api/v1/opportunities/{id}/next-action

---

## 8. Agent关系

关联：

- A3 Purchase Timing
- A4 Supply Match
- A5 Trade Risk

---

## 9. 验收标准

用户可以看到：

- 为什么值得追
- 依据是什么
- 风险在哪里
- 下一步做什么
