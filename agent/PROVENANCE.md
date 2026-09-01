# agent/ — provenance

This directory is the **QianPulse A2/A6 Node.js runtime**, vendored wholesale from
the `MVP` branch of this repository.

| | |
|---|---|
| Source branch | `origin/MVP` |
| Source commit | `ae71ca8176f9e736fee7c02c5c4ea9ffbb3b2613` |
| Vendored on | 2026-08-29 |
| Vendored into | `integration` branch, under `agent/` |
| Method | `git read-tree --prefix=agent/ -u origin/MVP` (tree snapshot, no history) |
| Author of the vendored code | 剑锋传奇 |

## What was changed after vendoring

Only path wiring — **no business-logic changes** to the A2/A6 state machine, per the
handoff document's constraint (`黔脉_A2_A6_代码交接文档_V1.0.md` §30).

- `agent/repository.js` — reads `agent/db/opportunities.json` (bridge output) with a
  fallback to `agent/db/free-opportunities.json` (the original hand-authored seed).
- `.github/workflows/skill-tests.yml` — moved to the repo root as
  `agent-skill-tests.yml` with `working-directory: agent`.

## Do not modify without full regression

Per the handoff doc, these are protected until there is complete regression coverage:

```
skill-runtime/a2.js
skill-runtime/a6.js
skill-runtime/dependency-refresh.js
server/a2a6-live-runtime.js
server/a2-first-outreach-executor.js
server/approval-live-executor.js
server/agent-state-opportunity-store.js
webhooks/smartlead-router.js
```

## Runtime docs

- `agent/skills/qianpulse-a2-proactive-buyer-development/SKILL.md`
- `agent/skills/qianpulse-a6-opportunity-progression/SKILL.md`
- `agent/docs/A2_A6_LIVE_RUNBOOK_V1.md`
- `agent/skills/STATUS.md`
- Repo-level index: `docs/17_A2_A6_模块索引.md`
