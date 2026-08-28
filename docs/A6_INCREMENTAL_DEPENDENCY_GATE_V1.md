# 黔脉 QianPulse｜A6 Incremental Dependency Gate V1

## 1. 修正点

A6 收到买家新消息后，如果 `quantity / destination / specification / certification / delivery_date / payment_terms` 等字段变化导致 A3 / A4 / A5 旧结果失效，A6 不能继续使用旧结果生成可执行回复。

新增：

```text
A6 Changed Fields
→ invalidated_capabilities
→ Dependency Gate
→ 缺刷新结果：MORE_EVIDENCE / WAIT
→ Agent 增量执行受影响能力
→ Resume A6 with refreshed_capabilities
→ Final Next Best Action
```

## 2. 高风险例外

正式报价、支付条件、合同、独家等已经触发 `HUMAN_TAKEOVER` 的场景，Dependency Gate 保留 HUMAN 状态，同时要求刷新专业能力。

这样业务员可以立即看到高风险接管提醒，系统也不会继续使用过期专业结果。

## 3. 新输入

```yaml
refreshed_capabilities:
  - qianpulse.a4.supply_match
  - qianpulse.a5.trade_risk
```

当 `invalidated_capabilities` 已全部包含在 `refreshed_capabilities` 中，A6 才恢复普通 Next Best Action。

## 4. 工程位置

```text
skill-runtime/a6-dependency-gate.js
capability-adapter.js
agent-skill-bridge.js
```

这层 Gate 属于能力执行保护，不把 A3 / A4 / A5 专业判断写进 A6。
