# QianPulse V2｜Frontend Component Contract

> 目标：统一页面、业务组件、基础组件之间的输入输出、状态、事件与错误处理，确保 `site/`、`agent/` 后续前端迭代沿同一组件边界发展。

---

# 1. 前端金字塔

```text
L1 Page
    ↓
L2 Business Component
    ↓
L3 Primitive / Shared Component
    ↓
Business Contract / API Adapter
```

页面只负责布局、路由、组合与页面级状态。

业务组件负责一个明确业务判断或动作。

基础组件只负责展示与交互原语。

---

# 2. Page Contract

每个页面必须声明：

```yaml
page_id: string
route: string
primary_object: string
required_data: string[]
optional_data: string[]
actions: string[]
loading_state: string
empty_state: string
error_state: string
permission_rules: string[]
```

当前 V2 页面：

- Dashboard
- Opportunity Radar
- Opportunity Workspace
- Buyer Intelligence
- BD Mission
- Conversation
- Playbook

---

# 3. Business Component Contract

每个业务组件固定结构：

```yaml
component_id: string
input: object
output: object | null
events: object[]
loading: boolean
error: object | null
empty: boolean
permissions: string[]
```

禁止：

- 组件内部直接访问第三方供应商 API
- 组件自行维护第二套 Opportunity 状态
- 组件绕过 Approval / Human Gate
- 组件把 UNKNOWN 渲染成猜测值

---

# 4. Shared State

全局共享状态只保留跨页面稳定对象：

```yaml
session:
  user: object | null
  role: SELLER | BUYER | INTERNAL | null
  token_state: string
active_context:
  opportunity_id: string | null
  mission_id: string | null
  buyer_id: string | null
ui:
  locale: string
  timezone: string | null
  feature_flags: object
```

业务数据优先通过 query cache / page loader 获取，禁止把完整 Opportunity、Buyer、Conversation 长期复制进全局 store。

---

# 5. Loading / Empty / Error

所有业务组件必须支持四态：

```text
LOADING
READY
EMPTY
ERROR
```

涉及运行时的组件增加：

```text
WAITING_EVIDENCE
WAITING_APPROVAL
BLOCKED
```

组件不得使用空白区域代替状态表达。

---

# 6. Component Events

统一事件结构：

```yaml
component_event:
  name: string
  source_component: string
  object_id: string | null
  payload: object
  occurred_at: datetime
```

前端事件类型示例：

```text
OPEN_OPPORTUNITY
OPEN_BUYER
CREATE_MISSION
START_MISSION
REQUEST_NEXT_ACTION
OPEN_EVIDENCE
SUBMIT_APPROVAL
SEND_MESSAGE
START_VOICE_SESSION
REQUEST_HUMAN_TAKEOVER
OPEN_PLAYBOOK
```

前端事件只表达用户意图；业务状态变更由 API / Runtime 返回确认结果后更新。

---

# 7. OpportunityCard

输入：

```yaml
opportunity:
  id: string
  buyer: object
  product: string | null
  priority: object | null
  score: object | null
  why_now: string[]
  stage: string | null
  status: string | null
  next_action: object | null
```

输出事件：

```text
OPEN_OPPORTUNITY
OPEN_EVIDENCE
TRIGGER_NEXT_ACTION
```

禁止在 Card 内执行外部发送。

---

# 8. EvidencePanel

输入：

```yaml
claim: string | null
evidence: object[]
conflicts: object[]
```

必须展示：

- FACT / DERIVED / INFERENCE / ACTION
- source
- observed_at
- confidence
- data_mode

事件：

```text
OPEN_SOURCE
OPEN_EVIDENCE_CHAIN
REQUEST_REVIEW
```

---

# 9. BuyerProfile

输入：`BuyerView`

模块：

```text
Company Summary
Contact Intelligence
Business Events
Procurement Intelligence
Supplier Intelligence
```

权限控制后的联系方式由服务端投影决定，组件不负责自行解锁字段。

---

# 10. ConversationTimeline

输入：

```yaml
threads: object[]
messages: object[]
next_action: object | null
human_takeover: object | null
```

事件：

```text
SEND_MESSAGE
EDIT_REPLY
SUBMIT_APPROVAL
START_VOICE_SESSION
REQUEST_HUMAN_TAKEOVER
```

---

# 11. VoiceConversationPanel

独立业务组件，属于 Conversation Page：

```yaml
input:
  opportunity_id: string
  thread_id: string | null
  buyer_context: object
state:
  session_status: IDLE | CONNECTING | LIVE | ENDED | ERROR
  transcript: object[]
  suggested_reply: string | null
  handoff_status: string
output_events:
  START
  STOP
  TAKEOVER
  SAVE_FACT
```

语音组件不直接修改 Opportunity Stage。

---

# 12. HumanTakeoverPanel

输入：

```yaml
required: boolean
reason_code: string | null
risk_summary: string | null
assigned_to: string | null
status: string
```

事件：

```text
CLAIM_TAKEOVER
RESOLVE_TAKEOVER
RETURN_TO_AI
```

---

# 13. Design Token Contract

共享视觉变量统一：

```text
color
spacing
radius
border
shadow
typography
z-index
motion
```

业务状态禁止用硬编码局部颜色定义第二套语义。

状态色语义至少覆盖：

- success
- warning
- danger
- info
- neutral
- unknown

---

# 14. Accessibility / Responsive

最低要求：

- 键盘可达
- Focus 状态明确
- 文字 / 状态不能只依赖颜色表达
- 移动端主操作不被折叠丢失
- 关键 CTA 保持安全点击区域
- 表格在小屏转为卡片或横向滚动

---

# 15. 验收

- [ ] Page / Business / Primitive 三层清楚
- [ ] 所有业务组件有 Input / Event / State
- [ ] Loading / Empty / Error 全覆盖
- [ ] WAITING_EVIDENCE / WAITING_APPROVAL 可见
- [ ] 前端不直接写 Runtime 状态
- [ ] Voice 独立组件且边界明确
- [ ] 权限投影由服务端提供
- [ ] Design Token 单一来源
