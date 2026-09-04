# QianPulse V2 文档与工程清单

> 分支：`feature/qianpulse-frontend-v2`
>
> 目标：用金字塔结构收敛 QianPulse V2 的产品、组件、页面、Contract 与代码实施文档，保证每一层只有一个清晰入口。

---

# 0. 文档金字塔

```text
L0  产品总纲 PRD
    ↓
L1  业务组件工程文档
    ↓
L2  前端页面工程文档
    ↓
L3  Contract / 数据 / 状态 / 事件文档
    ↓
L4  代码实施与验收
```

---

# 1. L0｜总 PRD

- [x] `docs/qianpulse_prd_v2_master.md`
  - 产品定位
  - 核心对象 Opportunity
  - 商机全生命周期
  - 7 个核心业务组件
  - 数据解耦原则
  - 组件边界原则
  - 开发优先级

唯一总纲：后续产品定义以本文件为入口。

---

# 2. L1｜业务组件工程文档

目录：`docs/components/`

- [x] `01_opportunity_discovery_center_engineering.md`
  - 商机发现
  - 数据源接入
  - Signal
  - Evidence
  - Opportunity Candidate

- [x] `02_buyer_intelligence_center_engineering.md`
  - 企业画像
  - 产业链角色
  - 联系人情报
  - 企业事件

- [x] `03_opportunity_intelligence_engineering.md`
  - Opportunity Score
  - Why Now
  - Seller Fit
  - Market Access
  - Next Action

- [x] `04_bd_mission_workspace_engineering.md`
  - Mission 创建
  - 自然语言目标解析
  - 目标市场
  - 目标对象
  - 执行策略
  - Agent 调度
  - 人工接管规则

- [x] `05_channel_hub_engineering.md`
  - Email
  - LinkedIn
  - WhatsApp
  - Telegram
  - 微信 / 其他渠道
  - 渠道适配
  - 发送审批
  - 发送结果

- [x] `06_conversation_progression_engineering.md`
  - 对话时间线
  - 回复理解
  - 意向判断
  - 下一步推进
  - AI 回复
  - 语音对话
  - 人工接管

- [x] `07_playbook_engineering.md`
  - 成交 / 失败复盘
  - 信号学习
  - 渠道学习
  - 话术学习
  - Playbook 沉淀

---

# 3. L2｜前端页面工程文档

目录：`docs/pages/`

- [x] `01_dashboard_frontend_engineering.md`
  - 今日商机
  - 待推进事项
  - Pipeline
  - Agent 状态
  - 核心经营指标

- [x] `02_opportunity_radar_frontend_engineering.md`
  - 全球机会雷达
  - 筛选
  - Signal
  - Opportunity Card
  - 排序与优先级

- [x] `03_opportunity_workspace_frontend_engineering.md`
  - Opportunity Header
  - Why Now
  - Buyer Intelligence
  - Demand
  - Supplier Intelligence
  - Market Access
  - Next Action
  - Conversation Progress

- [x] `04_buyer_intelligence_frontend_engineering.md`
  - Company Profile
  - Contact Intelligence
  - Supplier Intelligence
  - Business Events
  - Evidence

- [x] `05_bd_mission_frontend_engineering.md`
  - Mission Builder
  - Natural Language Input
  - Target Market
  - Target Buyer
  - Strategy
  - Agent Execution
  - Mission Progress

- [x] `06_conversation_frontend_engineering.md`
  - Conversation Timeline
  - Email / IM
  - Reply Analysis
  - AI Reply
  - Voice Conversation
  - Human Takeover
  - Next Step

- [x] `07_playbook_frontend_engineering.md`
  - Outcome Review
  - Winning Signals
  - Channel Performance
  - Message Performance
  - Playbook Library

---

# 4. L3｜Contract 与跨组件工程文档

目录建议：`docs/contracts/`

## 4.1 核心业务 Contract

- [ ] `opportunity_contract_v2.md`
  - Opportunity 主对象
  - stage
  - priority
  - score
  - why_now
  - next_action
  - outcome

- [ ] `evidence_contract_v2.md`
  - FACT
  - DERIVED
  - INFERENCE
  - ACTION
  - source
  - observed_at
  - confidence
  - provenance

- [ ] `buyer_contract_v2.md`
  - Company
  - Contact
  - Business Event
  - Procurement Intelligence
  - Supplier Intelligence

- [ ] `conversation_contract_v2.md`
  - message
  - channel
  - sender / recipient
  - intent
  - extracted facts
  - stage transition
  - next action
  - human takeover

- [ ] `mission_contract_v2.md`
  - mission goal
  - target market
  - target buyer
  - constraints
  - execution mode
  - approval policy
  - status

## 4.2 系统 Contract

- [ ] `api_contract_v2.md`
  - 现有 API 复用
  - 新增 API
  - request / response
  - error contract
  - pagination
  - idempotency

