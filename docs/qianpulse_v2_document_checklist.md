# QianPulse V2 文档与工程清单

> 分支：`feature/qianpulse-frontend-v2`
>
> 唯一清单入口。产品、组件、页面、Contract、真实代码映射与实施状态统一在此维护。

---

# 0. 当前总状态

```text
L0 总 PRD                         ✅ 1 / 1
L1 业务组件工程文档               ✅ 7 / 7
L2 前端页面工程文档               ✅ 7 / 7
L3 核心 / 系统 Contract           ✅ 9 / 9
L4 真实 site / agent 代码映射      ✅ 5 / 5
L5 前端基础层                      ✅ 5 / 5
L5 业务组件实现                    ⏳ 0 / 13
L6 API / Agent 接线与验收          ⏳ 待执行
V2 文档全量去重审查               ⏳ 待执行
```

当前工程门：

```text
Opportunity Card
    ↓
Evidence Panel / Signal Timeline
    ↓
Buyer / Demand / Market Access / Next Action
    ↓
Dashboard / Radar / Workspace
    ↓
Conversation / Voice / Playbook
    ↓
API / Agent 接线与验收
```

---

# 1. L0｜总 PRD

- [x] `docs/qianpulse_prd_v2_master.md`

唯一产品总纲：定位、Opportunity、生命周期、7 个业务组件、边界、数据与优先级。

---

# 2. L1｜业务组件工程文档

目录：`docs/components/`

- [x] `01_opportunity_discovery_center_engineering.md`
- [x] `02_buyer_intelligence_center_engineering.md`
- [x] `03_opportunity_intelligence_engineering.md`
- [x] `04_bd_mission_workspace_engineering.md`
- [x] `05_channel_hub_engineering.md`
- [x] `06_conversation_progression_engineering.md`
- [x] `07_playbook_engineering.md`

```text
Discovery
  ↓
Buyer Intelligence
  ↓
Opportunity Intelligence
  ↓
BD Mission
  ↓
Channel Hub
  ↓
Conversation Progression
  ↓
Outcome / Playbook
```

---

# 3. L2｜前端页面工程文档

目录：`docs/pages/`

- [x] `01_dashboard_frontend_engineering.md`
- [x] `02_opportunity_radar_frontend_engineering.md`
- [x] `03_opportunity_workspace_frontend_engineering.md`
- [x] `04_buyer_intelligence_frontend_engineering.md`
- [x] `05_bd_mission_frontend_engineering.md`
- [x] `06_conversation_frontend_engineering.md`
- [x] `07_playbook_frontend_engineering.md`

Conversation 中的 Voice Conversation 已作为独立能力模块定义。

---

# 4. L3｜Contract

目录：`docs/contracts/`

## 核心业务 Contract

- [x] `opportunity_contract_v2.md`
- [x] `evidence_contract_v2.md`
- [x] `buyer_contract_v2.md`
- [x] `conversation_contract_v2.md`
- [x] `mission_contract_v2.md`

## 系统 Contract

- [x] `api_contract_v2.md`
- [x] `frontend_component_contract_v2.md`
- [x] `state_event_contract_v2.md`
- [x] `data_contract_v2.md`

Contract：**9 / 9 完成。**

---

# 5. L4｜真实代码映射

正式实施文档：

- [x] `docs/implementation/01_site_agent_real_code_mapping_v2.md`

已完成：

- [x] `site/`：4180 公开品牌入口与公开商机入口
- [x] `agent/`：3317 登录后 A2-A6 经营工作台
- [x] `demo/` 只作历史参考
- [x] 现有页面 → 7 个 V2 页面映射
- [x] FastAPI / Agent API → V2 Contract 映射

真实运行拓扑：

