# QianPulse V2 文档与工程清单

> 分支：`feature/qianpulse-frontend-v2`
>
> 本文件是 V2 唯一工程清单入口。

---

# 0. 总状态

| 层级 | 交付 | 状态 |
|---|---|---|
| L0 | 总 PRD | ✅ 1 / 1 |
| L1 | 业务组件工程文档 | ✅ 7 / 7 |
| L2 | 前端页面工程文档 | ✅ 7 / 7 |
| L3 | 核心 / 系统 Contract | ✅ 9 / 9 |
| L4 | 真实 `site/` / `agent/` 代码映射 | ✅ 5 / 5 |
| L5 | V2 前端基础层 | ✅ 6 / 6 |
| L5 | 业务组件代码 | ✅ 13 / 13 |
| L5 | 七个页面组合代码 | ✅ 7 / 7 |
| L6 | Skill / Runtime → UI 能力映射 | ✅ 1 / 1 |
| L6 | Opportunity Workspace BFF V2 Projection | ✅ 1 / 1 |
| L6 | Legacy → V2 可回退桥接代码 | ✅ 1 / 1 |
| L6 | 稳定入口实际加载 V2 | ⏳ 0 / 1 |
| L7 | Node / UI 静态测试代码 | ✅ 已补 |
| L7 | Node / Python 全量回归实际执行 | ⏳ 待执行 |
| L7 | 真实浏览器联调 | ⏳ 待执行 |
| L7 | Voice Runtime（STT / TTS / Voice Event） | ⏳ 待执行 |
| 收口 | `docs/` 全量去重审查 | ⏳ 最终执行 |

当前工程门：

```text
稳定入口加载 V2
    ↓
Node / Python 回归
    ↓
浏览器联调
    ↓
Voice Runtime
    ↓
文档最终去重
```

---

# 1. L0｜总 PRD

- [x] `docs/qianpulse_prd_v2_master.md`

产品主链：

```text
发现
→ 研究
→ 判断
→ 联系
→ 对话
→ 推进
→ 报价 / 寄样 / 谈判
→ 成交
→ 复盘
```

核心对象：`Opportunity`

---

# 2. L1｜7 个业务组件工程文档

目录：`docs/components/`

- [x] `01_opportunity_discovery_center_engineering.md`
- [x] `02_buyer_intelligence_center_engineering.md`
- [x] `03_opportunity_intelligence_engineering.md`
- [x] `04_bd_mission_workspace_engineering.md`
- [x] `05_channel_hub_engineering.md`
- [x] `06_conversation_progression_engineering.md`
- [x] `07_playbook_engineering.md`

---

# 3. L2｜7 个前端页面工程文档

目录：`docs/pages/`

- [x] `01_dashboard_frontend_engineering.md`
- [x] `02_opportunity_radar_frontend_engineering.md`
- [x] `03_opportunity_workspace_frontend_engineering.md`
- [x] `04_buyer_intelligence_frontend_engineering.md`
- [x] `05_bd_mission_frontend_engineering.md`
- [x] `06_conversation_frontend_engineering.md`
- [x] `07_playbook_frontend_engineering.md`

---

# 4. L3｜9 份 Contract

目录：`docs/contracts/`

- [x] `opportunity_contract_v2.md`
- [x] `evidence_contract_v2.md`
- [x] `buyer_contract_v2.md`
- [x] `conversation_contract_v2.md`
- [x] `mission_contract_v2.md`
- [x] `api_contract_v2.md`
- [x] `frontend_component_contract_v2.md`
- [x] `state_event_contract_v2.md`
- [x] `data_contract_v2.md`

Contract 完成：**9 / 9**。

---

# 5. L4｜真实代码基线

正式映射：

- [x] `docs/implementation/01_site_agent_real_code_mapping_v2.md`

运行拓扑：

```text
site/ :4180
  ↓
api/ :8000

site/ :4180
  ↓
agent/ :3317
  ↓
agent/server/index.js
  ↓
A2-A6 Runtime
```

基线结论：

