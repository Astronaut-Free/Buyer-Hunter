# QianPulse PRD V2.0 Master｜全球商机经营智能平台

> 文档角色：产品唯一总纲。组件工程文档、页面工程文档、Contract 与代码实现均以本文件为上位约束。

## 0. 文档基线

- Repository：`Astronaut-Free/Buyer-Hunter`
- Development Branch：`feature/qianpulse-frontend-v2`
- Stable Baseline：`main`
- 产品核心对象：`Opportunity`
- 现有工程基础：Buyer-Hunter 前端、Opportunity Store、Evidence、Agent Runtime、A2-A6 SKILL Runtime、Human Gate、状态与审计能力

---

# 1. 产品定位

## 1.1 品类定位

**全球商机经营智能平台**

## 1.2 核心承诺

> **让 AI 24 小时出去找生意，把一条采购机会一路跟到成交。**

## 1.3 完整定位

面向中国制造企业和出口企业的 AI 全球生意开发平台，自动发现海外采购需求、寻找并触达买家、判断采购机会，并持续推进跟进、报价、寄样和成交。

## 1.4 核心客户

第一阶段服务具备明确产品与供给能力、希望持续拓展海外市场的企业：

- 制造企业
- 工贸企业
- 食品与农产品加工企业
- 原料与配料供应企业
- 消费品企业
- 出口企业
- 品牌出海企业

首批验证场景继续以贵州抹茶及现有 Buyer-Hunter 数据链路为基线，产品架构保持行业可扩展。

---

# 2. 用户要完成的工作

企业拥有产品、产能、认证、价格和交期等供给能力后，需要持续完成：

```text
知道哪里正在买
        ↓
识别哪些买家值得追
        ↓
查清买家与采购关系
        ↓
找到负责采购的人
        ↓
选择合适渠道建立联系
        ↓
理解买家回复和条件变化
        ↓
动态调整下一步动作
        ↓
报价 / 寄样 / 谈判 / 关键承诺
        ↓
成交或进入长期经营
```

QianPulse 将重复研究、监控、判断、低风险触达和持续跟进交给 AI；正式报价、合同、付款、独家、分成和高风险承诺进入 Human Gate。

---

# 3. 产品终局对象：Opportunity

## 3.1 Opportunity 定义

Opportunity 是一笔持续变化、持续被经营的全球采购商机。

```text
Opportunity
=
Buyer
+ Demand
+ Signals
+ Evidence
+ Buying Window
+ Seller Fit
+ Market Access
+ Contacts
+ Conversation
+ Actions
+ Outcome
```

## 3.2 Opportunity 生命周期

```text
DISCOVERED
    ↓
RESEARCHING
    ↓
QUALIFIED
    ↓
ACTIONABLE
    ↓
CONTACTED
    ↓
REPLIED
    ↓
QUOTE
    ↓
SAMPLE
    ↓
NEGOTIATION
    ↓
WON / LOST / LONG_TERM
```

状态变化必须由业务事件驱动并保留审计记录。

## 3.3 Opportunity 的四类信息

### FACT
原始来源直接支持的事实。

### DERIVED
规则、聚合或计算得到的结果。

### INFERENCE
AI 推断，必须标记置信度与 Evidence。

### ACTION / VALIDATION
经营动作，以及回复、报价、寄样、成交等真实业务结果。

---

# 4. 产品金字塔

```text
L0  全球商机经营智能平台
│
├─ L1-01 商机发现中心
├─ L1-02 买家情报中心
├─ L1-03 商机判断中心
├─ L1-04 BD Mission 工作台
├─ L1-05 多渠道触达中心
├─ L1-06 Conversation Progression
└─ L1-07 Playbook / 经营学习

每个 L1 组件
    ↓
L2 子模块
    ↓
L3 UI / Tool / SKILL / Adapter
```

组件之间通过 Contract 交换业务对象，组件内部实现保持独立。

---

# 5. L1-01 商机发现中心

## 5.1 目标

持续发现全球正在发生的采购需求和采购变化，将外部数据加工成 Evidence、Signal 和 Opportunity Candidate。

## 5.2 数据输入

数据获取采用并行来源：

```text
API Provider
+
Crawler
+
Browser Agent
+
Search / RSS
+
User Upload
+
Manual Entry
+
Communication Events
```

API 与爬虫均属于 Data Source Adapter，允许互为补充和兜底。

## 5.3 核心信号

P0/P1 优先：

