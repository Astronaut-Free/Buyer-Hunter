# Opportunity Bridge v1 — Free pipeline → agent runtime

One-way contract that carries the Python pipeline's decision output into the
Node agent runtime, replacing the hand-authored `agent/db/free-opportunities.json`
seed with real A1→A5 opportunities.

## Flow

```
pipeline/run_pipeline.py            (A1 collect → clean/score → aggregate)
  → pipeline/build_opportunity_store_v1.py
  → runtime/buyer_hunter.db         (opportunity_decision + opportunity + buyer + signal + evidence + seller_sku_fit)
  → scripts/export_opportunities_for_agent.py
  → agent/db/opportunities.json     (flat array; agent/server/repository.js reads this, falls back to free-opportunities.json)
  → agent/server/index.js boot      (state.opportunities[id] = row)
```

`make db && make export` runs the right half.

## What crosses the bridge

- Only `decision_status != 'PASS'` rows (PASS = truth below the 60 gate or a hard
  conflict — not an opportunity to develop). Same filter as `GET /api/v1/opportunities/today`.
- Ordered by `rank_position, opportunity_id`.

## Row shape (`agent/db/opportunities.json`)

| field | source | note |
|---|---|---|
| `id` | `opportunity_decision.opportunity_id` | stable across rebuilds (hash of signal identity) |
| `seed_key` | `bridge:free:<id>` | idempotent upsert key in the agent store |
| `source` | literal `FREE_PIPELINE` | distinguishes from `A2_PROACTIVE_BUYER_DEVELOPMENT` |
| `stage` | literal `CONTACTED` | A6 domain-stage machine start point |
| `status` / `decision` | `decision_status` | `PURSUE_NOW` / `VERIFY_FIRST` / `WATCH` |
| `buyer.{id,name,market,domain}` | `buyer` table | `market` = ISO country code |
| `seller.{id,name}` | fixed demo profile | `seller-guizhou-specialty-demo` |
| `fields.product` | `signal.product_terms_json[0]` | category code (MATCHA/TEA/…) |
| `fields.demand_title` | `evidence.title` | |
| `fields.quantity` | `field_observation` quantity_raw | `"未披露"` when absent |
| `fields.certification` | `requirement` rows, `requirement_type='CERTIFICATION'` | comma-joined, or `null` |
| `fields.destination` | `field_observation` destination_market | ISO-2 code resolved from an explicit destination statement in the RFQ text (`destination_v1.py`); `"UNKNOWN"` when not disclosed — never the buyer's country |
| `fit_score` | `seller_fit_score` | A4 |
| `intent_score` / `truth_score` | `truth_score` | four-dimension evidence credibility |
| `conversation_score` | `null` | no buyer conversation before A6 |
| `opportunity_score` | `opportunity_score` | weighted composite |
| `component_scores.*` | the 5 A3/A4/A5 sub-scores | timing / seller_fit / commercial_execution / procurement_channel_actionability / market_access |
| `why_now` | `why_now_json` | `；`-joined |
| `gaps` | `gaps_json` | array |
| `next_action` | `next_action_json.summary` | |
| `supply_match.{pool_status,verdict,fit_score,summary}` | `seller_sku_fit` | per-SKU A4 result; `null` if not evaluated |
| `evidence_ids` | `evidence.url` | traceable public source URLs |
| `tags` | `[category, quantity_raw, country_code]` | |
| `ruleset_version` | `opportunity_decision.ruleset_version` | |
| `data_mode` | `evidence.data_mode` | `LIVE` / `CACHED` / `SAMPLE` |

`agent/db/opportunities.meta.json` carries provenance (source db, exported_at, row_count, ruleset_version).

## Boundaries (v1)

- **One-way.** A2-discovered accounts and A6 outcomes stay in the agent's own
  state (`agent/server/agent-state.json`). They do not flow back into
  `runtime/buyer_hunter.db`.