- [x] `site/` 保留公开品牌入口与公开商机入口
- [x] `agent/` 保留登录、Agent Runtime、采集、审批、对话
- [x] `demo/` 仅作历史参考
- [x] `site/nav-bridge.js` 保留
- [x] V2 在现有 `agent/` 上增量组件化

---

# 6. L5｜V2 前端基础层

目录：`agent/ui-v2/`

- [x] `tokens.css` — Design Tokens
- [x] `api-client.js` — `:3317` + `:8000`
- [x] `state-store.js` — Shared State
- [x] `router.js` + `view-shell.js` + `shell.css`
- [x] `view-state.js` — Loading / Error / Empty / UNKNOWN
- [x] `app.js` + `app.css` — V2 Mount Entry

---

# 7. L5｜13 个业务组件代码

目录：`agent/ui-v2/components/`

- [x] `opportunity-card.js`
- [x] `signal-timeline.js`
- [x] `evidence-panel.js`
- [x] `buyer-profile.js`
- [x] `supplier-graph.js`
- [x] `demand-card.js`
- [x] `market-access-panel.js`
- [x] `next-action-panel.js`
- [x] `conversation-timeline.js`
- [x] `voice-conversation-panel.js`
- [x] `human-takeover-panel.js`
- [x] `approval-panel.js`
- [x] `outcome-playbook-panel.js`

组件底线：

- Contract 驱动
- `FACT / DERIVED / INFERENCE / ACTION` 分层
- `UNKNOWN` 保持 UNKNOWN
- Provider 字段不穿透页面
- `Next Action` 由 A6 Runtime 单一 Owner
- Pending Approval 阻断外部动作
- Voice API 未接线时按钮 Hard Disable

---

# 8. L5｜7 个页面组合代码

目录：`agent/ui-v2/pages/`

- [x] `dashboard.js`
- [x] `opportunity-radar.js`
- [x] `opportunity-workspace.js`
- [x] `buyer-intelligence.js`
- [x] `bd-mission.js`
- [x] `conversation.js`
- [x] `playbook.js`

公共：

- [x] `page-utils.js`
- [x] `pages.css`
- [x] `index.js` — 7 Page Loader Registry

---

# 9. L6｜Skill / Runtime → UI 能力映射

- [x] `agent/ui-v2/capability-map.js`

已固定：

```text
A1 Data Entry → Radar / Signal / Evidence
A2 → BD Mission / Buyer / Outreach
A3 → Purchase Timing / Why Now
A4 → Supply Match / Seller Fit
A5 → Market Access / Risk / Human Gate
A6 → Conversation / Next Action / Approval / Outcome
```

同时保留 Legacy Capability 映射：

- `demand.normalize`
- `buyer.intent`
- `supply.match`
- `market.access`
- `conversation.qualify`
- `reply.draft`

---

# 10. L6｜Opportunity Workspace BFF

Owner：`agent/server/opportunity-workspace.js`

- [x] `workspace_version = 1.1.0`
- [x] `opportunity.fields`
- [x] `origin / decision / priority`
- [x] Opportunity / Truth / Timing / Market Access Score
- [x] `why_now / gaps`
- [x] `supply_match`
- [x] `supplier_intelligence`
- [x] `market_access`
- [x] `A2 / A6`
- [x] `next_action`
- [x] `blockers`
- [x] `approvals`
- [x] `activity`
- [x] `evidence`
- [x] `outcome`
- [x] Buyer Role 隐藏内部商业情报与 Seller Intelligence

测试同步：

- [x] `agent/tests/opportunity-workspace.test.js`

---

# 11. L6｜稳定入口桥接

- [x] `agent/ui-v2/legacy-bridge.js`

桥接规则：

```text
#auth / #workspace
→ 继续走现有稳定界面

#/dashboard
#/opportunities
#/opportunity/:id
#/buyer/:id
#/mission
#/conversation/:id
#/playbook
→ V2 Shell
```

底线：

- 原登录入口保留
- 原工作台保留
- V2 可回退
- 不建立平行 Runtime

待完成：

