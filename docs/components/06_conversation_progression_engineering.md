# 06 Conversation Progression Engineering

## 组件定位

AI 商务关系推进中心。

目标：像真人 BD 一样持续理解回复、判断意向、推进下一步。

## 核心能力

- 对话同步
- 身份判断
- 意向判断
- 阶段判断
- 下一步推荐
- 人工接管

## 子模块

### Conversation Timeline
记录所有沟通事件。

### Intent Analyzer
分析兴趣、需求、风险。

### Reply Agent
生成下一轮回复。

### Voice Conversation
语音输入、语音识别、语音回复。

### Human Takeover
高价值、高风险场景转人工。

## 输入

Conversation Event
Buyer Profile
Opportunity
Knowledge Base

## 输出

Next Action
Reply Draft
Opportunity Update

## 状态

DISCOVERED
CONTACTED
REPLIED
QUALIFIED
NEGOTIATION
WON
LOST

## API

GET /conversation/{id}
POST /conversation/analyze
POST /conversation/next-action

## 验收

- AI可以判断对话阶段
- AI可以生成下一步动作
- 人工随时接管
