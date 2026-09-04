# QianPulse 前端迭代 PRD V2

## 定位
全球商机经营智能平台。

让 AI 24 小时出去找生意，把一条采购机会一路跟到成交。

## 前端演进原则

基于现有 Buyer-Hunter / QianPulse 架构增量迭代，不推翻现有 Opportunity、A2-A6 Skill Runtime、Evidence、Agent State。

页面从客户列表升级为商机经营工作台。

## 信息架构

- Dashboard 商机驾驶舱
- Opportunity Radar 全球机会雷达
- Opportunity Workspace 商机详情
- Buyer Intelligence 买家情报
- BD Mission 工作台
- Conversation 推进中心
- Playbook 复盘

## 核心组件

### Opportunity Card
字段：
- buyer
- product
- score
- why_now
- stage
- next_action

### Signal Timeline
字段：
- signal_type
- source
- evidence
- confidence
- observed_at

### Demand Card
字段：
- product
- quantity
- specification
- destination
- certification

### Supplier Intelligence
字段：
- current_suppliers
- new_suppliers
- lost_suppliers
- switching_signal

### Action Panel
字段：
- action
- channel
- target_person
- message
- approval_required

## 页面目标

用户进入系统后看到：

哪些全球采购机会值得推进；
为什么现在值得联系；
下一步应该联系谁；
如何持续推进到成交。

## 数据原则

API、爬虫、用户输入均作为数据源。

数据经过：

Data Source → Evidence → Opportunity → Action → Outcome

## 后续开发

Sprint 1:
- Dashboard
- Opportunity Card
- Opportunity Detail

Sprint 2:
- Signal
- Buyer Intelligence
- Supplier Intelligence

Sprint 3:
- BD Mission
- Conversation Workspace

Sprint 4:
- Playbook
- 自动化执行