- [ ] `frontend_component_contract_v2.md`
  - 页面与业务组件输入输出
  - shared state
  - loading / error / empty
  - component events

- [ ] `state_event_contract_v2.md`
  - Opportunity 状态机
  - Conversation 状态机
  - Mission 状态机
  - Event 定义
  - 状态迁移 Hard Gate

- [ ] `data_contract_v2.md`
  - Data Source → Evidence
  - Evidence → Opportunity
  - Opportunity → Action
  - Action → Outcome
  - 字段真值来源
  - UNKNOWN 规则

---

# 5. L4｜工程实施文档

## 5.1 前端现状核对

- [ ] 核对 `site/`：4180 门户与机会入口
- [ ] 核对 `agent/`：3317 A2-A6 工作台
- [ ] 明确 `demo/` 仅作历史 / 参考代码，不作为 V2 主实施入口
- [ ] 建立现有页面 → V2 页面真实代码映射
- [ ] 建立现有 API → V2 Contract 映射

## 5.2 前端工程

- [ ] Shared Design Tokens
- [ ] Shared Business Components
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

## 5.3 Agent / Runtime

- [ ] 保留 A2-A6 Runtime
- [ ] 现有 Skill → V2 组件能力映射
- [ ] Mission Orchestrator 接入
- [ ] Evidence Grounding
- [ ] Human Gate
- [ ] Approval → Executor
- [ ] Outcome 回写

## 5.4 数据源

统一进入 Evidence Layer：

- [ ] API 数据源
- [ ] Crawler
- [ ] Browser Agent
- [ ] User Input / Upload
- [ ] 社媒 / 公共网页
- [ ] 贸易数据
- [ ] 新闻 / 招聘 / 企业变化
- [ ] 沟通数据

数据链：

```text
Data Source
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

---

# 6. 核心 Signal 清单

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

# 7. 商机完整字段验收

## Buyer

- [ ] 公司名称
- [ ] 国家 / 地区
- [ ] 官网 / Domain
- [ ] 地址
- [ ] 企业类型
- [ ] 产业链角色
- [ ] 主营产品
- [ ] 销售渠道
- [ ] 目标市场

## Contact

- [ ] 姓名
- [ ] 职位
- [ ] 部门
- [ ] Email
- [ ] LinkedIn / 公共渠道
- [ ] 决策角色

## Demand

- [ ] 产品
- [ ] 规格
- [ ] 数量
- [ ] 价格区间（来源披露时）
- [ ] 认证
- [ ] 目的地
- [ ] 交付时间
- [ ] MOQ / 包装 / 用途

## Procurement Intelligence

- [ ] 采购品类
- [ ] HS Code
- [ ] 采购频次
- [ ] 最近采购
- [ ] 数量趋势
- [ ] 金额趋势
- [ ] 来源国
- [ ] 采购周期 / 季节性

## Supplier Intelligence

- [ ] 当前供应商
- [ ] 历史供应商
- [ ] 新增供应商
- [ ] 流失供应商
- [ ] first_seen / last_seen
- [ ] supplier switch score / window

## Opportunity Intelligence

- [ ] Opportunity Score
- [ ] Why Now
- [ ] Seller Fit
- [ ] Market Access
- [ ] Risk
- [ ] Stage
- [ ] Priority
- [ ] Next Action

## Conversation / Outcome

- [ ] 首次触达
- [ ] 渠道
- [ ] 买家回复
- [ ] 意向
- [ ] 对话阶段
- [ ] 下一步动作
- [ ] 人工接管
- [ ] 报价状态
- [ ] 寄样状态
- [ ] 谈判状态
- [ ] WON / LOST
- [ ] 成败原因

---

# 8. 文档清理规则

- [x] 删除 `frontend_current_mapping_v2.md`
- [x] 删除 `frontend_v2_execution_checklist.md`
- [x] 删除旧版无编号 `opportunity_workspace_frontend_engineering.md`
- [x] 删除重复总纲 `qianpulse_prd_v2_master_architecture.md`
- [ ] V2 Contract 完成后再做一次 `docs/` 全量去重审查
- [ ] 对旧版历史文档先判断是否仍承担事实 / 决策依据，再决定保留、归档或删除

禁止继续新增：

- 临时讨论稿
- 重复 PRD
- 重复清单
- 无 Owner 的过程文档
- 与代码和 Contract 脱节的概念稿

---

# 9. 当前状态

```text
总 PRD                         ✅ 1 / 1
业务组件工程文档               ✅ 7 / 7
前端页面工程文档               ✅ 7 / 7
核心 / 系统 Contract           ⏳ 0 / 9
真实代码映射与实施             ⏳ 待执行
V2 文档全量去重审查             ⏳ Contract 完成后执行
```

当前下一工程门：

```text
Contract 补齐
    ↓
真实 site / agent 代码映射
    ↓
前端组件实现
    ↓
API / Agent 接线
    ↓
测试与验收
```
