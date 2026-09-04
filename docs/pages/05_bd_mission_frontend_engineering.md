# QianPulse BD Mission 前端页面工程文档 V2.0

## 1. 页面定位

页面名称：BD Mission Workspace｜全球生意开发任务空间

页面目标：让用户用自然语言定义一项真实的全球生意开发任务，系统自动解析目标、数据源、筛选规则、执行边界和成功标准，并持续展示任务执行状态。

核心对象：`Mission`、`MissionTarget`、`ExecutionPlan`、`MissionRun`。

---

## 2. 页面能力边界

BD Mission 负责：

- 创建任务
- 解析目标市场与目标对象
- 配置产品与卖方能力上下文
- 选择数据来源与搜索策略
- 配置自动化边界
- 启动 / 暂停 / 恢复任务
- 查看任务执行进度
- 汇总 Mission 产生的 Opportunity

具体买家研究、商机判断、外联执行和对话推进分别由对应组件承担。

---

## 3. 页面结构

```text
BD Mission Workspace
├── Mission Header
├── Natural Language Mission Builder
├── Parsed Mission Contract
├── Seller Context
├── Target Definition
├── Data Source Plan
├── Execution Policy
├── Agent Run Timeline
├── Opportunity Output
├── Human Gate Queue
└── Mission Health
```

---

## 4. 大组件

### 4.1 Mission Header

字段：

- `mission_id`
- `mission_name`
- `status`
- `owner`
- `created_at`
- `started_at`
- `last_run_at`
- `progress`

状态：`DRAFT / READY / RUNNING / PAUSED / WAITING_HUMAN / COMPLETED / FAILED`。

### 4.2 Natural Language Mission Builder

组件：`MissionPromptComposer`

输入示例：

> 帮我找美国和加拿大正在采购抹茶原料的品牌商和食品企业，优先进口增长、正在换供应商、有新品的公司，先研究和触达，高价值首次联系需要我确认。

支持：文本输入、模板、语音输入入口、历史 Mission 复用。

### 4.3 Parsed Mission Contract

系统解析字段：

- `target_markets[]`
- `target_industries[]`
- `target_roles[]`
- `products[]`
- `hs_codes[]`
- `signal_preferences[]`
- `exclusion_rules[]`
- `recommended_sources[]`
- `recommended_channels[]`
- `success_metrics[]`

用户确认后形成 Mission Contract。

### 4.4 Seller Context

展示并选择：

- 企业
- 产品 / SKU
- 规格
- MOQ
- 产能
- 价格带
- 认证
- OEM 能力
- 出口市场
- 可发送资料

缺少关键资料时 Mission 进入 `WAITING_SELLER_CONTEXT`。

### 4.5 Target Definition

组件：`TargetDefinitionPanel`

支持：国家、行业、产业链角色、公司规模、采购信号、排除条件、优先级权重。

### 4.6 Data Source Plan

组件：`DataSourcePlan`

数据来源同时支持：

- API Provider
- Crawler
- Browser Agent
- Search / News
- 用户上传
- 历史客户数据

字段：`source_type`、`provider`、`coverage`、`freshness`、`cost_level`、`status`。

### 4.7 Execution Policy

自动化模式：

```text
AUTOPILOT
ASSISTED
HUMAN_TAKEOVER
```

配置项：

- 首次触达是否需要审批
- 价格相关动作
- 报价
- 寄样
- 合同 / 条款
- 高价值买家
- 低置信度场景
- 不可承诺内容

### 4.8 Agent Run Timeline

组件：`MissionRunTimeline`

阶段：

```text
DISCOVER
RESEARCH
QUALIFY
CONTACT
CONVERSATION
ADVANCE
OUTCOME
```

每一步显示 Agent / SKILL、开始时间、完成时间、结果、失败原因、重试状态和 Evidence。

### 4.9 Opportunity Output

组件：`MissionOpportunityList`

展示 Mission 产出的 Candidate、Qualified、Actionable Opportunity，并支持进入详情。

### 4.10 Human Gate Queue

集中展示等待用户确认的动作、原因、建议和截止时间。

### 4.11 Mission Health

指标：

- 数据覆盖率
- 数据源健康度
- 新商机数
- Qualified 数
- 已触达数
- 回复数
- 待人工数
- 当前失败步骤
- 最近一次成功 Run

---

## 5. API Contract

```http
POST /api/v1/missions/parse
POST /api/v1/missions
GET /api/v1/missions/{id}
POST /api/v1/missions/{id}/start
POST /api/v1/missions/{id}/pause
POST /api/v1/missions/{id}/resume
GET /api/v1/missions/{id}/runs
GET /api/v1/missions/{id}/opportunities
GET /api/v1/missions/{id}/human-gates
PATCH /api/v1/missions/{id}/policy
```

---

## 6. React 结构

```text
src/pages/MissionWorkspace/
├── index.jsx
├── MissionHeader.jsx
├── MissionPromptComposer.jsx
├── ParsedMissionContract.jsx
├── SellerContext.jsx
├── TargetDefinitionPanel.jsx
├── DataSourcePlan.jsx
├── ExecutionPolicy.jsx
├── MissionRunTimeline.jsx
├── MissionOpportunityList.jsx
├── HumanGateQueue.jsx
└── MissionHealth.jsx
```

---

## 7. 验收标准

- 用户可用自然语言创建 Mission。
- 解析结果可修改并形成可审计 Contract。
- Mission 可以暂停、恢复和查看 Run 历史。
- 数据源计划同时容纳 API 与爬虫能力。
- 高风险动作会进入 Human Gate。
- Mission 产生的 Opportunity 可以进入后续经营链。