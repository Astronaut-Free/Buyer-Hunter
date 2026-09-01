PRAGMA foreign_keys = ON;

-- Reverse-bridge sink: companies discovered by A2 (proactive buyer development)
-- on the agent side, imported back into the Free decision store. One row per
-- A2 seed_key; upserted idempotently by scripts/import_agent_outcomes.py.
-- matched_free_buyer_id is set by domain entity resolution (v2 candidate #2).
CREATE TABLE IF NOT EXISTS agent_discovered_target (
  id TEXT PRIMARY KEY,
  seed_key TEXT NOT NULL UNIQUE,
  buyer_id TEXT NOT NULL,
  buyer_name TEXT,
  country_code TEXT,
  domain TEXT,
  contact_json TEXT,
  status TEXT,
  stage TEXT,
  a2_rank_score REAL,
  source TEXT NOT NULL,
  evidence_json TEXT,
  seller_json TEXT,
  matched_free_buyer_id TEXT REFERENCES buyer(id),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_discovered_target_domain ON agent_discovered_target(domain);
