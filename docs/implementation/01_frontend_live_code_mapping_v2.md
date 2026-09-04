# QianPulse V2｜真实前端代码映射工程文档

> 分支：`feature/qianpulse-frontend-v2`
>
> 目的：把 V2 PRD、组件工程文档、页面工程文档和 Contract 映射到当前真实代码，明确哪些代码保留、哪些增量升级、哪些仅作历史参考。

---

# 0. 结论

当前可运行产品由三部分组成：

```text
site/ 4180
门户首页 + 全球商机公开页
        ↓
agent/ 3317
登录 + 工作台 + A2-A6 Runtime + 对话 + 审批 + 采集
        ↓
api/ 8000
公开需求 / 商机判断 / 机会详情 / 决策数据
```

`demo/` 已退役，只保留为历史参考代码，不作为 V2 主实施入口。

V2 前端实施目标：

```text
保留 site/ 门户
保留 agent/ Runtime 与 API
保留现有 Opportunity / Evidence / A2-A6 链路

在 agent/ 上增量拆出 V2 页面和组件
```

禁止重新建设一套平行前端。

---

# 1. 当前真实入口

## 1.1 site/｜门户层

当前文件：

```text
site/
├── index.html
├── opportunities.html
├── opportunities-live.js
├── nav-bridge.js
├── PROVENANCE.md
├── README.md
└── assets/
```

### `site/index.html`

职责：

- 黔脉门户首页
- 品牌定位
- 产品价值表达
- 进入全球商机页

V2 处理：

- 保留
- 只做品牌与入口升级
- 不承载登录后的复杂业务工作台

### `site/opportunities.html`

职责：

- 全球商机公开展示
- 今日机会预览
- 近期采购信号
- 公开商机入口

现状：静态页面主体 + `opportunities-live.js` 动态覆盖真实数据。

V2 映射：

```text
Opportunity Radar Public View
```

处理：

- 保留现有视觉资产
- 保留公开商机预览能力
- 增加统一 Opportunity Card 字段
- 登录后深度操作跳转 Agent 工作台

### `site/opportunities-live.js`

当前真实数据接口：

```text
GET http://127.0.0.1:8000/api/v1/opportunities/today
GET http://127.0.0.1:8000/api/v1/opportunities/recent
```

当前作用：

- 覆盖静态样例卡片
- 展示真实 buyer_display_name
- 展示 demand_title
- 展示 quantity
- 展示 why_now
- 展示 decision_status
- 展示 data_mode

数据规则保留：

- 无事实字段显示 `—`
- buyer 名称不编造
- Opportunity ID 使用真实 ID
- API 不可用时才进入 FALLBACK

### `site/nav-bridge.js`

当前正式入口桥：

```text
site:4180
  ↓
agent:3317/#auth
agent:3317/#workspace
```

V2 处理：保留。

该文件已经明确 `demo/4173` 退役。

---

# 2. agent/｜登录后主产品层

当前关键代码：

```text
agent/
├── index.html
├── server/
│   ├── index.js
│   ├── opportunity-workspace.js
│   ├── opportunity-workspace-handler.js
│   ├── a2a6-live-runtime.js
│   ├── agent-conversation.js
│   ├── collection-runner.js
│   └── ...
├── skill-runtime/
├── providers/
├── db/
└── reference/
```

## 2.1 `agent/index.html`

当前状态：

- 登录页
- 企业入驻对话
- AI 工作台
- 实时采集
- 商机结果表
- 商机问答
- Run / Agent 状态
- 多个业务功能

目前大量 CSS、DOM、状态和 API 调用集中在单个 HTML 文件。

核心风险：

```text
页面结构
+ 样式
+ 数据请求
+ 状态
+ 业务规则
+ 组件渲染
```

集中在一个文件，继续叠加会增加修改风险。

V2 不一次性重写。

采用增量拆分：

```text
现有 index.html 保持可运行
        ↓
逐步抽出 shared core
        ↓
逐步抽出 business components
        ↓
逐步形成 pages
        ↓
最后让 index.html 只承担壳层与入口
```

---

# 3. 当前 Agent API 映射

当前 3317 已存在的接口直接复用。

## 3.1 认证

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

映射：

```text
Auth Shell
Seller Workspace
Internal Workspace
```

---

## 3.2 Opportunity

```text
GET /api/v1/opportunities
GET /api/v1/opportunities/{id}/workspace
```

`workspace` 已经聚合：

- opportunity
- score
- A2
- A6
- next_action
- blockers
- approvals
- activity.runs
- activity.messages
- external_actions
- external_refs
- evidence