1. 正在进口同类产品 `IMPORT_ACTIVE`
2. 进口量 / 频率增长 `IMPORT_GROWTH`
3. 供应商变化 `SUPPLIER_CHANGE`
4. RFQ / 主动采购需求 `RFQ_POSTED`
5. 招聘采购 / 寻源岗位 `HIRING_PURCHASER`
6. 新品、扩张、市场进入等企业事件 `BUSINESS_EVENT`
7. 行业与法规变化 `REGULATION_CHANGE`

## 5.4 统一数据流

```text
Source Adapter
↓
Raw Evidence
↓
Parser / Normalizer
↓
Entity Resolution
↓
Dedup
↓
Signal Detection
↓
Opportunity Candidate
```

---

# 6. L1-02 买家情报中心

## 6.1 目标

查清买家主体、产业链角色、采购行为、供应商关系、联系人与企业变化。

## 6.2 核心字段

### 企业画像

- 公司名称
- 官网
- 国家 / 地址
- 公司类型
- 产业链角色
- 规模
- 主营产品
- 商业模式
- 销售渠道
- 目标市场

### 采购行为

- 采购品类
- HS Code
- 最近采购时间
- 采购次数 / 频率
- 采购量趋势
- 来源国家
- 当前供应商
- 主要供应商
- 新增 / 流失供应商

### 联系人

- 姓名
- 职位
- 部门
- seniority
- role fit
- Email / 电话 / LinkedIn / 公开渠道
- 联系渠道可用性

### 企业事件

- 新品
- 扩张
- 招聘
- 展会
- 渠道变化
- 融资
- 高管变化

---

# 7. L1-03 商机判断中心

## 7.1 目标

回答四个核心判断：

1. 现在是否存在采购窗口？
2. 这家买家与我方具体产品是否匹配？
3. 目标市场能否进入？
4. 今天应采取什么动作？

## 7.2 Opportunity Score

建议保持可解释结构：

```text
Intent / Buying Window
+
Seller Fit
+
Market Access
+
Reachability
+
Evidence Quality
-
Risk Penalty
```

评分只用于排序，Hard Gate 拥有更高优先级。

## 7.3 Hard Gate

- 无原始来源：采购事实不可成立
- 买家主体未确认：不得进入高优机会
- 只有历史采购、近期无变化：降低时机等级
- 供需硬条件冲突：阻断或降级
- 市场准入 BLOCK：禁止生成可直接执行的报价动作
- 关键事实缺失：进入 MORE_EVIDENCE / UNKNOWN

## 7.4 Why Now

每个高优 Opportunity 至少输出：

- 近期变化
- 变化时间
- 来源
- Evidence
- 对机会的影响

---

# 8. L1-04 BD Mission 工作台

## 8.1 目标

用户用自然语言给 AI 下达真实的全球生意开发任务。

示例：

> 帮我找美国和加拿大正在采购抹茶原料的品牌商和食品企业，优先进口增长、供应商变化、有新品的公司，高价值首次联系需要我确认。

## 8.2 Mission Contract

系统解析并让用户确认：

- 目标市场
- 目标行业
- 目标对象类型
- 卖方 SKU
- 目标信号
- 排除规则
- 数据源计划
- 推荐渠道
- 自动化边界
- Human Gate
- 成功指标

## 8.3 Mission Run

```text
DISCOVER
↓
RESEARCH
↓
QUALIFY
↓
CONTACT
↓
CONVERSATION
↓
ADVANCE
↓
OUTCOME
```

每一步保留 Run、Step、Checkpoint 与失败原因。

---

# 9. L1-05 多渠道触达中心

## 9.1 目标

根据买家、联系人、关系阶段和风险等级选择渠道并执行商务触达。

## 9.2 渠道矩阵

| 渠道 | P0/P1执行方式 | 长期能力 |
|---|---|---|
| Email | API / 授权发送 | 自动同步回复、线程管理 |
| LinkedIn | 生成话术 / Browser Agent | 授权插件或平台能力 |
| WhatsApp | 生成话术 / 手动发送 | Business API |
| Telegram | Bot / 手动 | Bot 自动化 |
| 微信 / 企微 | 生成话术 / 手动 | 深度集成 |
| Voice | 语音助手 / 人工通话辅助 | Voice Agent |
| 展会 / 社群 | 生成切入与记录 | Browser / Partner Integration |

## 9.3 三层自动化

### AUTOPILOT
低风险、标准化动作自动执行。

### ASSISTED
系统准备动作，用户确认后执行。