- **Not per-seller.** Every bridged row is owned by the demo seller profile. Via
  HTTP these rows are visible to `INTERNAL` (and the demo view); the per-seller
  A2 flow creates its own opportunities. A6 can progress a bridged opportunity
  through a direct runtime call or as `INTERNAL`.
- **No identity merge.** A bridged buyer and an A2-discovered `target_account`
  for the same company are not linked in v1. (v2: entity resolution on domain.)

## v2 (implemented) — reverse channel

A6 outcomes and A2-discovered targets flow back into the Free store.

### Flow

```
agent/server/index.js persist()            (debounced, on every state change)
  → agent/db/agent-outcomes.json          (+ agent-outcomes.meta.json provenance)
  → scripts/import_agent_outcomes.py      (`make import`; idempotent, replayable)
  → runtime/buyer_hunter.db
      a6_outcomes → deal_outcome          (only ids present in opportunity — bridged
                                           Free opportunities; A2-only ids are skipped)
      a2_targets  → agent_discovered_target (upsert on seed_key)
```

The import re-runs after every store rebuild because
`build_opportunity_store_v1.py` does a full atomic replace: `make up` /
`.\run.ps1 -Up` run `db → export → import` in that order.

### `agent/db/agent-outcomes.json` shape

```json
{
  "exported_at": "2026-08-29T10:00:00+00:00",
  "contract": "contracts/opportunity-bridge-v1.md (v2 reverse)",
  "direction": "agent -> free (v2 reverse)",
  "entries": {
    "a6_outcomes": [
      {
        "opportunity_id": "opp-…",
        "seed_key": "bridge:free:opp-… | null",
        "source": "FREE_PIPELINE | A2_PROACTIVE_BUYER_DEVELOPMENT",
        "outcome": "WON | LOST | STOPPED",
        "reason": "…",
        "next_action": { "action": "…", "reason": "…" },
        "stage_after": "…",
        "reported_at": "ISO-8601"
      }
    ],
    "a2_targets": ["full A2 opportunity rows, source == A2_PROACTIVE_BUYER_DEVELOPMENT"]
  }
}
```

### Outcome mapping

| A6 outcome | `deal_outcome.stage` | note |
|---|---|---|
| `WON` | `WON` | |
| `LOST` | `LOST` | |
| `STOPPED` | `NEGOTIATING` | halted outreach is neither a loss nor a win; reason is prefixed `STOP_CONTACT: ` |

Idempotency: `deal_outcome.id = sha256(opportunity_id | stage | reported_at)`;
`agent_discovered_target` upserts on `seed_key` (replay is free).

### Boundaries (v2)

- A2-only opportunity ids have no row in Free's `opportunity` table, so their
  outcomes are deliberately skipped (FK) — the A2 opportunity lives in
  `agent_discovered_target` instead.

## v2 (implemented) — entity resolution on domain

A2 targets whose `buyer.domain` casefold-matches a Free `buyer.domain` are the
same company:

- **Free side** (import script): `agent_discovered_target.matched_free_buyer_id`
  is set, plus a `buyer_alias` row (alias_normalized = casefold) and an
  `entity_merge_audit` row (`AUTO_MERGE`, score 1.0, decided_by
  `reverse-bridge-v2`). Idempotent via stable ids.
- **Agent side** (boot, `linkBridgedBuyers`): the A2 opportunity gets
  `buyer.free_buyer_id` and an external ref `free:buyer:<id>` — additive only,
  ids and ranking untouched.

**Honest status**: none of the current 51 Free buyers carries a domain (all
`QUALIFIED_PENDING_ENTITY`), so live data does not exercise this yet. The
mechanism is proven by tests and activates automatically as A1 entity parsing
populates domains.

## v2 candidates

- ~~Reverse channel: A6 `outcome` / A2 buying signals → append to the Free store.~~ (implemented above)
- ~~Entity resolution bridging `buyer.domain` ↔ `target_account.domain` so a
  targeted company that later posts an RFQ is auto-linked and promoted.~~ (implemented above; activates as domains populate)
- Per-seller projection driven by `seller_capability_profile`.