V2 `Opportunity Workspace` 优先消费该聚合接口，减少页面跨 API 拼装。

---

## 3.3 Agent Run

```text
POST /api/v1/agent/runs
GET  /api/v1/agent/runs/{run_id}
POST /api/v1/agent/runs/{run_id}/resume
GET  /api/v1/agent/runs/{run_id}/trace
```

映射：

- BD Mission
- Agent Execution
- Runtime Timeline
- Checkpoint
- Human Gate

---

## 3.4 Conversation

```text
POST /api/v1/opportunities/{id}/messages
GET  /api/v1/opportunities/{id}/threads
POST /api/v1/agent/chat
POST /api/v1/agent/intake
```

映射：

- Conversation Timeline
- Buyer Reply
- Seller Conversation
- AI Advisor
- Seller Intake

---

## 3.5 Approval

```text
POST /api/v1/approvals/{approval_id}
```

映射：

- Human Takeover
- External Action Approval
- Reply Approval
- Outreach Approval

---

## 3.6 Mission / 主动开发

```text
POST /api/v1/agent/nl-targets
POST /api/v1/agent/runs
```

现有能力：

```text
自然语言目标
  ↓
国家 / 产品 / 买家类型解析
  ↓
A2 Run
```

映射：

```text
BD Mission Builder
```

---

## 3.7 实时数据采集

```text
GET  /api/v1/collection-runs
POST /api/v1/collection-runs
GET  /api/v1/collection-runs/{id}
```

当前页面已经可触发：

- B2B
- Alibaba RFQ
- TED
- EC21
- UNGM
- Samples
- SAM

映射：

```text
Opportunity Discovery / Data Collection Panel
```

采集能力保留在数据入口层，不嵌入其他组件内部。

---

# 4. V2 七个页面 → 当前真实代码

| V2 页面 | 当前可复用代码 | V2 实施位置 | 处理 |
|---|---|---|---|
| Dashboard | `agent/index.html` 工作台统计、结果区、Run 状态 | `agent/ui/pages/dashboard.js` | 抽出 |
| Opportunity Radar | `site/opportunities.html` + `opportunities-live.js` + Agent 机会列表 | Portal + `agent/ui/pages/opportunity-radar.js` | 双层视图 |
| Opportunity Workspace | `GET /api/v1/opportunities/{id}/workspace` + 当前 `openAction()` | `agent/ui/pages/opportunity-workspace.js` | P0 |
| Buyer Intelligence | 当前 Opportunity buyer + A2 buyer_fit + external refs | `agent/ui/pages/buyer-intelligence.js` | 新增组合页 |
| BD Mission | 当前聊天输入 + `/agent/nl-targets` + `/agent/runs` | `agent/ui/pages/bd-mission.js` | P0 |
| Conversation | 当前 `/messages` `/threads` `/agent/chat` `/approvals` | `agent/ui/pages/conversation.js` | P0 |
| Playbook | 当前 A6 outcome + history + run / message / channel 数据 | `agent/ui/pages/playbook.js` | P1 |

---

# 5. V2 业务组件 → 当前真实代码

## 5.1 OpportunityCard

当前来源：

- `site/opportunities-live.js::mutateCard`
- `agent/index.html::renderOpportunityRows`

问题：两套独立渲染规则。

V2：定义统一字段 Contract，Portal 与 Agent 可拥有不同视觉，但字段含义一致。

---

## 5.2 SignalTimeline

当前来源：

- Opportunity `why_now`
- evidence refs
- published_at / observed_at
- runtime activity

V2：新增独立组件，不修改源数据。

---

## 5.3 EvidencePanel

当前可复用：

- `opportunity.evidence_ids`
- Workspace `evidence.count / refs`
- A2 / A6 Run evidence

V2：遵守 `evidence_contract_v2.md`。

---

## 5.4 BuyerProfile

当前可复用：

- `opportunity.buyer`
- A2 buyer fit
- external refs

V2：由 Buyer Contract 做统一 projection。

---

## 5.5 DemandCard

当前可复用：

```text
fields.product
fields.demand_title
fields.quantity
fields.certification
fields.destination
```

缺失字段统一显示 UNKNOWN / `—`，禁止推测补全。

---

## 5.6 NextActionPanel

当前已经存在服务端单一判断：

```text
opportunity-workspace.js::deriveNextAction()
```

优先级：

```text
PENDING APPROVAL
  ↓
A6 next_action
  ↓
READY_FOR_OUTREACH_APPROVAL
  ↓
OUTREACH_QUEUED
  ↓
WAITING_EVIDENCE
```

前端只展示与触发，不建立第二套 Next Action 判断。