### HUMAN_TAKEOVER
高风险、高价值和复杂商务场景由人工接管。

---

# 10. L1-06 Conversation Progression

## 10.1 目标

买家回复后持续理解对方身份、意向、阶段和关心点，更新 Opportunity，并产生下一步动作。

## 10.2 多渠道统一 Conversation Contract

```text
Email
LinkedIn
WhatsApp
Telegram
WeChat
Voice
Manual Entry
        ↓
Conversation Thread
        ↓
Fact Observations
Intent State
Next Action
Human Gate
```

## 10.3 语音对话模块

语音属于 Conversation 大组件下的独立能力模块：

- Speech To Text
- Speaker / Role Detection
- Live Transcript
- Intent Extraction
- Key Fact Extraction
- Response Assist
- Text To Speech
- Call Summary
- Human Takeover

语音产生的事实和意向进入统一 Conversation Contract。

## 10.4 动态推进

买家可能触发：

- 要资料
- 问规格
- 问认证
- 问价格
- 要样品
- 确认采购计划
- 引荐负责人
- 暂时无需求
- 拒绝
- 退订

系统根据上下文选择下一步，避免固定时间 Sequence 成为主逻辑。

---

# 11. L1-07 Playbook / 经营学习

## 11.1 目标

将真实业务结果沉淀为下一次 Mission 可复用的经验。

## 11.2 学习对象

- 哪些信号带来 Qualified Opportunity
- 哪类 Buyer Segment 更容易推进
- 哪些数据源有效
- 哪些渠道有效
- 哪些切入角度有效
- 哪些异议最常见
- 哪些情况需要 Human Gate
- 赢单原因
- 丢单原因

## 11.3 发布机制

Playbook 状态：

```text
DRAFT → REVIEW → PUBLISHED → ARCHIVED
```

生产 Mission 只使用已发布版本，并支持回滚。

---

# 12. 前端信息架构

```text
01 Dashboard｜商机经营驾驶舱
02 Opportunity Radar｜全球机会雷达
03 Opportunity Workspace｜商机工作台
04 Buyer Intelligence｜买家情报中心
05 BD Mission Workspace｜生意开发任务空间
06 Conversation Progression｜商务对话推进
07 Playbook｜成交复盘与经营学习
```

页面详细工程规范位于 `docs/pages/`。

---

# 13. 前端组件分层

## L1 Page

- Dashboard
- OpportunityRadar
- OpportunityWorkspace
- BuyerIntelligence
- MissionWorkspace
- Conversation
- Playbook

## L2 Business Component

- OpportunityCard
- WhyNowPanel
- DemandCard
- SignalTimeline
- EvidencePanel
- BuyerProfile
- ContactList
- TradeIntelligence
- SupplierGraph
- SellerFit
- MarketAccess
- ActionPanel
- ConversationTimeline
- ReplyComposer
- VoiceConversation
- HumanTakeoverPanel

## L3 Common UI

- ScoreBadge
- StatusTag
- SourceTag
- FactLevelTag
- RiskBadge
- FreshnessTag
- TimelineItem
- EmptyState
- ErrorState

---

# 14. 数据与后端原则

## 14.1 数据源解耦

前端消费业务 Contract；数据源 Adapter 可独立替换。

```text
API / Crawler / Browser Agent / User Input
                    ↓
              Evidence Layer
                    ↓
              Domain Objects
                    ↓
                 API/BFF
                    ↓
                 Frontend
```

## 14.2 核心业务对象

- Seller
- Buyer
- Contact
- Demand
- Evidence
- Signal
- SupplierRelation
- MarketAccess
- SellerFit
- Opportunity
- Mission
- ConversationThread
- Message
- Action
- HumanGate
- ValidationEvent
- Outcome
- Playbook

---

# 15. Agent / SKILL 对齐

继续复用现有 Buyer-Hunter Runtime，不并行重建第二套 Runtime。

当前核心映射：

| 现有能力 | V2 产品能力 |
|---|---|
| A2 Buyer Discovery / Outreach | 买家发现、联系人、首次触达 |
| A3 Purchase Timing | Buying Window / Why Now |
| A4 Supply Match | Seller Fit |
| A5 Trade Risk | Market Access / Risk |
| A6 Buyer Reply / Follow-up | Conversation Progression |
| Human Gate | 审批与人工接管 |
| Opportunity Store | 商机真值对象 |
| AgentRun / Step / Checkpoint | Mission / Conversation 审计 |

