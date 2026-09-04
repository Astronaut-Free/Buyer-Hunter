# QianPulse Dashboard 前端页面工程文档 V2.0

## 1. 页面定位

页面名称：Dashboard｜商机经营驾驶舱

页面目标：让企业负责人和销售团队在进入系统后的第一屏完成三件事：

1. 看清今天新出现了多少商机。
2. 找到当前最值得推进的商机。
3. 识别需要人工处理、等待回复、报价、寄样和谈判的事项。

页面核心对象：`Opportunity[]`、`Action[]`、`ConversationState[]`。

---

## 2. 页面能力边界

Dashboard 负责聚合与导航，不负责执行深度研究、完整对话和规则编辑。

输出动作：

- 打开具体 Opportunity Workspace。
- 进入待办动作。
- 查看异常、阻断和人工接管事项。
- 切换目标产品、国家、时间窗口和负责人。

---

## 3. 页面结构

```text
Dashboard
├── Global Header
├── Opportunity KPI Strip
├── Today Top Opportunities
├── Opportunity Stage Board
├── Action Queue
├── Signal Stream
├── Risk / Human Gate Queue
└── Data Freshness Footer
```

---

## 4. 大组件

### 4.1 Opportunity KPI Strip

组件：`OpportunityKpiStrip`

字段：

- `today_new_count`
- `high_priority_count`
- `waiting_reply_count`
- `action_due_count`
- `quote_count`
- `sample_count`
- `negotiation_count`
- `won_count`

交互：点击指标后对 Top Opportunities 与 Stage Board 应用同一筛选条件。

### 4.2 Today Top Opportunities

组件：`TopOpportunityList`

单卡字段：

- `opportunity_id`
- `buyer_name`
- `country`
- `industry_role`
- `demand_product`
- `opportunity_score`
- `buying_window_status`
- `why_now[]`
- `seller_fit_score`
- `market_access_status`
- `stage`
- `next_action`
- `next_action_due_at`
- `evidence_freshness`

卡片一级信息仅保留：买家、需求、机会分、Why Now、阶段、下一步。

### 4.3 Opportunity Stage Board

组件：`OpportunityStageBoard`

阶段：

```text
DISCOVERED
QUALIFIED
ACTIONABLE
CONTACTED
REPLIED
QUOTE
SAMPLE
NEGOTIATION
WON
LOST
LONG_TERM
```

支持：数量统计、阶段跳转、负责人筛选、风险筛选。

### 4.4 Action Queue

组件：`ActionQueue`

动作类型：

- 联系采购负责人
- 补充证据
- 补充认证
- 审核首轮触达
- 跟进回复
- 准备报价
- 准备寄样
- 人工接管

字段：`action_id`、`opportunity_id`、`action_type`、`priority`、`due_at`、`owner`、`approval_status`。

### 4.5 Signal Stream

组件：`SignalStream`

展示最近产生或变化的信号：

- 新进口记录
- 进口增长
- 供应商变化
- RFQ
- 新品
- 招聘
- 新闻
- 市场准入规则变化

每条信号必须带 `source`、`captured_at`、`fact_level`、`evidence_id`。

### 4.6 Human Gate Queue

组件：`HumanGateQueue`

进入队列的典型原因：

- 高价值首次触达
- 正式报价
- 合同与付款条款
- 独家代理与分成
- 强意向买家
- 数据冲突
- AI 置信度不足

---

## 5. API Contract

```http
GET /api/v1/dashboard
GET /api/v1/opportunities?sort=priority
GET /api/v1/actions?status=pending
GET /api/v1/signals?limit=50
GET /api/v1/human-gates?status=pending
```

Dashboard API 返回聚合值，Opportunity 详情继续由详情接口承担。

---

## 6. 前端状态

建议状态：

```ts
DashboardState = {
  filters,
  kpis,
  opportunities,
  stages,
  actions,
  signals,
  humanGates,
  freshness
}
```

筛选条件写入 URL query，刷新后保持当前视图。

---

## 7. 空态与异常

- 无新增商机：显示最近可推进商机与创建 Mission 入口。
- 数据源异常：保留最后可信快照并显示更新时间。
- 部分字段 UNKNOWN：明确显示“待补证据”。
- API 超时：局部组件降级，页面主体继续可用。

---

## 8. 验收标准

- 用户 10 秒内能找到今天 Top 5 商机。
- 每个 Top Opportunity 能看到 Why Now 与 Next Action。
- 阶段、风险、人工接管事项可直接进入对应工作台。
- 页面不展示无证据支撑的采购事实。
- API、Crawler、Browser Agent、用户输入统一经业务 Contract 进入前端。