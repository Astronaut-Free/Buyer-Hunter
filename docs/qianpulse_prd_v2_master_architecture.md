# QianPulse PRD V2 总纲

## 1. 产品定位

全球商机经营智能平台

> 让 AI 24 小时出去找生意，把一条采购机会一路跟到成交。

目标用户：

面向中国制造企业和出口企业的 AI 全球生意开发平台。

核心流程：

```
发现海外采购需求
        ↓
研究买家
        ↓
判断机会
        ↓
主动联系
        ↓
持续推进对话
        ↓
报价 / 寄样 / 谈判
        ↓
成交
```

---

# 2. 产品金字塔

## L0 产品层

AI 全球商机经营平台

核心对象：Opportunity

```
数据
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

# 3. L1 大组件层

## 组件1：商机发现中心 Opportunity Discovery

职责：发现全球正在发生的采购机会。

输入：

- API 数据
- 爬虫数据
- 用户输入
- 企业资料

输出：

- 商机对象
- 信号
- 证据

---

## 组件2：买家情报中心 Buyer Intelligence

职责：理解买家。

能力：

- 企业画像
- 产业链角色
- 产品分析
- 联系人分析
- 企业动态

---

## 组件3：商机判断中心 Opportunity Intelligence

职责：判断是否值得推进。

能力：

- 机会评分
- 采购时机判断
- 供需匹配
- 风险判断

---

## 组件4：BD Mission 工作台

职责：执行全球生意开发任务。

能力：

- 创建任务
- 目标市场定义
- 目标对象定义
- 执行策略

---

## 组件5：多渠道触达中心 Channel Hub

职责：建立商务关系。

渠道：

- Email
- LinkedIn
- WhatsApp
- Telegram
- 微信
- 展会
- 社群

---

## 组件6：Conversation Progression

职责：持续推进商务对话。

能力：

- 回复理解
- 意向判断
- 下一步建议
- 人工接管

---

## 组件7：成交与复盘中心 Playbook

职责：沉淀成交经验。

能力：

- 成功因素分析
- 数据源分析
- 渠道分析
- 话术优化

---

# 4. L2 模块层

## 商机发现组件

模块：

- 全球需求雷达
- RFQ 监控
- 贸易信号
- 企业动态监控
- 新闻信号
- 招聘信号

---

## 买家情报组件

模块：

- 公司画像
- 供应链画像
- 联系人画像
- 企业事件

---

## 商机判断组件

模块：

- Opportunity Score
- Why Now
- Evidence Panel
- Seller Fit
- Market Access

---

## 沟通组件

模块：

- 语音对话
- Email 对话
- IM 对话
- 回复分析
- AI 回复建议

---

# 5. 组件边界原则

每个组件拥有独立能力。

组件之间通过 Contract 连接。

例如：

```
Discovery Component
        ↓
Opportunity Contract
        ↓
Conversation Component
        ↓
Outcome Contract
```

禁止：

- 页面直接调用数据源
- 组件直接依赖其他组件内部状态
- 前端绑定具体供应商字段

---

# 6. 数据架构原则

数据来源：

```
API
+
Crawler
+
Browser Agent
+
User Input
```

统一进入：

```
Evidence Layer
```

再生成：

```
Opportunity
```

---

# 7. 工程文档拆分

后续每个大组件独立工程文档：

```
docs/components/

01_opportunity_discovery.md
02_buyer_intelligence.md
03_opportunity_intelligence.md
04_bd_mission.md
05_channel_hub.md
06_conversation_progression.md
07_playbook.md
```

每份组件文档包含：

- 产品目标
- 能力边界
- 用户流程
- 前端页面
- 子模块
- 数据模型
- API Contract
- Agent Skill
- 验收标准

---

# 8. 开发顺序

Phase 1

- Opportunity Discovery
- Opportunity Workspace
- Buyer Intelligence

Phase 2

- Signal Engine
- Channel Hub
- Conversation

Phase 3

- 自动推进
- Playbook
- 数据闭环
