# QianPulse Conversation Progression 前端页面工程文档 V2.0

## 1. 页面定位

页面名称：Conversation Progression｜商务对话推进中心

页面目标：围绕一个 Opportunity 汇总多渠道沟通、买家回复、意向变化、关键问题、AI 建议与人工接管，让商机持续推进到报价、寄样、谈判和成交。

核心对象：`ConversationThread`、`Message`、`IntentState`、`NextAction`、`HumanGate`。

---

## 2. 页面能力边界

Conversation 负责：

- 汇总跨渠道对话
- 识别买家身份与意图
- 维护当前对话阶段
- 生成下一轮回复建议
- 管理低风险自动推进
- 管理人工审批与接管
- 记录报价、资料、样品等对话动作
- 将已验证事实回写 Opportunity

渠道发送由 Channel Hub 执行；Opportunity Intelligence 负责重新计算商机判断。

---

## 3. 页面结构

```text
Conversation Workspace
├── Conversation Header
├── Channel Switcher
├── Conversation Timeline
├── Buyer Intent Panel
├── Key Facts / Open Questions
├── AI Reply Composer
├── Voice Conversation Module
├── Attachment / Material Module
├── Next Action Panel
├── Human Takeover Panel
└── Opportunity Change Preview
```

---

## 4. 大组件

### 4.1 Conversation Header

字段：

- `opportunity_id`
- `buyer_name`
- `primary_contact`
- `conversation_stage`
- `intent_level`
- `last_message_at`
- `next_follow_up_at`
- `automation_mode`

### 4.2 Channel Switcher

渠道：

```text
EMAIL
LINKEDIN
WHATSAPP
TELEGRAM
WECHAT
VOICE
MANUAL
```

每个渠道显示授权状态、最后同步时间、自动发送能力和当前异常状态。

### 4.3 Conversation Timeline

消息字段：

- `message_id`
- `channel`
- `direction`
- `sender`
- `recipient`
- `sent_at`
- `body`
- `attachments[]`
- `delivery_status`
- `source_type`
- `fact_observations[]`

时间线同时展示 AI 动作、人工备注、审批结果、资料发送、报价、寄样等事件。

### 4.4 Buyer Intent Panel

字段：

- `identity_status`
- `role_fit`
- `intent_type`
- `intent_strength`
- `conversation_stage`
- `concerns[]`
- `objections[]`
- `requested_items[]`
- `confidence`

意向示例：资料请求、规格确认、价格询问、样品请求、采购计划、转介绍、暂缓、拒绝、退订。

### 4.5 Key Facts / Open Questions

组件：`ConversationFactsPanel`

分区：

- 已确认事实
- AI 计算结果
- 待确认字段
- 关键问题
- 冲突字段

买家在对话中确认的数量、目的地、交期、认证、预算等信息生成 Validation Event，并触发相关 SKILL 刷新。

### 4.6 AI Reply Composer

组件：`ReplyComposer`

输入：企业知识库、Buyer Context、Opportunity、当前 Thread、风险规则。

输出：

- 回复目标
- 回复草稿
- 语气
- 推荐资料
- 风险提示
- 自动化模式
- 需要人工确认的内容

操作：采用、编辑、重新生成、审批发送、转人工。

### 4.7 Voice Conversation Module

语音对话作为独立能力模块，统一挂载在 Conversation Workspace。

子模块：

```text
VoiceConversation
├── Microphone / Call Input
├── Speech To Text
├── Speaker / Role Detection
├── Live Transcript
├── Intent Extraction
├── Key Fact Extraction
├── Suggested Response
├── Text To Speech
├── Call Summary
└── Human Takeover
```

前端字段：

- `session_id`
- `call_status`
- `language`
- `speaker_role`
- `transcript_segments[]`
- `live_intent`
- `live_risk`
- `key_facts[]`
- `suggested_response`
- `latency_state`
- `human_takeover_required`

语音模块输出 Transcript、Fact Observations、Conversation Summary，继续进入统一 Conversation Contract。

### 4.8 Attachment / Material Module

支持：产品资料、认证、COA、报价单、样品清单、案例、企业介绍。

字段：文件类型、版本、可发送范围、语言、有效期、审批状态。

### 4.9 Next Action Panel

动作：

- 回复
- 问关键问题
- 发资料
- 补证据
- 准备报价
- 准备样品
- 安排进一步沟通
- 长期维护
- 人工接管
- 归档

### 4.10 Human Takeover Panel

触发：正式价格、合同、付款、独家、分成、强意向、高价值买家、投诉、品牌风险、AI 低置信度。

人工接管后保留完整 Context，允许随时交回 AI。

### 4.11 Opportunity Change Preview

买家回复引起商机字段变化时，展示：

```text
旧值 → 新值
Evidence
影响的 SKILL
影响的 Decision
```

确认后写回 Opportunity Store。

---

## 5. API Contract

```http
GET /api/v1/opportunities/{id}/conversation
POST /api/v1/opportunities/{id}/messages
POST /api/v1/opportunities/{id}/reply-draft
POST /api/v1/opportunities/{id}/messages/{message_id}/approve
POST /api/v1/opportunities/{id}/human-takeover
POST /api/v1/opportunities/{id}/resume-agent
GET /api/v1/opportunities/{id}/facts
PATCH /api/v1/opportunities/{id}/facts
POST /api/v1/voice/sessions
GET /api/v1/voice/sessions/{session_id}
POST /api/v1/voice/sessions/{session_id}/finish
```

---

## 6. React 结构

```text
src/pages/Conversation/
├── index.jsx
├── ConversationHeader.jsx
├── ChannelSwitcher.jsx
├── ConversationTimeline.jsx
├── BuyerIntentPanel.jsx
├── ConversationFactsPanel.jsx
├── ReplyComposer.jsx
├── VoiceConversation/
│   ├── index.jsx
│   ├── LiveTranscript.jsx
│   ├── IntentOverlay.jsx
│   ├── ResponseAssist.jsx
│   └── CallSummary.jsx
├── MaterialPanel.jsx
├── NextActionPanel.jsx
├── HumanTakeoverPanel.jsx
└── OpportunityChangePreview.jsx
```

---

## 7. 验收标准

- Email 与手动录入渠道可进入统一时间线。
- 买家回复可以形成结构化意向与字段观察。
- 低风险动作支持自动执行，高风险动作进入 Human Gate。
- 语音对话输出可进入同一 Conversation Contract。
- 对话中确认的新事实能够触发 Opportunity 判断刷新。
- 人工接管前后上下文连续、可追溯。