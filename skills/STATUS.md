# A2 / A6 SKILL Development Status

## 已完成

```text
A2 SKILL spec                  DONE
A2 references                  DONE
A2 JSON / capability contracts DONE
A2 deterministic runtime       DONE
A2 pre-reply follow-up guard   DONE
A2 adapter dispatch            DONE

A6 SKILL spec                  DONE
A6 references                  DONE
A6 JSON / capability contracts DONE
A6 deterministic runtime       DONE
A6 intent taxonomy runtime     DONE
A6 changed-field routing       DONE
A6 Human Gate runtime          DONE
A6 adapter dispatch            DONE

Capability Result Envelope     DONE
Skill Registry metadata        DONE
Event routing metadata         DONE
Deterministic validators       DONE
Mock providers                 DONE
Golden-path tests              DONE
Node test suite                DONE
GitHub Actions workflow        DONE

Apollo provider adapter        DONE
Trademo provider adapter       DONE
Smartlead provider adapter     DONE
Provider HTTP guard            DONE
Agent-Skill bridge             DONE
Provider integration doc       DONE
```

## 测试记录

前一轮 A2/A6 Runtime 基线：

```text
17 tests
17 passed
0 failed
```

本轮新增隔离验证：

```text
Provider tests  6 / 6 passed
Bridge tests    5 / 5 passed
```

GitHub Actions 工作流已经提交；截至本轮检查尚未产生远端 workflow run，因此暂不把本地结果写成 CI 通过。

## 下一工程层

```text
P0-1 接入现有 Agent CAPABILITIES Registry
P0-2 BUYER_MESSAGE 正式切换到 A6 capability
P0-3 SELLER_PROACTIVE_DEVELOPMENT / SYSTEM_NEW_PROSPECT_SIGNAL 接入 A2
P0-4 Smartlead Email Webhook → ConversationEvent → A6 Resume
P0-5 Approval → external send/reply idempotent executor
P0-6 provider production credentials / sandbox smoke test
P0-7 end-to-end Opportunity demo
```

继续复用现有 QianPulse Agent / Capability Adapter / Decision Engine / Repository；优先增量修改现有代码，避免建立第二套 Runtime。
