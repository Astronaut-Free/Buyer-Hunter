# 黔脉 QianPulse｜A2 / A6 Runtime Orchestration V1

## 本轮目标

把已经完成的 A2 / A6 SKILL runtime 串成同一条 Opportunity 主链，同时继续复用现有 QianPulse Agent 控制面。

```text
A2 Batch
→ READY Buyer Company
→ Opportunity Seed
→ Opportunity Store
→ Email transport binding
→ Smartlead reply webhook
→ BUYER_MESSAGE Event
→ A6 Progression
→ Dependency Refresh Gate
→ Human Gate / Wait / Outcome
```

## Opportunity Store

`opportunity-store.js` 提供一期最小 Store contract：

- `upsertSeed()`：按 `seed_key` 幂等创建 Opportunity。
- `bindExternalRef()`：绑定 Smartlead lead 等外部 transport id。
- `resolveExternalRef()`：Webhook 回来时可靠解析 Opportunity。
- `applyA6Envelope()`：只消费 A6 结构化结果更新 Opportunity。

一期 Memory Store 用于测试与 Demo；正式落库时保持同一接口替换 Repository 实现。

## A2 Orchestration

`qianpulse-skill-orchestrator.js#runProactiveDevelopment()`：

```text
createA2BatchPipeline
→ createOpportunitySeeds
→ OpportunityStore.upsertSeeds
```

只有 `READY + evidence-grounded outreach` 候选会进入 Opportunity Store。

## A6 Orchestration

`runBuyerProgression()`：

```text
A6 ANALYSIS
→ Agent refreshes affected skills by input_hash
→ A6 FINAL
→ validateA6Envelope
→ OpportunityStore.applyA6Envelope once
→ Reply Composer
→ Human Gate
```

业务字段变化导致 A3/A4/A5 失效时，Opportunity 进入 `WAITING_EVIDENCE`，等待相关能力增量刷新。

## Smartlead Mapping

`webhooks/smartlead-router.js` 不猜 Smartlead 未确认 payload 字段。真实账户 sample webhook 到手后，通过 `extractReply(normalizedEvent)` 固化 mapping。

Webhook 必须先完成：

```text
external lead id
→ Opportunity binding
```

无法解析时返回 `NEEDS_CONTEXT`，禁止猜测绑定。

## 下一步

1. 将 Store contract 接入现有 Agent State / Repository。
2. 将 Smartlead HTTP endpoint 接入验签、去重与 Router。
3. 将 routed BUYER_MESSAGE 交给现有 Agent Event / Resume。
4. Approval 通过后调用 external-action-executor。
5. 跑完整 A2 → Email → Reply → A6 E2E。
