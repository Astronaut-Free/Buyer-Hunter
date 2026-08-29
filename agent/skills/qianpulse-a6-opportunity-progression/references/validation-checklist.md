# A6 Validation Checklist

运行结束前逐项检查：

- [ ] Opportunity 已可靠绑定。
- [ ] 原始 Buyer Message 已保存为 ConversationEvent。
- [ ] Reply Intent 来自固定 taxonomy。
- [ ] changed fields 有原始消息证据。
- [ ] 未变化字段没有被虚构为变化。
- [ ] A3/A4/A5 专业判断没有进入 A6。
- [ ] Stage 变化有证据；允许保持原 Stage。
- [ ] 当前 key question 只聚焦最关键阻塞点。
- [ ] Next Action 来自固定 taxonomy。
- [ ] A5 BLOCKED / unsubscribe 优先于推进。
- [ ] 高风险动作进入 HUMAN。
- [ ] 外发副作用经过 Human Gate 和 idempotency。
- [ ] 新事件只触发增量重跑。
- [ ] WAIT / Resume 可从 Checkpoint 继续。
- [ ] Outcome 有 reason 和 evidence refs。
