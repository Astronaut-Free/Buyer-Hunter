# QianPulse SKILL Development Status

## 已完成

```text
A2 SKILL spec                         DONE
A2 references                         DONE
A2 JSON / capability contracts        DONE
A2 deterministic runtime              DONE
A2 pre-reply follow-up guard          DONE
A2 adapter dispatch                   DONE
A2 provider pipeline                  DONE
A2 batch prospecting                  DONE
A2 Opportunity seeder                 DONE
A2 Opportunity Store contract         DONE
A2 Agent State persistence            DONE
A2 evidence-grounded outreach         DONE
A2 first-outreach Human Gate          DONE
A2 Smartlead first-send executor      DONE
Campaign template token guard         DONE
Seller evidence context persist       DONE

A3 purchase-timing refresh runtime    DONE
A3 evidence-safe timing signal        DONE
A4 supply-match refresh runtime       DONE
A4 changed-field evidence guard       DONE
A5 trade-risk refresh runtime         DONE
A5 blocked-market fail-closed guard   DONE
A3/A4/A5 Skill Registry metadata      DONE
Automatic dependency refresh runner   DONE
Dependency refresh fail-closed        DONE

A6 SKILL spec                         DONE
A6 references                         DONE
A6 JSON / capability contracts        DONE
A6 deterministic runtime              DONE
A6 intent taxonomy runtime            DONE
A6 changed-field routing              DONE
A6 structured field extraction        DONE
A6 dependency refresh gate            DONE
A6 auto dependency re-run             DONE
A6 key-question resolver              DONE
A6 evidence-safe reply draft          DONE
A6 Opportunity update contract        DONE
A6 verified field persistence         DONE
A6 Human Gate runtime                 DONE
A6 adapter dispatch                   DONE
A6 Smartlead reply executor           DONE

Capability Result Envelope            DONE
Skill Registry metadata               DONE
Event routing metadata                DONE
Deterministic validators              DONE
Mock providers                        DONE
Golden-path tests                     DONE
Node test suite                       109/109 PASS
GitHub Actions workflow               PASS
Runnable server layout                DONE
Server health smoke test              PASS
HTTP webhook + approval E2E           PASS

Apollo provider adapter               DONE
Trademo provider adapter              DONE
Smartlead provider adapter            DONE
Smartlead current reply contract      DONE
Smartlead email_stats_id resolve      DONE
Smartlead legacy explicit mode        DONE
Provider HTTP guard                   DONE
Agent-Skill bridge                    DONE
Smartlead webhook verification        DONE
Smartlead HTTP webhook endpoint       DONE
Smartlead webhook router              DONE
Webhook idempotency key               DONE
External lead → Opportunity map       DONE
Approval API → executor               DONE
Runtime orchestration layer           DONE
AgentRun / Step / Checkpoint          DONE
A3/A4/A5 dependency Step audit        DONE
Runtime startup config guard          DONE
Sandbox Smartlead base URL            DONE
Opportunity Workspace API             DONE
INTERNAL runtime observability        DONE
A2 → Reply → A6 E2E                   PASS
Full outreach progression E2E         PASS
Auto A3/A4 refresh progression E2E    PASS
A3/A4/A5 multi-change refresh         PASS
Provider integration docs             DONE
Live runbook                          DONE
```

## 当前主自动链路

```text
Seller Target
→ A2 Buyer Discovery / Contact Enrichment
→ Opportunity Store
→ A2 First-Outreach Human Gate
→ Smartlead Campaign Template Guard
→ Smartlead Lead Queue
→ Smartlead Lead ID ↔ Opportunity Binding
→ Signed Buyer Reply Webhook
→ Raw-body Signature Verification
→ Webhook Idempotency
→ BUYER_MESSAGE
→ Conservative Structured Field Extraction
→ A6 Intent / Changed Fields / Stage
→ invalidated_capabilities
→ Automatic A3 Purchase Timing Refresh
→ Automatic A4 Supply Match Refresh
→ Automatic A5 Trade Risk Refresh when required
→ Dependency Evidence Gate
→ A6 re-evaluation in the same progression cycle
→ Opportunity verified-field persistence
→ Evidence-safe Draft / Human Gate
→ Approval API
→ Smartlead Lead Activities
→ email_stats_id Resolution
→ Smartlead Thread Reply
→ Opportunity State / Outcome
→ Workspace / AgentRun / Step / Checkpoint / Observability
```

