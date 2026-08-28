# A2 / A6 SKILL Development Status

## 已完成

```text
A2 SKILL spec                 DONE
A2 references                 DONE
A2 JSON / capability contracts DONE
A2 deterministic runtime      DONE
A2 pre-reply follow-up guard  DONE
A2 adapter dispatch           DONE

A6 SKILL spec                 DONE
A6 references                 DONE
A6 JSON / capability contracts DONE
A6 deterministic runtime      DONE
A6 intent taxonomy runtime    DONE
A6 changed-field routing      DONE
A6 Human Gate runtime         DONE
A6 adapter dispatch           DONE

Capability Result Envelope    DONE
Skill Registry metadata       DONE
Event routing metadata        DONE
Deterministic validators      DONE
Mock providers                DONE
Golden-path tests             DONE
Node test suite               DONE
GitHub Actions test workflow  DONE
```

## 当前测试基线

```text
17 tests
17 passed
0 failed
```

本地隔离验证已通过 Node 20 兼容的 `node --test` 运行方式。

## 下一工程层

```text
P0-1 接入现有 Agent CAPABILITIES Registry
P0-2 BUYER_MESSAGE 正式切换到 A6 capability
P0-3 SELLER_PROACTIVE_DEVELOPMENT / SYSTEM_NEW_PROSPECT_SIGNAL 接入 A2
P0-4 trade/contact/email provider adapters
P0-5 Email Webhook → ConversationEvent → A6 Resume
P0-6 Approval → external send/reply idempotent executor
P0-7 end-to-end Opportunity demo
```

继续复用现有 QianPulse Agent / Capability Adapter / Decision Engine / Repository；优先增量修改现有代码，避免建立第二套 Runtime。
