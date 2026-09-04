# QianPulse V2｜真实前端代码映射与实施边界

> 分支：`feature/qianpulse-frontend-v2`
>
> 文档级别：L4 工程实施
>
> 目标：把 V2 PRD、7 个业务组件、7 个前端页面和 9 份 Contract 映射到当前真实运行代码，确定后续只在哪些入口增量改造。

---

# 1. 当前真实运行拓扑

```text
用户
  │
  ├── 公开入口
  │     ↓
  │   site/                         4180
  │     ├── index.html              品牌首页
  │     ├── opportunities.html      全球商机公开页
  │     ├── opportunities-live.js   真实机会数据渲染
  │     └── nav-bridge.js           跳转 Agent 工作台
  │
  ├── 商机决策读取
  │     ↓
  │   api/app.py                    8000 FastAPI
  │     └── runtime/buyer_hunter.db
  │
  └── 登录后经营工作台
        ↓
      agent/                        3317
        ├── index.html              当前前端主工作台
        ├── package.json
        └── server/
            ├── bootstrap.js        真实 Node 启动入口
            ├── index.js            Agent API / Control Plane
            ├── opportunity-workspace.js
            ├── opportunity-workspace-handler.js
            └── A2-A6 Runtime / Providers / Executors
```

## 1.1 已确认的主入口

### `site/`

承担公开产品入口与公开机会展示。

当前真实文件：

- `site/index.html`
- `site/opportunities.html`
- `site/opportunities-live.js`
- `site/nav-bridge.js`

`site/opportunities-live.js` 当前直接读取 FastAPI `8000` 的真实商机决策数据，并保留 API 失败时的静态 Fallback。

`site/nav-bridge.js` 已明确：

```text
site :4180
   ↓
agent :3317/#workspace
```

### `agent/`

承担登录、任务创建、Agent 执行、商机推进、审批、对话和经营状态。

真实启动链：

```text
agent/package.json
  ↓
node server/bootstrap.js
  ↓
agent/server/index.js
```

因此：

- `agent/server/index.js` 是当前 Node Runtime 主入口。
- 根目录旧 `agent/index.js` 不作为 V2 后端主实施入口。
- 前端仍以 `agent/index.html` 为当前工作台基线，后续采用增量拆分。

### `demo/`

当前只保留历史 React 参考代码。

V2 禁止把 `demo/` 重新设为主产品入口。

---

# 2. 当前三层产品表面

V2 保留当前已经跑通的三层表面，避免重建入口。

```text
Surface A｜公开品牌层
site/index.html

Surface B｜公开商机层
site/opportunities.html

Surface C｜登录后经营层
agent/index.html
```

职责边界：

| Surface | Owner | 允许能力 | 禁止承载 |
|---|---|---|---|
| 公开品牌层 | `site/index.html` | 定位、价值、入口 | Agent 状态、私有买家数据 |
| 公开商机层 | `site/opportunities.html` | 公开需求、机会摘要、数据新鲜度 | 联系人、内部评分细节、执行记录 |
| 登录后经营层 | `agent/index.html` | Mission、Opportunity、Buyer、Conversation、Approval、Outcome | 营销型重复页面 |

---

# 3. V2 七个页面 → 当前真实代码映射

## P01 Dashboard 商机驾驶舱

### V2 Owner

`agent/`

### 当前基础

当前 `agent/index.html#workspace` 已具备：

- 左侧任务导航
- AI 机会搜索
- 机会结果表
- Run Timeline
- 实时采集状态
- 企业能力入口
- CRM / 业务工作台入口

### V2 增量

新增统一 Dashboard View：

```text
Dashboard
├── Today Opportunities
├── Pending Actions
├── Pipeline Summary
├── Agent Run Status
├── Approval Queue
└── Outcome Summary
```

### 复用 API

- `GET /api/v1/opportunities`
- `GET /api/v1/collection-runs`
- `GET /api/v1/agent/runs/{run_id}`
- Opportunity Workspace 聚合结果