```text
site/ :4180
  ├── index.html
  ├── opportunities.html
  ├── opportunities-live.js
  └── nav-bridge.js
        ↓
api/app.py :8000
        ↓
runtime/buyer_hunter.db

site
  ↓
agent/ :3317
  ├── index.html
  └── server/bootstrap.js
        ↓
      server/index.js
        ↓
      A2-A6 Runtime
```

启动链：

```text
agent/package.json
  ↓
node server/bootstrap.js
  ↓
server/index.js
```

V2 后端实施以 `agent/server/` 为主；根目录旧 `agent/index.js` 不作为主 Runtime 入口。

---

# 6. L5｜前端基础层

目录：`agent/ui-v2/`

- [x] Shared Design Tokens
  - `tokens.css`
- [x] API Client
  - `api-client.js`
  - Agent `:3317` + Decision API `:8000`
  - 复用 `qianpulse-auth-token`
- [x] Shared State Store
  - `state-store.js`
- [x] Router / View Shell
  - `router.js`
  - `view-shell.js`
  - `shell.css`
- [x] Loading / Error / Empty / UNKNOWN
  - `view-state.js`

当前基础层已落代码，尚未替换当前 `agent/index.html` 的稳定运行链；后续以组件逐步接入。

---

# 7. L5｜业务组件实现

目录：`agent/ui-v2/components/`

- [ ] Opportunity Card
- [ ] Signal Timeline
- [ ] Evidence Panel
- [ ] Buyer Profile
- [ ] Supplier Graph
- [ ] Demand Card
- [ ] Market Access Panel
- [ ] Next Action Panel
- [ ] Conversation Timeline
- [ ] Voice Conversation Panel
- [ ] Human Takeover Panel
- [ ] Approval Panel
- [ ] Outcome / Playbook Panel

实现底线：

- Contract 驱动
- FACT / DERIVED / INFERENCE / ACTION 可区分
- UNKNOWN 不猜测
- Provider 字段不得直接穿透页面
- 不破坏当前登录与 A2-A6 Runtime

---

# 8. 七个 V2 页面代码 Owner

| 页面 | Owner | 当前基础 | 状态 |
|---|---|---|---|
| Dashboard | `agent/` | workspace / runs / approvals | ⏳ |
| Opportunity Radar | `site/` + `agent/` | `opportunities.html` + live API | ⏳ |
| Opportunity Workspace | `agent/` | `/api/v1/opportunities/{id}/workspace` | ⏳ |
| Buyer Intelligence | `agent/` | buyer / A2 / evidence / refs | ⏳ |
| BD Mission | `agent/` | NL target + AgentRun + collection | ⏳ |
| Conversation | `agent/` | message / thread / approval / Smartlead | ⏳ |
| Playbook | `agent/` | runs / messages / outcomes | ⏳ |

---

# 9. API Owner

## FastAPI `:8000`

Owner：`api/app.py`

负责：

```text
Signal
Evidence
Decision Snapshot
Seller Fit
Market Access
```

已确认：

- [x] `GET /api/v1/opportunities/recent`
- [x] `GET /api/v1/opportunities/today`
- [x] `GET /api/v1/opportunities/{id}/decision`
- [x] `GET /api/v1/opportunities/{id}/brief.pdf`
- [x] `GET /api/v1/opportunities/{id}/access-channels`

## Agent `:3317`

Owner：`agent/server/index.js`

负责：

```text
Mission
AgentRun
Action
Conversation
Approval
External Action
Outcome
```

已确认：

- [x] Auth
- [x] Opportunity List
- [x] Opportunity Workspace
- [x] Agent Capabilities
- [x] NL Target
- [x] Agent Runs / Resume
- [x] Messages / Threads
- [x] Approval
- [x] Collection Runs
- [x] Agent Intake / Chat
- [x] Smartlead Webhook
- [x] Public Opportunity Projection

---

# 10. L6｜Agent / Runtime 接线

