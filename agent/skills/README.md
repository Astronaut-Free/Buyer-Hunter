# QianPulse Skills

当前落地：

- `qianpulse-a2-proactive-buyer-development`：A2 主动商机拓展。
- `qianpulse-a6-opportunity-progression`：A6 成交自动推进。

每个 SKILL 目录采用渐进加载：

```text
SKILL.md
├─ references/
├─ contracts/
└─ evals/
```

原则：

1. SKILL 保存专业业务逻辑。
2. Agent 负责事件、状态、路由、等待、恢复、审批和 Trace。
3. Tool / Service / Engine 保存确定性执行与外部集成。
4. 外部供应商通过 Adapter 替换，避免写死在 SKILL。
5. 一期 A2 / A6 自动渠道控制在 Email，不扩张全部社媒工具。
