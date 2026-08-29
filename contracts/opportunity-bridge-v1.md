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
| `fields.destination` | `buyer.country_code` | |
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

## v2 candidates

- Reverse channel: A6 `outcome` / A2 buying signals → append to the Free store.
- Entity resolution bridging `buyer.domain` ↔ `target_account.domain` so a
  targeted company that later posts an RFQ is auto-linked and promoted.
- Per-seller projection driven by `seller_capability_profile`.
