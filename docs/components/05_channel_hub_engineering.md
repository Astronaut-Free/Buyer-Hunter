# 05 Channel Hub Engineering

## 组件定位

多渠道商务触达能力中心。

目标：让 AI 根据商机阶段选择合适渠道建立关系。

## 能力边界

负责：
- Email
- LinkedIn
- WhatsApp
- Telegram
- 微信/企微预留
- 展会及社群触达

不负责：
- 商机判断
- 对话推进
- 合同报价

## 子模块

### Channel Resolver
根据对象、地区、阶段推荐渠道。

### Message Composer
生成不同渠道沟通内容。

### Approval Gate
高风险内容进入人工确认。

### Channel Adapter
连接外部发送能力。

## 输入

Opportunity
Buyer Profile
Conversation Context
Knowledge Base

## 输出

Conversation Event
Message Draft
Action Request

## API

GET /channels
POST /messages/draft
POST /messages/send

## 验收

- 支持多渠道内容生成
- 保留人工审批
- 渠道能力可插拔