---

# P02 Opportunity Radar 全球机会雷达

### V2 Owner

公开层：`site/opportunities.html`

经营层：`agent/`

### 当前基础

`site/opportunities-live.js` 已读取：

```text
GET :8000/api/v1/opportunities/today
GET :8000/api/v1/opportunities/recent
```

当前已实现：

- 真实买家显示名
- 真实需求标题
- 数量
- 国家
- Why Now
- 决策状态
- Data Mode / Fallback

### V2 增量

公开页继续承担“发现”。

登录后 Radar 增加：

- Score 排序
- Signal 筛选
- Freshness
- Evidence Count
- Seller Fit
- Market Access
- Priority
- Open Workspace

### Hard Gate

公开页不展示：

- 联系人
- 私有渠道
- 内部审批
- Agent Trace
- 风险调试字段

---

# P03 Opportunity Workspace 商机工作台

### V2 Owner

`agent/`

### 当前后端已存在

```text
GET /api/v1/opportunities/{id}/workspace
```

聚合器：

```text
agent/server/opportunity-workspace.js
```

当前输出已经包含：

- opportunity
- score
- a2
- a6
- next_action
- blockers
- approvals
- activity.runs
- activity.messages
- external_actions
- integration.external_refs
- evidence

### V2 前端目标

直接围绕现有 Workspace Contract 建页面：

```text
Opportunity Workspace
├── OpportunityHeader
├── WhyNowPanel
├── DemandCard
├── BuyerIntelligencePanel
├── SupplierIntelligencePanel
├── MarketAccessPanel
├── EvidencePanel
├── NextActionPanel
├── ApprovalPanel
└── ConversationProgress
```

### 工程原则

Workspace 前端优先消费 `/workspace` 聚合对象，避免每个 Panel 自己拼 Agent State。

---

# P04 Buyer Intelligence 买家情报

### V2 Owner

`agent/`

### 当前基础

当前买家字段分散在：

- Opportunity
- A2 buyer fit
- Buyer entity
- public evidence
- external refs
- access channels
- conversation history

FastAPI 已有：

```text
GET :8000/api/v1/opportunities/{id}/decision
GET :8000/api/v1/opportunities/{id}/access-channels
```

Agent Runtime 已在 Opportunity 中维护 buyer / external refs。

### V2 增量

新增独立 Buyer Intelligence View：

```text
Buyer Intelligence
├── Company Profile
├── Procurement Intelligence
├── Supplier Intelligence
├── Contact Intelligence
├── Business Events
└── Evidence
```

### Contract

只消费 `buyer_contract_v2.md` 统一业务字段。

禁止前端直接引用 Apollo / Trademo / 爬虫 Provider 原始字段。

---

# P05 BD Mission 工作台

### V2 Owner

`agent/`

### 当前基础

`agent/index.html#workspace` 已有自然语言“AI 机会搜索”。

Agent API 已有：

```text
POST /api/v1/agent/nl-targets
POST /api/v1/agent/runs
GET  /api/v1/agent/runs/{run_id}
POST /api/v1/agent/runs/{run_id}/resume
POST /api/v1/collection-runs
GET  /api/v1/collection-runs
```

### V2 增量

将当前“搜索框”升级为 Mission Object 驱动：

```text
Mission Builder
├── Natural Language Goal
├── Target Market
├── Target Buyer
├── Product / Offer
├── Signal Strategy
├── Execution Mode
├── Approval Policy
└── Mission Progress
```

A2 Runtime 继续承担主动买家开发能力，不重写。

---

# P06 Conversation Progression 沟通推进

### V2 Owner

`agent/`

### 当前基础

Agent API 已有：

```text
POST /api/v1/opportunities/{id}/messages
GET  /api/v1/opportunities/{id}/threads
POST /api/v1/approvals/{approval_id}
POST /api/v1/agent/intake
POST /api/v1/agent/chat
POST /api/v1/webhooks/smartlead
```

Runtime 已存在：

