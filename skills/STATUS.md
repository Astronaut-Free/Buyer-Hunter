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
A6 Human Gate runtime            DONE
A6 adapter dispatch              DONE

Capability Result Envelope       DONE
Skill Registry metadata          DONE
Event routing metadata           DONE
Deterministic validators         DONE
Mock providers                   DONE
Golden-path tests                DONE
Node test suite                  DONE
GitHub Actions workflow          DONE

Apollo provider adapter          DONE
Trademo provider adapter         DONE
Smartlead provider adapter       DONE
Provider HTTP guard              DONE
Agent-Skill bridge               DONE
Smartlead webhook verification   DONE
Webhook idempotency key          DONE
Approved reply executor          DONE
Provider integration docs        DONE
```

## 测试记录

前一轮 A2/A6 Runtime 基线：

```text
17 tests
17 passed
0 failed
```

后续新增隔离验证：

```text
Provider + Bridge       11 / 11 passed
A2 pipeline              2 / 2 passed
Webhook / Executor       4 / 4 passed
A6 Dependency Gate       3 / 3 passed
A2/A6 Draft Enrichment   5 / 5 passed
```

GitHub Actions 工作流已经提交；截至最近一次远端检查尚未产生 workflow run，因此暂不把本地结果写成 CI 通过。

## 下一工程层

```text
P0-1 接入现有 Agent CAPABILITIES Registry
P0-2 BUYER_MESSAGE 正式切换到 A6 capability
P0-3 SELLER_PROACTIVE_DEVELOPMENT / SYSTEM_NEW_PROSPECT_SIGNAL 接入 A2
P0-4 新增 Smartlead Webhook HTTP endpoint
P0-5 真实 Smartlead sample payload → ConversationEvent mapping
P0-6 Approval endpoint 接 external executor
P0-7 provider production credentials / sandbox smoke test
P0-8 end-to-end Opportunity demo
```

继续复用现有 QianPulse Agent / Capability Adapter / Decision Engine / Repository；优先增量修改现有代码，避免建立第二套 Runtime。