---

## 5.7 ConversationTimeline

当前数据：

- state.messages
- state.threads
- Workspace activity.messages

V2：统一消费 Conversation Contract。

---

## 5.8 HumanTakeoverPanel

当前数据：

- approvals
- blockers
- `POST /api/v1/approvals/{id}`

V2：审批状态作为 Hard Gate，不允许 UI 绕过。

---

# 6. Opportunity Workspace 当前事实

服务端已经有正式聚合器：

```text
agent/server/opportunity-workspace.js
agent/server/opportunity-workspace-handler.js
```

当前 Workspace 返回：

```text
workspace_version
opportunity
score
A2
A6
next_action
blockers
approvals
activity
integration
evidence
```

V2 页面优先以此为 BFF Contract。

短期不新增一组碎片接口：

```text
/signals
/evidence
/runs
/messages
/approvals
```

再由前端拼装。

只有现有 Workspace 聚合缺失业务字段时，才做增量扩展。

---

# 7. 前端目标目录

当前不引入新的构建体系。

保持 Node 静态服务能力，新增：

```text
agent/ui/
├── core/
│   ├── api-client.js
│   ├── auth.js
│   ├── router.js
│   ├── state.js
│   └── formatters.js
│
├── components/
│   ├── opportunity-card.js
│   ├── signal-timeline.js
│   ├── evidence-panel.js
│   ├── buyer-profile.js
│   ├── demand-card.js
│   ├── next-action-panel.js
│   ├── conversation-timeline.js
│   ├── voice-conversation-panel.js
│   └── human-takeover-panel.js
│
├── pages/
│   ├── dashboard.js
│   ├── opportunity-radar.js
│   ├── opportunity-workspace.js
│   ├── buyer-intelligence.js
│   ├── bd-mission.js
│   ├── conversation.js
│   └── playbook.js
│
└── styles/
    ├── tokens.css
    ├── shell.css
    └── components.css
```

`agent/index.html` 逐步缩减为：

```text
App Shell
+ route containers
+ module imports
```

---

# 8. 实施顺序

## P0-1｜Core

- `api-client.js`
- `auth.js`
- `router.js`
- `state.js`
- `tokens.css`

验收：现有登录、工作台、采集、对话功能保持可用。

## P0-2｜Opportunity Workspace

先抽：

- OpportunityHeader
- WhyNow / SignalTimeline
- EvidencePanel
- BuyerProfile
- DemandCard
- NextActionPanel
- HumanTakeoverPanel
- ConversationTimeline

数据入口：

```text
GET /api/v1/opportunities/{id}/workspace
```

## P0-3｜BD Mission

复用：

```text
POST /api/v1/agent/nl-targets
POST /api/v1/agent/runs
```

## P0-4｜Conversation

复用：

```text
/messages
/threads
/agent/chat
/approvals
```

语音能力作为 Conversation 内独立组件实现，使用同一 Conversation Contract。

## P1｜Dashboard / Buyer Intelligence / Playbook

在 P0 Contract 稳定后接入。

---

# 9. 不动的资产

当前阶段禁止破坏：

- `site/` 已确认品牌视觉
- `site/nav-bridge.js`
- `site/opportunities-live.js` 的真实性规则
- A2-A6 Runtime
- Opportunity Workspace 聚合服务
- Approval Hard Gate
- Evidence 引用
- Collection Runner
- Agent State 持久化
- 现有 API idempotency 机制

---

# 10. 需要逐步淘汰的结构

仅在替代代码上线且验收后删除：

- `agent/index.html` 内联 CSS
- `agent/index.html` 内联 API fetch
- `agent/index.html` 内联 render 函数
- `agent/index.html` 内联路由状态
- 重复 Opportunity render 规则
- 老 README 中已被现代码替代的历史接口描述

禁止先删后建。

---

# 11. Hard Gate

每一步改造必须满足：

```text
旧功能仍可运行
+
真实数据链不断
+
Contract 不倒退
+
Evidence 不丢
+
Approval 不绕过
+
可回退
```

任何一项失败，停止进入下一步。

---

# 12. 当前代码映射状态

```text
site/ 门户核对                     ✅
site/ 全球商机真实数据核对           ✅
site → agent 导航核对               ✅
agent/ 工作台核对                    ✅
Agent Runtime API 核对              ✅
Opportunity Workspace 聚合核对       ✅
demo/ 退役状态核对                   ✅
7 页面 → 真实代码映射                ✅
核心组件 → 真实代码映射              ✅
现有 API → V2 Contract 映射          ✅
```

下一实施门：

```text
P0-1 Core 前端模块抽离
```
