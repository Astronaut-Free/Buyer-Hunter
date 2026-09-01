PRAGMA foreign_keys = ON;

-- Immutable, auditable phase-1 decision snapshots. Truth is a front gate;
-- component columns implement the 30/30/20/10/10 opportunity model.
CREATE TABLE IF NOT EXISTS opportunity_decision (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  seller_capability_profile_id TEXT NOT NULL,
  decision_date TEXT NOT NULL,
  rank_position INTEGER CHECK (rank_position IS NULL OR rank_position > 0),
  decision_status TEXT NOT NULL CHECK (decision_status IN ('PURSUE_NOW','VERIFY_FIRST','WATCH','PASS')),
  hard_gate_passed INTEGER NOT NULL CHECK (hard_gate_passed IN (0,1)),
  truth_score REAL NOT NULL CHECK (truth_score BETWEEN 0 AND 100),
  opportunity_score REAL NOT NULL CHECK (opportunity_score BETWEEN 0 AND 100),
  timing_score REAL NOT NULL CHECK (timing_score BETWEEN 0 AND 100),
  seller_fit_score REAL NOT NULL CHECK (seller_fit_score BETWEEN 0 AND 100),
  commercial_execution_score REAL NOT NULL CHECK (commercial_execution_score BETWEEN 0 AND 100),
  procurement_channel_actionability_score REAL NOT NULL CHECK (procurement_channel_actionability_score BETWEEN 0 AND 100),
  market_access_score REAL NOT NULL CHECK (market_access_score BETWEEN 0 AND 100),
  why_now_json TEXT NOT NULL CHECK (json_valid(why_now_json)),
  gaps_json TEXT NOT NULL CHECK (json_valid(gaps_json)),
  blockers_json TEXT NOT NULL CHECK (json_valid(blockers_json)),
  next_action_json TEXT NOT NULL CHECK (json_valid(next_action_json)),
  ruleset_version TEXT NOT NULL,
  input_snapshot_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (opportunity_id, seller_capability_profile_id, ruleset_version, input_snapshot_sha256),
  FOREIGN KEY (opportunity_id) REFERENCES opportunity(id),
  FOREIGN KEY (seller_capability_profile_id) REFERENCES seller_capability_profile(id)
);

CREATE INDEX IF NOT EXISTS idx_opportunity_decision_today
ON opportunity_decision(decision_date, decision_status, rank_position, opportunity_score DESC);

CREATE TABLE IF NOT EXISTS decision_entitlement (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  daily_decision_limit INTEGER NOT NULL DEFAULT 5 CHECK (daily_decision_limit > 0),
  full_reasoning_enabled INTEGER NOT NULL DEFAULT 1 CHECK (full_reasoning_enabled IN (0,1)),
  action_plan_enabled INTEGER NOT NULL DEFAULT 1 CHECK (action_plan_enabled IN (0,1)),
  lead_access_quota INTEGER NOT NULL DEFAULT 20 CHECK (lead_access_quota >= 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES seller_subscription(id)
);
