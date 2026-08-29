---
name: qianpulse-a6-opportunity-progression
description: Analyze a buyer or system event, separate facts from interpretations, identify stale A3/A4/A5 judgments, and produce an evidence-controlled Opportunity stage, next action, gate, communication brief, and outcome. Use only after an Opportunity is resolved.
compatibility: QianPulse Agent Control Plane, Capability Result Envelope v1.1, Opportunity, ConversationEvent, Approval, Checkpoint, Trace.
---

# A6｜Opportunity Progression

## Purpose

A6 answers five questions in order:

```text
Fact → Business Meaning → Affected Decision → Opportunity State → Next Action
```

The Agent runs A6 twice in one Agent Run:

```text
A6 ANALYSIS → affected A3/A4/A5 → A6 FINAL → apply state once
```

## Input

```text
Event
Opportunity State
Conversation Context
A3 result
A4 result
A5 result
Seller Execution Policy
evaluated_at
```

Canonical fields are defined in `contracts/a6-input.schema.json`.

## Output

```text
Intent with confidence and evidence spans
Field Observations: updates and mentions
Affected Skills
Stage Transition
Decision State
Next Action contract
Communication Brief
Outcome
```

Canonical fields are defined in `contracts/a6-result.schema.json`.

## Responsibilities

- Interpret the latest event without inventing facts.
- Keep `field_observations.updates` separate from `field_observations.mentions`.
- Return capability IDs whose professional judgments are affected.
- Enforce the explicit Stage transition table and terminal-state lock.
- Select one controlled next action with owner, execution mode, prerequisites, success and stop conditions.
- Produce an evidence-constrained Communication Brief, never a final outbound message.
- Emit WON, LOST, or STOPPED only from strong evidence or an approved manual outcome event.

## Not responsible

```text
A1 harvesting
A2 buyer discovery or outreach
A3 purchase timing judgment
A4 Seller×SKU / supply matching
A5 trade or regulatory risk judgment
provider calls
message sending
reply composition
quote approval
sample shipment
contract, payment, delivery, certification, legal, or regulatory commitments
```

## Hard rules

1. Mentioning a field does not mean the field changed.
2. Explicit structured updates override text extraction.
3. A6 only returns `affected_skills`; the Agent owns refresh execution and freshness checks.
4. Stage cannot regress outside the explicit transition table.
5. WON, LOST, and STOPPED are terminal except `MANUAL_RESUME + human_approved`.
6. INTERESTED is not WON; NOT_NOW is NURTURE, not LOST.
7. A5 BLOCK stops all external business progression.
8. PRICE, PAYMENT, and COMPLAINT require HUMAN takeover.
9. SAMPLE always requires APPROVAL and an approved sample policy, destination, and non-blocking A5 result.
10. Every `allowed_claim` must carry evidence from A3/A4/A5 or an approved seller policy/material.

## Fixed taxonomies

Intent, Stage, Action, Decision State, and Outcome values are centralized in `agent/skill-runtime/a6/contract.js`.

## Completion

A6 is `AGENT_CONNECTED` only when the following is proven in one idempotent Agent Run:

```text
Buyer Reply → A6 ANALYSIS → A3/A4/A5 → A6 FINAL
→ Opportunity State → Reply Composer → Human Gate → Execution
```