- Buyer Message Event
- A6 reply understanding
- changed field routing
- AI reply draft
- Human Approval
- Smartlead Executor
- Outcome update

### V2 增量

前端拆成独立能力模块：

```text
Conversation
├── Timeline
├── Email / IM Message
├── Reply Analysis
├── AI Reply Suggestion
├── Voice Conversation
├── Human Takeover
└── Next Step
```

### Voice 边界

语音对话是 Conversation 内独立组件。

输入：

- opportunity_id
- buyer context
- active conversation

输出：

- transcript
- extracted facts
- buyer intent
- proposed action
- handoff event

Voice 不直接修改 Opportunity 真值；提取内容先进入 Evidence / Event，再由 Runtime 判断状态迁移。

---

# P07 Playbook 成交与复盘

### V2 Owner

`agent/`

### 当前基础

Runtime 已保存：

- runs
- messages
- approvals
- external actions
- a6 outcome
- reverse bridge outcome

当前缺少独立 Playbook 前端。

### V2 增量

```text
Playbook
├── Outcome Review
├── Winning Signals
├── Lost Reasons
├── Channel Performance
├── Message Performance
└── Reusable Playbook
```

Playbook 只从已发生结果学习，禁止把未验证推断写成成交规律。

---

# 4. 当前真实 API → V2 Contract 映射

## 4.1 FastAPI 8000｜商机事实与决策读取

Owner：`api/app.py`

| 当前 API | V2 用途 | Contract |
|---|---|---|
| `GET /api/v1/opportunities/recent` | Radar 最新信号 | Evidence / Opportunity |
| `GET /api/v1/opportunities/today` | Dashboard / Radar 今日机会 | Opportunity |
| `GET /api/v1/opportunities/{id}/decision` | Why Now / Score / Fit / Risk | Opportunity + Evidence |
| `GET /api/v1/opportunities/{id}/brief.pdf` | 商机简报 | Opportunity Projection |
| `GET /api/v1/opportunities/{id}/access-channels` | 已授权触达入口 | Buyer / Channel |
| `GET /health` | Decision Store 健康状态 | System |

FastAPI 继续作为：

```text
Evidence-backed Decision Read Model
```

---

# 4.2 Agent 3317｜经营状态与执行控制面

Owner：`agent/server/index.js`

| 当前 API | V2 用途 | Contract |
|---|---|---|
| `POST /api/v1/auth/register` | 注册 | System |
| `POST /api/v1/auth/login` | 登录 | System |
| `GET /api/v1/opportunities` | 登录用户机会列表 | Opportunity |
| `GET /api/v1/opportunities/{id}/workspace` | 商机聚合工作台 | Frontend Component |
| `GET /api/v1/agent/capabilities` | Agent 能力状态 | System |
| `POST /api/v1/agent/nl-targets` | Mission 自然语言解析 | Mission |
| `POST /api/v1/agent/runs` | Agent 执行 | Mission / State Event |
| `GET /api/v1/agent/runs/{id}` | Run 状态 | State Event |
| `POST /api/v1/agent/runs/{id}/resume` | Checkpoint 恢复 | State Event |
| `POST /api/v1/opportunities/{id}/messages` | 买家消息事件 | Conversation |
| `GET /api/v1/opportunities/{id}/threads` | 对话线程 | Conversation |
| `POST /api/v1/approvals/{id}` | 人工审批 | Conversation / State Event |
| `POST /api/v1/collection-runs` | 实时采集任务 | Mission / Data |
| `GET /api/v1/collection-runs` | 采集状态 | Mission / Data |
| `POST /api/v1/agent/intake` | AI Intake | Mission |
| `POST /api/v1/agent/chat` | 商机上下文对话 | Conversation |
| `POST /api/v1/webhooks/smartlead` | 外部回复回流 | Conversation / Event |
| `GET /api/public/opportunities` | 公开机会投影 | Opportunity Projection |

Agent 继续作为：

