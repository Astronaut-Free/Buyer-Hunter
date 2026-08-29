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
A2 evidence-grounded outreach    DONE

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

Capability Result Envelope       DONE
Skill Registry metadata          DONE
Event routing metadata           DONE
Deterministic validators         DONE
Mock providers                   DONE
Golden-path tests                DONE
Node test suite                  53/53 PASS
GitHub Actions workflow          PASS
Runnable server layout           DONE
Server health smoke test         PASS

Apollo provider adapter          DONE
Trademo provider adapter         DONE
Smartlead provider adapter       DONE
Provider HTTP guard              DONE
Agent-Skill bridge               DONE
Smartlead webhook verification   DONE
Smartlead webhook router         DONE
Webhook idempotency key          DONE
External lead → Opportunity map  DONE
Approved reply executor          DONE
Runtime orchestration layer      DONE
A2 → Smartlead Reply → A6 E2E    PASS
Provider integration docs        DONE
```

## 当前工程主链

```text
Seller target
→ A2 Batch
→ Opportunity Store
→ Outreach Approval
→ Email transport
→ Smartlead external lead binding
→ Signed Buyer Reply Webhook
→ Webhook Idempotency
→ BUYER_MESSAGE
→ A6 Progression
→ A3/A4/A5 Dependency Refresh
→ Draft / Human Gate / Outcome
```

## 当前验证基线

```text
GitHub Actions Run #15
53 tests
53 passed
0 failed

包含：
- A2 Batch / Provider / Evidence / Outreach
- Opportunity Seed / Store / Idempotency
- A6 Intent / Stage / Changed Fields / Dependency Gate
- Smartlead Provider / Webhook / Signature / Mapping
- A2 → Opportunity → Smartlead Reply → A6 E2E
- Server bootstrap / health smoke
```

## 下一工程层

```text
P0-1 Store contract 接入现有 Agent State / Repository
P0-2 Smartlead HTTP endpoint 接入现有 server request handler
P0-3 Routed BUYER_MESSAGE 接现有 AgentRun / Checkpoint / Resume
P0-4 Approval endpoint 接 external-action-executor
P0-5 真实 Smartlead sample payload 固化 extractReply mapping
P0-6 provider production credentials / sandbox smoke test
P0-7 前端 Opportunity Workspace 展示 A2/A6 运行状态
P0-8 完整可演示成交推进链路
```

继续复用现有 QianPulse Agent / Capability Adapter / Decision Engine / Repository；保持单 Runtime，所有专业业务判断继续留在独立 SKILL。
