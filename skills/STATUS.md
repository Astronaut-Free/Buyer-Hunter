# A2 / A6 SKILL Development Status

## 当前状态

```text
A2 SKILL spec           DONE
A2 references           DONE
A2 contracts            DONE
A2 eval cases           DONE
A2 implementation notes DONE

A6 SKILL spec           DONE
A6 references           DONE
A6 contracts            DONE
A6 eval cases           DONE
A6 routing notes        DONE
A6 implementation notes DONE
```

## 下一工程层

```text
P0-1 Capability Registry integration
P0-2 A2/A6 Adapter interface implementation
P0-3 deterministic validators / guards
P0-4 mock provider + golden path tests
P0-5 Agent routing_policy integration
P0-6 Email transport event loop
P0-7 end-to-end Opportunity demo
```

原则：继续复用现有 QianPulse Agent / Capability Adapter / Decision Engine / Repository；优先增量修改现有代码，避免建立第二套 runtime。