新能力优先通过新增 SKILL、Adapter、Tool 和 Contract 扩展。

---

# 16. 核心用户角色

## Owner / 企业管理员

企业资料、卖方知识库、成员、渠道授权、风险规则。

## Manager / 销售负责人

创建 Mission、调整策略、查看高价值商机、审批关键动作。

## Closer / 销售执行与成交负责人

接管高价值机会、报价、寄样、谈判与关键承诺。

## Viewer

只读查看商机、Mission 和经营复盘。

---

# 17. 核心指标

产品指标围绕“商机经营质量”：

- 新 Opportunity 数
- Qualified Opportunity 数
- Actionable Opportunity 数
- 有效商务对话数
- 买家有效回复率
- 报价数
- 寄样数
- 谈判数
- Won / Lost
- 从发现到首次动作的时间
- 从回复到下一步动作的时间
- Human Gate 命中率
- 数据覆盖率
- Evidence 新鲜度
- Playbook 可复用率

发送量、打开率、会议数作为辅助指标。

---

# 18. P0 / P1 / P2 迭代

## P0｜现有代码增量升级

目标：跑通“发现 → 判断 → 触达 → 回复 → 推进”的真实轻量闭环。

- Opportunity Dashboard
- Opportunity Workspace
- Buyer Intelligence
- 现有 A2-A6 字段前端化
- Evidence / Why Now 可视化
- Mission 基础创建
- Email 与手动渠道 Conversation
- Next Action + Human Gate
- 报价 / 寄样状态记录

## P1｜数据与多渠道增强

- Opportunity Radar
- 多数据源 Adapter
- Crawler / Browser Agent
- Supplier Intelligence
- LinkedIn / WhatsApp / Telegram 半自动与授权集成
- 企业事件持续监控
- Voice Conversation Assist
- Playbook V1

## P2｜持续经营与平台化

- 跨渠道自动编排
- Voice Agent
- 更深的供应链图谱
- 数据源 Marketplace
- 自定义 SKILL
- Partner / Agency Portal
- 多企业与私有化能力

---

# 19. 产品边界

当前版本聚焦全球 B2B 商机经营。以下方向不进入产品中心：

- 重型通用 CRM
- 单纯联系人数据库
- 单纯邮件群发
- 固定 Sequence 驱动的销售自动化
- 仅做内容生成
- 仅做会议预约
- 无 Evidence 的黑箱成交概率
- 无 Human Gate 的高风险自动承诺

---

# 20. 验收总则

## 产品验收

用户能够：

1. 找到当前值得推进的全球采购机会。
2. 理解 Why Now 与原始 Evidence。
3. 查看买家、联系人、供应商与采购需求。
4. 判断供需匹配与市场准入。
5. 选择或执行合适的触达动作。
6. 在收到回复后持续推进。
7. 管理报价、寄样、谈判和人工接管。
8. 将结果沉淀到 Playbook。

## 工程验收

- 继续基于现有 Buyer-Hunter Runtime 演进。
- `main` 仅作为稳定基线，开发发生在 feature 分支。
- 页面、组件、数据源通过 Contract 解耦。
- 所有采购关键事实可以追溯 Evidence。
- UNKNOWN、冲突、失败和 Human Gate 均有明确状态。
- 新数据源可通过 Adapter 接入，无需重构前端业务对象。

---

# 21. 正式文档树

```text
docs/
├── qianpulse_prd_v2_master.md              # 唯一产品总纲
├── components/                              # L1组件工程文档
│   ├── 01_opportunity_discovery_center_engineering.md
│   ├── 02_buyer_intelligence_center_engineering.md
│   ├── 03_opportunity_intelligence_engineering.md
│   ├── 04_bd_mission_workspace_engineering.md
│   ├── 05_channel_hub_engineering.md
│   ├── 06_conversation_progression_engineering.md
│   └── 07_playbook_engineering.md
└── pages/                                   # 前端页面工程文档
    ├── 01_dashboard_frontend_engineering.md
    ├── 02_opportunity_radar_frontend_engineering.md
    ├── 03_opportunity_workspace_frontend_engineering.md
    ├── 04_buyer_intelligence_frontend_engineering.md
    ├── 05_bd_mission_frontend_engineering.md
    ├── 06_conversation_frontend_engineering.md
    └── 07_playbook_frontend_engineering.md
```

Contract 文档在工程实施阶段统一进入 `docs/contracts/`，并以本 PRD 的业务对象与状态定义为上位约束。