- [x] 保留 A2-A6 Runtime
- [ ] 现有 Skill → V2 组件能力正式映射表
- [ ] Mission Contract → A2 Runtime
- [ ] Opportunity Workspace → V2 页面
- [ ] Evidence Contract → Evidence Panel
- [ ] Conversation Contract → A6 / Thread / Message
- [ ] Voice Event → Evidence / Conversation Event
- [ ] Human Gate → Approval Panel
- [ ] Approval → Executor → External Action
- [ ] Outcome → Playbook

运行底线：

- idempotency
- Evidence Grounding
- Human Gate
- AgentRun / Step / Checkpoint
- Outcome 回写

全部保留。

---

# 11. 数据源与 Evidence Layer

```text
API
+
Crawler
+
Browser Agent
+
User Input / Upload
+
Trade Data
+
News / Jobs / Company Events
+
Conversation Data

↓
Evidence
↓
Opportunity
↓
Action
↓
Conversation
↓
Outcome
↓
Playbook
```

待接入 / 强化：

- [ ] API 数据源
- [ ] Crawler
- [ ] Browser Agent
- [ ] User Input / Upload
- [ ] 社媒 / 公共网页
- [ ] 贸易数据
- [ ] 新闻 / 招聘 / 企业变化
- [ ] 沟通数据

---

# 12. 核心 Signal 验收

- [ ] 正在进口同类产品
- [ ] 进口量增长
- [ ] 供应商变化 / 换供应商
- [ ] B2B RFQ / 询盘
- [ ] 采购 / 寻源岗位招聘
- [ ] 行业新闻 / 政策变化
- [ ] 新产品 / 新市场 / 渠道扩张
- [ ] 展会 / 活动 / 公开采购动作

每个 Signal 必须具备：

- source
- source_url / evidence_ref
- observed_at
- related buyer
- related product
- confidence
- freshness

---

# 13. V2 商机字段验收

## Buyer

- [ ] 公司名称 / 国家 / Domain / 地址
- [ ] 企业类型 / 产业链角色
- [ ] 主营产品 / 销售渠道 / 目标市场

## Contact

- [ ] 姓名 / 职位 / 部门
- [ ] Email / LinkedIn / 公共渠道
- [ ] 决策角色

## Demand

- [ ] 产品 / 规格 / 数量
- [ ] 价格区间（来源披露时）
- [ ] 认证 / 目的地 / 交付时间
- [ ] MOQ / 包装 / 用途

## Procurement Intelligence

- [ ] 采购品类 / HS Code
- [ ] 采购频次 / 最近采购
- [ ] 数量与金额趋势
- [ ] 来源国 / 采购周期 / 季节性

## Supplier Intelligence

- [ ] 当前 / 历史供应商
- [ ] 新增 / 流失供应商
- [ ] first_seen / last_seen
- [ ] supplier switch score / window

## Opportunity Intelligence

- [ ] Score
- [ ] Why Now
- [ ] Seller Fit
- [ ] Market Access
- [ ] Risk
- [ ] Stage / Priority
- [ ] Next Action

## Conversation / Outcome

- [ ] 首次触达 / 渠道 / 买家回复
- [ ] 意向 / 对话阶段 / 下一步
- [ ] 人工接管
- [ ] 报价 / 寄样 / 谈判
- [ ] WON / LOST / 原因

---

# 14. 文档清理

已删除过程重复稿：

- [x] `frontend_current_mapping_v2.md`
- [x] `frontend_v2_execution_checklist.md`
- [x] 旧版无编号 `opportunity_workspace_frontend_engineering.md`
- [x] 重复总纲 `qianpulse_prd_v2_master_architecture.md`

后续：

- [ ] L5 前端第一轮完成后执行 `docs/` 全量去重审查
- [ ] 对旧历史文档逐份判断：事实依据 / 归档 / 删除

禁止新增：

- 临时讨论稿
- 重复 PRD
- 重复清单
- 无 Owner 过程文档
- 与 Contract / 代码脱节的概念稿
