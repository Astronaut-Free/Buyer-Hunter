# Opportunity v2 — unified core object (design)

> Status: **design only**. Phase 4 of the integration plan implements this.
> Today two Opportunity concepts coexist — see "Current state" below.

## Why

The V1.0 三分支方案 names this the single biggest structural risk: two `Opportunity`
objects, two evidence models, two `next_action` owners. The bridge
(`contracts/opportunity-bridge-v1.md`) is a one-way stopgap; v2 makes one object.

## Current state (two objects)

| | Free (Python) | MVP (Node) |
|---|---|---|
| store | `runtime/buyer_hunter.db` (SQLite) | `agent/server/agent-state.json` |
| key | `opp-<hash(signal)>` | `opp_a2_<hash(seed_key)>` |
| shape | `opportunity` + `opportunity_decision` + `buyer` + `signal` + `seller_sku_fit` | flat `{ id, seller, buyer, contact, fields, stage, status, a2, a6, evidence_ids, external_refs }` |
| origin | inbound RFQ only | A2 proactive only (+ bridged Free rows, read-only) |
| lifecycle | one decision snapshot per build | continuously mutated by A6 |

## Target: `core.opportunity`

```
core.opportunity
  id                       string   stable, runtime-agnostic
  seller_id                string
  buyer_id                 string   -> core.buyer (entity-resolved)
  origin                   enum     A1_INBOUND_DEMAND | A2_PROACTIVE
  source_signal_id         string?  set for A1_INBOUND_DEMAND, null for A2_PROACTIVE
  product_category         string
  fields                   object   product / quantity / certification / destination / demand_title
  stage                    enum     A6 domain stage (CONTACTED .. WON/LOST/STOPPED)
  status                   enum     runtime status
  created_at / updated_at  datetime
```

Attached, one-to-many, never merged into the core row:

```
intel.opportunity_decision_snapshot   (Free writes; A6 reads as "commercial decision")
  opportunity_id, truth, timing, seller_fit, market_access, commercial_execution,
  procurement_channel_actionability, opportunity_score, decision, why_now, gaps,
  blockers, ruleset_version, input_snapshot_sha256, created_at

runtime.agent_run / agent_step / checkpoint / approval / conversation_event /
runtime.external_action / external_binding      (MVP writes)
```

## Migration sketch (Phase 4)

1. `core.opportunity` schema + a Python writer and a Node reader over one store
   (start: keep SQLite as the store of record; Node reads it through a thin API
   or a generated snapshot, same as the bridge but bidirectional).
2. Free's `build_opportunity_store_v1.py` writes `core.opportunity` +
   `intel.opportunity_decision_snapshot` (rename of today's `opportunity` +
   `opportunity_decision`).
3. A2's `opportunity-seeder.js` writes `core.opportunity` with
   `origin = A2_PROACTIVE`, `source_signal_id = null`, into the same store.
4. Entity resolution on `buyer.domain` links an A2 `target_account` to an A1
   buyer, so a developed company that later posts an RFQ is one opportunity.
5. Delete the bridge; both runtimes read/write `core.opportunity` directly.

## Invariants to hold from now on

- `origin` is set at creation and never changes.
- `next_action` has exactly one owner: A6 (`runtime`). Free's decision snapshot
  is an **input** to A6, not a competing `next_action`.
- Evidence refs are URLs or `provider:kind:id` strings, never free text.
