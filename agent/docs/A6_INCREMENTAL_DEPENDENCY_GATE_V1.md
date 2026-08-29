# 黔脉 QianPulse｜A6 Incremental Dependency Gate V1

## 1. 当前机制

A6 收到买家新消息后，如果 `quantity / destination / specification / certification / delivery_date / payment_terms` 等字段变化导致 A3 / A4 / A5 旧结果失效，当前 Runtime 会在同一 progression cycle 自动刷新受影响 SKILL，再执行 A6 第二次判断。

```text
Buyer Message
→ A6 ANALYSIS
→ field_observations.updates + field_observations.mentions
→ affected_skills
→ Agent-owned Dependency Runner + input_hash freshness check
→ A3 / A4 / A5 selective refresh
→ Merge skill_results
→ A6 FINAL
→ Dependency Gate
→ Contract Validation / Opportunity State Update Once
→ Next Best Action / Communication Brief / Wait / Block / Human Takeover
```

这层机制保持增量执行。没有失效的 SKILL 不重复运行。

## 2. 失效路由

当前 A6 路由：

```text
quantity
→ qianpulse.a4.supply_match
→ qianpulse.a3.purchase_timing

destination
→ qianpulse.a5.trade_risk
→ qianpulse.a3.purchase_timing

specification
→ qianpulse.a4.supply_match

certification
→ qianpulse.a5.trade_risk
→ qianpulse.a4.supply_match

delivery_date
→ qianpulse.a4.supply_match
→ qianpulse.a3.purchase_timing

payment_terms
→ qianpulse.a5.trade_risk
```

具体刷新范围由 A6 的 `field_observations → affected_skills` 产生；执行权和新鲜度判断属于 Agent Orchestrator。

## 3. A3 / A4 / A5 刷新职责

```text
A3 qianpulse.a3.purchase_timing
- 读取最新 Buyer timing signal
- 读取结构化 purchase / delivery window
- 缺少可靠 timing signal → MORE_EVIDENCE

A4 qianpulse.a4.supply_match
- 数量变化 → 校验 capacity / MOQ
- 规格变化 → 校验 specification
- 认证变化 → 校验 certifications
- 交期变化 → 校验 delivery / lead time
- 缺少卖家事实 → MORE_EVIDENCE

A5 qianpulse.a5.trade_risk
- 目的地变化 → 校验 market access / blocked market
- 认证变化 → 校验 trade-risk context
- 支付条件变化 → 校验 payment policy
- explicit blocked market → BLOCKED
- 缺少政策依据 → MORE_EVIDENCE
```

A3 / A4 / A5 继续保持独立 SKILL。A6 负责状态推进、变化识别、依赖声明和最终 Next Best Action。

## 4. 刷新状态协议

Dependency Runner 对每个 SKILL 使用统一 Capability Result Envelope：

```text
DONE
NOT_APPLICABLE
BLOCKED
MORE_EVIDENCE
ERROR
```

处理规则：

```text
DONE
→ 标记 refreshed

NOT_APPLICABLE
→ 标记 refreshed

BLOCKED
→ 标记 refreshed
→ 保留阻断结果

MORE_EVIDENCE
→ 不标记 refreshed
→ Dependency Gate 保留 required capability
→ Opportunity = WAITING_EVIDENCE

ERROR
→ 进入执行错误路径
```

系统不会把缺失事实当成已刷新结果。

## 5. 自动二次 A6 判断

第一次 A6 Pass 只负责识别当前消息的业务变化与失效依赖。

Dependency Runner 完成后，将最新结果重新注入：

```yaml
a3_result: <latest A3 envelope>
a4_result: <latest A4 envelope>
a5_result: <latest A5 envelope>
refreshed_capabilities:
  - qianpulse.a3.purchase_timing
  - qianpulse.a4.supply_match
```

随后执行 A6 Second Pass。

当全部 invalidated capabilities 已刷新：

```text
Dependency Gate required = []
→ A6 可以进入普通 Next Best Action
```

存在未完成刷新项：

```text
Dependency Gate required != []
→ MORE_EVIDENCE
→ WAIT
```

## 6. 高风险场景

正式报价、支付条件、合同、独家等场景触发 `HUMAN_TAKEOVER` 时，Dependency Gate 保留 HUMAN 状态，同时继续执行可执行的专业依赖刷新。

如果风险依赖缺少证据，系统会同时保留：

```text
HUMAN review requirement
+
refresh_affected_skills prerequisite
```

业务员可以立即看到接管要求，系统不会使用过期专业结果继续对外动作。

## 7. 结构化字段进入依赖刷新

当前 progression cycle 会先运行保守字段提取：

```text
quantity
destination
delivery_date
payment_terms
certification
specification
```

明确提取值进入 `field_observations.updates`；询问进入 `field_observations.mentions`，随后由 A6 产生 `affected_skills`。

显式 API `field_updates` 优先级高于文本提取。无法可靠提取的字段不会写入 Opportunity。

## 8. Opportunity 持久化

最终 A6 Envelope 应用时，仅写入：

```text
field_observations.updates[].after
```

Opportunity 保存：

```text
fields
A6 run status
next_action
execution_mode
dependency_refresh
applied_field_updates
pending_structured_extraction
evidence_ids
stage
status
```

MORE_EVIDENCE 时，已可靠确认的字段仍可进入 Opportunity；缺少结构化依据的字段保留在 `pending_structured_extraction`。

## 9. AgentRun 审计

自动刷新执行会进入统一 AgentRun Step：

```text
Step N     A3 / A4 / A5 dependency capability
Step N+1   qianpulse.a6.opportunity_progression
```

每个 dependency Step 记录：

```text
capability_id
capability_version
input_hash
output_hash
status
evidence_refs
result
```

`run.capabilities_called` 与实际 Step 顺序一致。Checkpoint 指向当前 progression cycle 最终 A6 Step。

## 10. 工程位置

```text
skill-runtime/a3.js
skill-runtime/a4.js
skill-runtime/a5.js
skill-runtime/dependency-refresh.js
skill-runtime/a6-field-extractor.js
skill-runtime/a6.js
skill-runtime/a6-enrichment.js
skill-runtime/a6-dependency-gate.js
qianpulse-skill-orchestrator.js
server/a2a6-live-runtime.js
server/agent-state-opportunity-store.js
opportunity-store.js
```

## 11. 当前验证

```text
GitHub Actions Run #85
109 tests
109 passed
0 failed
```

关键闭环测试包含：

```text
Buyer delivery question
→ A3 + A4 automatic refresh
→ A6 resumes
→ verified lead-time draft

Buyer quantity + destination + delivery date changes
→ structured extraction
→ A3 + A4 + A5 refresh
→ verified Opportunity fields persisted

Missing capacity / MOQ evidence
→ A4 MORE_EVIDENCE
→ Opportunity WAITING_EVIDENCE

Explicit blocked destination
→ A5 BLOCKED
→ risk block preserved
```
