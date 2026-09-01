# A2 Pre-reply Follow-up Policy

## 1. 范围

只处理买家尚未有效回复的阶段。

一旦出现有效 Buyer Reply，立即转 A6。

## 2. 动作枚举

```text
WAIT
FOLLOW_UP
REFRESH_RESEARCH
STOP
HANDOFF_A6
```

## 3. 输入因素

```text
last_sent_at
send_count
delivery_state
reply_state
suppression_state
new_signal
buyer_fit_change
```

## 4. 时间约束

时间规则属于确定性 Engine：

- earliest_next_send_at
- max_send_count
- quiet_hours
- market_timezone
- cooldown

SKILL 消费计算结果，不自行计算复杂发送日历。

## 5. Stop 优先级

```text
UNSUBSCRIBE
HARD_BOUNCE
MANUAL_STOP
A5_BLOCKED
MAX_OUTREACH_REACHED
```

这些状态优先于任何 Follow-up 建议。

## 6. 禁止固定 Sequence 中心化

Day 1 / 3 / 7 等时间点可以作为配置项。

最终动作仍依据：

```text
时间是否允许
× 当前状态
× 历史动作
× 新信号
```

共同决定。