# QianPulse PRD V2 Master

## L0 产品定位

全球商机经营智能平台

让 AI 24 小时出去找生意，把一条采购机会一路跟到成交。

面向中国制造企业和出口企业，自动发现海外采购需求、寻找并触达买家、判断采购机会，并持续推进跟进、报价、寄样和成交。

---

# L1 产品架构

## 核心对象

Opportunity 商机对象

```text
需求信号
 ↓
买家研究
 ↓
机会判断
 ↓
主动联系
 ↓
对话推进
 ↓
成交结果
```

---

# L2 核心组件

## 01 商机发现中心

职责：发现全球采购机会。

输入：
- API数据
- 爬虫数据
- 用户输入

输出：
- Evidence
- Opportunity Candidate

---

## 02 买家情报中心

职责：理解买家。

能力：
- 企业画像
- 产业链角色判断
- 联系人发现
- 企业动态分析

---

## 03 商机判断中心

职责：判断机会价值。

能力：
- 信号分析
- 机会评分
- Why Now
- 下一步动作

---

## 04 BD Mission 工作台

职责：让用户给 AI BD 团队下达任务。

能力：
- 市场目标
- 对象规则
- 执行策略
- 人工接管规则

---

## 05 渠道中心

职责：建立商务关系。

渠道：
- Email
- LinkedIn
- WhatsApp
- Telegram
- 微信

---

## 06 Conversation Progression

职责：持续推进商务对话。

能力：
- 回复理解
- 意向判断
- 下一步建议
- AI回复生成
- 人工接管

---

## 07 Playbook

职责：沉淀成交经验。

能力：
- 有效信号分析
- 渠道分析
- 话术分析
- 成交复盘

---

# 工程原则

## 数据解耦

```text
API
+
Crawler
+
User Input

↓

Evidence

↓

Opportunity

↓

Action

↓

Outcome
```

## 组件边界

每个组件拥有独立：

- 输入
- 输出
- 数据模型
- API Contract
- Agent能力

组件之间通过 Contract 连接。

---

# 开发顺序

P0:

1. Opportunity Workspace
2. Buyer Intelligence
3. Signal Engine
4. BD Mission
5. Conversation

P1:

6. 多渠道执行
7. 自动化推进
8. Playbook学习
