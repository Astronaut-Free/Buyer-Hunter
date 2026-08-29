# A6 Domain Stage Machine

## 1. Stage 列表

```text
CONTACTED
REPLIED
QUALIFYING
NEEDS_INFORMATION
SOLUTION_FIT
QUOTE_OR_SAMPLE
COMMERCIAL_DISCUSSION
NURTURE
WON
LOST
STOPPED
```

## 2. 基本原则

- Stage 属于 Opportunity domain view。
- Stage 与 Agent Run State 分离。
- Stage 与 Conversation State 分离。
- 一条消息允许保持原 Stage。
- Stage 改变必须有事件或证据。

## 3. 常见迁移

| Current | Event / Evidence | Next |
|---|---|---|
| CONTACTED | 有效回复 | REPLIED |
| REPLIED | 需要确认需求、角色、规格 | QUALIFYING |
| QUALIFYING | 缺关键卖家/买家信息 | NEEDS_INFORMATION |
| QUALIFYING | 产品与需求基本匹配 | SOLUTION_FIT |
| SOLUTION_FIT | 报价或寄样进入执行 | QUOTE_OR_SAMPLE |
| QUOTE_OR_SAMPLE | 进入价格/条款讨论 | COMMERCIAL_DISCUSSION |
| any active | 暂无需求但未来可跟 | NURTURE |
| any active | 成交证据 | WON |
| any active | 明确丢单 | LOST |
| any active | 退订 / 禁止联系 | STOPPED |

## 4. 禁止

- 因“积极语气”直接跳 WON。
- 因“询价”直接认定成交概率。
- 自动把长期静默标记 LOST，除非规则或人工明确。