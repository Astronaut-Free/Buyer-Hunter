PRAGMA foreign_keys = ON;

-- Phase 4 — unified core.opportunity store (contracts/opportunity-v2.md).
-- Free's `opportunity` table becomes the single store of record for BOTH
-- origins. Free-owned columns keep their semantics; agent-owned runtime state
-- lives in the new columns so the two vocabularies never collide:
--   origin            write-once at creation (A1_INBOUND_DEMAND | A2_PROACTIVE)
--   seed_key          agent-side idempotent upsert key (bridge:free:<id> | a2:<seller>:<company>)
--   agent_stage       A6 domain stage (CONTACTED .. WON/LOST/STOPPED); Free status column stays
--                     the pipeline status (NEW/REVIEWED/...) — no vocabulary clash
--   agent_status      A6 runtime status (READY_FOR_OUTREACH_APPROVAL / ACTIVE / ...)
--   agent_fields_json A6-mutated business fields (per-key overrides on the bridged row)
--   a6_json           A6 envelope block (run_status/outcome/next_action/...)
--   outreach_json     A2 outreach execution state (provider/campaign/lead/...)
--   contact_json      A2 discovered contact
--   agent_updated_at  agent-side mutation timestamp
ALTER TABLE opportunity ADD COLUMN origin TEXT NOT NULL DEFAULT 'A1_INBOUND_DEMAND'
  CHECK (origin IN ('A1_INBOUND_DEMAND', 'A2_PROACTIVE'));
ALTER TABLE opportunity ADD COLUMN seed_key TEXT UNIQUE;
ALTER TABLE opportunity ADD COLUMN agent_stage TEXT;
ALTER TABLE opportunity ADD COLUMN agent_status TEXT;
ALTER TABLE opportunity ADD COLUMN agent_fields_json TEXT
  CHECK (agent_fields_json IS NULL OR json_valid(agent_fields_json));
ALTER TABLE opportunity ADD COLUMN a2_json TEXT
  CHECK (a2_json IS NULL OR json_valid(a2_json));
ALTER TABLE opportunity ADD COLUMN seller_json TEXT
  CHECK (seller_json IS NULL OR json_valid(seller_json));
ALTER TABLE opportunity ADD COLUMN a6_json TEXT
  CHECK (a6_json IS NULL OR json_valid(a6_json));
ALTER TABLE opportunity ADD COLUMN outreach_json TEXT
  CHECK (outreach_json IS NULL OR json_valid(outreach_json));
ALTER TABLE opportunity ADD COLUMN contact_json TEXT
  CHECK (contact_json IS NULL OR json_valid(contact_json));
ALTER TABLE opportunity ADD COLUMN agent_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_opportunity_origin ON opportunity(origin);
