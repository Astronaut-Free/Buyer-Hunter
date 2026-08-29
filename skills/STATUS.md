# A2 / A6 SKILL Development Status

## 已完成

```text
A2 SKILL spec                    DONE
A2 references                    DONE
A2 JSON / capability contracts   DONE
A2 deterministic runtime         DONE
A2 pre-reply follow-up guard     DONE
A2 adapter dispatch              DONE
A2 provider pipeline             DONE
A2 batch prospecting             DONE
A2 Opportunity seeder            DONE
A2 Opportunity Store contract    DONE
A2 Agent State persistence       DONE
A2 evidence-grounded outreach    DONE
A2 first-outreach Human Gate     DONE
A2 Smartlead first-send executor DONE
Campaign template token guard    DONE
Seller evidence context persist  DONE

A6 SKILL spec                    DONE
A6 references                    DONE
A6 JSON / capability contracts   DONE
A6 deterministic runtime         DONE
A6 intent taxonomy runtime       DONE
A6 changed-field routing         DONE
A6 dependency refresh gate       DONE
A6 key-question resolver         DONE
A6 evidence-safe reply draft     DONE
A6 Opportunity update contract   DONE
A6 Human Gate runtime            DONE
A6 adapter dispatch              DONE
A6 Smartlead reply executor      DONE

Capability Result Envelope       DONE
Skill Registry metadata          DONE
Event routing metadata           DONE
Deterministic validators         DONE
Mock providers                   DONE
Golden-path tests                DONE
Node test suite                  90/90 PASS
GitHub Actions workflow          PASS
Runnable server layout           DONE
Server health smoke test         PASS
HTTP webhook + approval E2E      PASS

Apollo provider adapter          DONE
Trademo provider adapter         DONE
Smartlead provider adapter       DONE
Smartlead current reply contract DONE
Smartlead email_stats_id resolve DONE
Smartlead legacy explicit mode   DONE
Provider HTTP guard              DONE
Agent-Skill bridge               DONE
Smartlead webhook verification   DONE
Smartlead HTTP webhook endpoint  DONE
Smartlead webhook router         DONE
Webhook idempotency key          DONE
External lead → Opportunity map  DONE
Approval API → executor          DONE
Runtime orchestration layer      DONE
AgentRun / Step / Checkpoint     DONE
Runtime startup config guard     DONE
Sandbox Smartlead base URL       DONE
A2 → Reply → A6 E2E              PASS
Full outreach progression E2E    PASS
Provider integration docs        DONE
Live runbook                     DONE
```

## 当前工程主链

```text
Seller target
→ A2 Batch
→ Buyer / Contact Evidence
→ Opportunity Store
→ A2 First-Outreach Human Gate
→ Smartlead Campaign Template Guard
→ Smartlead Lead Queue
→ Smartlead Lead ID ↔ Opportunity Binding
→ Signed Buyer Reply Webhook
→ Raw-body Signature Verification
→ Webhook Idempotency
→ BUYER_MESSAGE
→ A6 Progression
→ A3/A4/A5 Dependency Refresh Gate
→ Evidence-safe Draft / Human Gate
→ Approval API
→ Smartlead Lead Activities
→ email_stats_id Resolution
→ Smartlead Thread Reply
→ Opportunity State / Outcome
```

## 当前验证基线

```text
GitHub Actions Run #51
90 tests
90 passed
0 failed

覆盖：
- A2 Batch / Provider / Evidence / Outreach
- A2 first-outreach Human Gate / Campaign template validation
- Smartlead lead queue / lead lookup / external binding / idempotency
- Opportunity Seed / Agent State Store / Evidence context persistence
- A6 Intent / Stage / Changed Fields / Dependency Gate
- A6 evidence-safe reply / Human Gate / approved Smartlead reply
- Smartlead Webhook / raw-body Signature / Mapping / fail-closed routing
- Smartlead current email_stats_id reply API / activity resolution / explicit legacy mode
- Shared Approval Executor
- Runtime startup production config fail-fast
- A2 → first approval → Smartlead → signed reply → A6 → second approval → Smartlead reply
- HTTP POST webhook → A6 Approval → HTTP Approval API → Smartlead stats-id reply
- Server bootstrap / health smoke
```

## 下一工程层

```text
P0-1 provider production credentials / real sandbox smoke
P0-2 真实 Smartlead webhook sample payload 固化与回放
P0-3 A3 / A4 / A5 live provider refresh 接入
P0-4 Opportunity Workspace 展示 A2 / A6 / Approval / Trace 状态
P0-5 metrics / audit / provider failure observability
P0-6 可演示真实商机全链路：找客 → 首触达 → 回复 → 推进
```

继续复用现有 QianPulse Agent / Capability Adapter / Decision Engine / Repository；保持单 Runtime，专业业务判断继续留在独立 SKILL。