自动执行负责中间判断、证据刷新、状态更新与路由；系统只在人工审批、证据不足、显式风险阻断和高风险商业动作处停住。

## 当前验证基线

```text
GitHub Actions Run #85
109 tests
109 passed
0 failed
```

覆盖：

```text
- A2 Batch / Provider / Evidence / Outreach
- A2 first-outreach Human Gate / Campaign template validation
- Smartlead lead queue / lead lookup / external binding / idempotency
- Opportunity Seed / Agent State Store / Evidence context persistence
- Buyer text conservative field extraction
- quantity / destination / delivery_date structured persistence
- A3 timing refresh / A4 supply refresh / A5 trade-risk refresh
- automatic invalidated dependency execution
- missing seller evidence → WAITING_EVIDENCE
- blocked market → BLOCKED
- A6 automatic re-evaluation after dependency refresh
- A6 evidence-safe reply / Human Gate / approved Smartlead reply
- A3/A4/A5 dependency executions written into AgentRun Steps
- Smartlead Webhook / raw-body Signature / Mapping / fail-closed routing
- Smartlead current email_stats_id reply API / activity resolution / explicit legacy mode
- Shared Approval Executor
- Runtime startup production config fail-fast
- Opportunity Workspace role-safe projection
- INTERNAL runtime observability
- A2 → first approval → Smartlead → signed reply → A6 → second approval → Smartlead reply
- A2 → Smartlead → buyer delivery reply → auto A3/A4 refresh → A6 approval → Smartlead reply
- buyer multi-field change → A3/A4/A5 refresh → Opportunity facts persist
- HTTP POST webhook → A6 Approval → HTTP Approval API → Smartlead stats-id reply
- Server bootstrap / health smoke
```

## 闭环状态

```text
CORE AUTOMATIC ENGINEERING CHAIN      CLOSED
CONTROL / SAFETY CHAIN               CLOSED
STATE / AUDIT / OBSERVABILITY         CLOSED
SANDBOX / MOCK END-TO-END             CLOSED
REAL PROVIDER PRODUCTION SMOKE        EXTERNAL CREDENTIALS REQUIRED
```

当前代码层主链已经闭环。生产实网阶段仍需真实账号与凭据完成最终 Smoke：

```text
SMARTLEAD_API_KEY
SMARTLEAD_CAMPAIGN_ID
SMARTLEAD_WEBHOOK_SECRET
APOLLO_API_KEY
TRADEMO_BUYER_LIST_URL
```

Trademo 认证参数按实际账号协议注入：

```text
TRADEMO_API_KEY
TRADEMO_API_KEY_HEADER
TRADEMO_API_KEY_PREFIX
```

## 后续进入生产验证层

```text
P0-1 配置真实 Provider 凭据并通过 live startup guard
P0-2 固化真实 Smartlead webhook sample payload 并回放
P0-3 单一内部测试 Buyer 跑真实 A2 → Smartlead → Reply → A6 全链
P0-4 校验真实 Apollo / Trademo 请求口径、限流、失败码与重试策略
P0-5 校验真实 Opportunity Workspace / observability / audit 数据
P0-6 形成演示用真实商机闭环与生产 Smoke 证据包
```

继续复用现有 QianPulse Agent / Capability Adapter / Decision Engine / Repository；保持单 Runtime，专业业务判断继续留在独立 SKILL。
