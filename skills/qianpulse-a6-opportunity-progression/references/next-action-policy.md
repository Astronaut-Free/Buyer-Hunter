# A6 Next Best Action Policy

## 1. Action Taxonomy

```text
ANSWER_WITH_EVIDENCE
ASK_KEY_QUESTION
SEND_MATERIAL
REQUEST_MORE_EVIDENCE
CREATE_QUOTE_TASK
CREATE_SAMPLE_TASK
SCHEDULE_FOLLOWUP
ENTER_NURTURE
REQUEST_REFERRAL
REQUEST_APPROVAL
HUMAN_TAKEOVER
STOP_CONTACT
MARK_WON
MARK_LOST
WAIT
```

## 2. 选择顺序

优先判断：

```text
Stop / Block
→ Human Risk
→ Missing Evidence
→ Buyer Blocking Question
→ Progress Action
→ Follow-up / Wait
```

## 3. 示例

| Buyer Event | 推荐动作 |
|---|---|
| 要产品资料 | SEND_MATERIAL |
| 问 MOQ 且已有验证值 | ANSWER_WITH_EVIDENCE |
| 问 MOQ 且卖家数据缺失 | REQUEST_MORE_EVIDENCE |
| 要样品 | CREATE_SAMPLE_TASK |
| 问正式报价 | HUMAN_TAKEOVER / CREATE_QUOTE_TASK |
| 不是负责人 | REQUEST_REFERRAL |
| 暂时没需求 | ENTER_NURTURE |
| 退订 | STOP_CONTACT |
| 只是礼貌感谢 | WAIT 或 ASK_KEY_QUESTION，按上下文决定 |

## 4. 输出要求

每个动作必须给：

```text
reason
expected_progress
prerequisites
evidence_refs
```

禁止只输出动作标签。