- [ ] 将 `app.css` 与 `legacy-bridge.js` 实际加载进现有 `agent/index.html`
- [ ] 验证 Portal `#auth / #workspace` 不受影响
- [ ] 验证 V2 7 条 hash route

---

# 12. L7｜测试

已补测试代码：

- [x] `agent/tests/opportunity-workspace.test.js`
  - Workspace 1.1.0 Projection
  - Role Privacy
  - Approval / Evidence / Blocker

- [x] `agent/tests/ui-v2-modules.test.js`
  - 13 个组件 export
  - 7 个页面 loader
  - Provider-neutral
  - Demand destination 真值规则
  - A6 Next Action Owner
  - Voice Hard Disable
  - Legacy Bridge 可回退

- [x] `agent/tests/ui-v2-capability-map.test.js`
  - A2-A6 UI Owner
  - A5 Risk Gate
  - A6 Next Action / Outcome
  - Reverse Lookup
  - Provider-neutral

待实际执行：

- [ ] `npm test`
- [ ] Skill Dispatch Audit
- [ ] Python tests
- [ ] Browser smoke
- [ ] API E2E

未执行前禁止标记测试通过。

---

# 13. Voice Runtime

前端组件已经完成。

待后端：

- [ ] Voice Session Contract 落 Runtime
- [ ] STT
- [ ] 实时 Transcript
- [ ] Fact Extraction
- [ ] Voice Event → Conversation Event
- [ ] TTS
- [ ] Call Summary
- [ ] Human Takeover
- [ ] Evidence Ref

当前 Voice 入口保持不可执行状态。

---

# 14. 核心 Signal 数据验收

- [ ] 正在进口同类产品
- [ ] 进口量增长
- [ ] 供应商变化 / 换供应商
- [ ] B2B RFQ / 询盘
- [ ] 采购 / 寻源岗位招聘
- [ ] 行业新闻 / 政策变化
- [ ] 新产品 / 新市场 / 渠道扩张
- [ ] 展会 / 活动 / 公开采购动作

每条 Signal 必须带：

```text
source
source_url / evidence_ref
observed_at
related_buyer
related_product
confidence
freshness
```

---

# 15. 最终验收字段

## Buyer / Contact

- [ ] 公司 / 国家 / Domain / 地址
- [ ] 企业类型 / 产业链角色
- [ ] 联系人 / 职位 / 部门 / 决策角色
- [ ] Email / LinkedIn / 公共渠道

## Demand

- [ ] 产品 / 规格 / 数量
- [ ] 价格区间（来源披露时）
- [ ] 认证 / 采购目的地 / 交付时间
- [ ] MOQ / 包装 / 用途

## Procurement / Supplier Intelligence

- [ ] 采购品类 / HS Code / 采购频次
- [ ] 数量 / 金额趋势 / 来源国 / 周期
- [ ] 当前 / 历史 / 新增 / 流失供应商
- [ ] Supplier Switch Score / Window

## Opportunity / Conversation / Outcome

- [ ] Score / Why Now / Seller Fit / Market Access / Risk
- [ ] Stage / Priority / Next Action
- [ ] 首次触达 / 渠道 / 买家回复 / 意向
- [ ] 人工接管 / 报价 / 寄样 / 谈判
- [ ] WON / LOST / 原因

---

# 16. 文档清理

已删除：

- [x] `frontend_current_mapping_v2.md`
- [x] `frontend_v2_execution_checklist.md`
- [x] 旧版无编号 `opportunity_workspace_frontend_engineering.md`
- [x] 重复总纲 `qianpulse_prd_v2_master_architecture.md`
- [x] 重复实施映射稿 `docs/implementation/01_frontend_live_code_mapping_v2.md`

最终待执行：

- [ ] 稳定入口完成后全量审查 `docs/`
- [ ] 历史事实依据保留
- [ ] 重复 / 过期 / 过程稿删除或归档

禁止新增：

- 临时讨论稿
- 重复 PRD
- 重复清单
- 无 Owner 的过程文档
- 与 Contract / 代码脱节的概念稿