```text
Mission + Action + Conversation + Approval + Outcome Runtime
```

---

# 5. 两个后端的 Owner 边界

```text
FastAPI :8000
负责：
Signal / Evidence / Decision Snapshot / Seller Fit / Market Access

Agent :3317
负责：
Mission / Run / Conversation / Approval / External Action / Outcome
```

核心约束：

- Evidence 真值保留来源。
- Opportunity 核心对象保持统一 ID / Bridge 兼容。
- `next_action` 的运行时 Owner 归 A6 / Agent Runtime。
- 前端不得同时创造第二套状态机。
- 页面只消费 Contract，不直接猜测 Provider 数据。

---

# 6. V2 前端代码实施结构

保留现有 `agent/index.html` 可运行基线，采用渐进抽离。

目标目录：

```text
agent/
├── index.html
└── ui-v2/
    ├── api-client.js
    ├── state-store.js
    ├── router.js
    ├── tokens.css
    ├── shell.css
    │
    ├── shared/
    │   ├── score-badge.js
    │   ├── status-tag.js
    │   ├── source-tag.js
    │   ├── evidence-tag.js
    │   └── risk-badge.js
    │
    ├── components/
    │   ├── opportunity-card.js
    │   ├── signal-timeline.js
    │   ├── evidence-panel.js
    │   ├── buyer-profile.js
    │   ├── supplier-graph.js
    │   ├── demand-card.js
    │   ├── market-access-panel.js
    │   ├── next-action-panel.js
    │   ├── conversation-timeline.js
    │   ├── voice-conversation-panel.js
    │   └── human-takeover-panel.js
    │
    └── pages/
        ├── dashboard.js
        ├── opportunity-radar.js
        ├── opportunity-workspace.js
        ├── buyer-intelligence.js
        ├── bd-mission.js
        ├── conversation.js
        └── playbook.js
```

第一阶段不引入新的前端框架依赖，先在当前原生 HTML / JS Runtime 上拆分可运行模块。

原因：当前运行链、鉴权、路由、静态服务器均已打通；先抽组件可降低一次性迁移风险。

---

# 7. 实施顺序

## Phase A｜Shell 与 Contract Adapter

1. `tokens.css`
2. `api-client.js`
3. `state-store.js`
4. `router.js`
5. 统一 loading / error / empty / UNKNOWN

## Phase B｜最高复用业务组件

1. Opportunity Card
2. Evidence Panel
3. Signal Timeline
4. Buyer Profile
5. Demand Card
6. Market Access Panel
7. Next Action Panel

## Phase C｜核心经营页面

1. Dashboard
2. Opportunity Radar
3. Opportunity Workspace
4. Buyer Intelligence
5. BD Mission

## Phase D｜成交推进

1. Conversation Timeline
2. Human Takeover
3. Voice Conversation
4. Playbook

---

# 8. 代码修改范围

允许直接修改：

```text
site/
agent/index.html
agent/ui-v2/
agent/server/（只做 Contract 需要的增量）
api/app.py（只做缺失读接口增量）
docs/
```

默认不改：

```text
demo/
A2-A6 已验证 Runtime 核心算法
现有 Bridge / Store 真值链
```

任何 Runtime 修改必须满足：

- 保留现有测试
- 保留 idempotency
- 保留 Human Gate
- 保留 Evidence Grounding
- 保留 AgentRun / Step / Checkpoint
- 保留 Outcome 回写

---

# 9. 本轮结论

真实实施主线已经确定：

```text
site/ 继续做公开入口与公开 Radar
        ↓
agent/ 成为 V2 登录后唯一经营工作台
        ↓
FastAPI 提供 Evidence-backed Decision Read Model
        ↓
Agent Runtime 负责 Mission / Action / Conversation / Outcome
```

下一工程门：

```text
Shared Design Tokens + API Client
        ↓
Shared Business Components
        ↓
Dashboard / Radar / Workspace
        ↓
Conversation / Voice / Playbook
        ↓
API / Agent 接线验收
```
