PRAGMA foreign_keys = ON;

-- Imported core entities from the Free branch. Agent runtime reads these
-- through the repository layer; this SQLite schema is the migration target.
CREATE TABLE IF NOT EXISTS buyer (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  domain TEXT,
  country_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  observed_at TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  data_mode TEXT NOT NULL CHECK (data_mode IN ('LIVE','CACHED','SAMPLE')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS signal (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES buyer(id),
  signal_type TEXT NOT NULL,
  product_terms_json TEXT NOT NULL CHECK (json_valid(product_terms_json)),
  truth_score REAL NOT NULL DEFAULT 0,
  truth_level TEXT NOT NULL DEFAULT 'D',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS matching_template (
  id TEXT PRIMARY KEY,
  template_code TEXT NOT NULL,
  category TEXT NOT NULL,
  product_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  attribute_schema_json TEXT NOT NULL CHECK (json_valid(attribute_schema_json)),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS seller_capability_profile (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  matching_template_id TEXT NOT NULL REFERENCES matching_template(id),
  target_product_name TEXT NOT NULL,
  target_markets_json TEXT NOT NULL CHECK (json_valid(target_markets_json)),
  attributes_json TEXT NOT NULL CHECK (json_valid(attributes_json)),
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requirement (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL REFERENCES signal(id),
  field_code TEXT NOT NULL,
  requirement_type TEXT NOT NULL,
  operator TEXT NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  hard INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS opportunity (
  id TEXT PRIMARY KEY,
  seller_capability_profile_id TEXT NOT NULL REFERENCES seller_capability_profile(id),
  buyer_id TEXT NOT NULL REFERENCES buyer(id),
  primary_signal_id TEXT NOT NULL REFERENCES signal(id),
  status TEXT NOT NULL,
  why_now TEXT NOT NULL,
  gap_json TEXT NOT NULL CHECK (json_valid(gap_json)),
  risk_json TEXT NOT NULL CHECK (json_valid(risk_json)),
  next_action TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_result (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunity(id),
  requirement_id TEXT NOT NULL REFERENCES requirement(id),
  seller_value_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('PASS','FAIL','UNKNOWN')),
  hard INTEGER NOT NULL,
  reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS score_breakdown (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunity(id),
  truth_score REAL NOT NULL,
  intent REAL NOT NULL,
  fit REAL NOT NULL,
  timing REAL NOT NULL,
  reachability REAL NOT NULL,
  penalty REAL NOT NULL,
  opportunity_score REAL NOT NULL,
  ruleset_version TEXT NOT NULL,
  input_snapshot_sha256 TEXT NOT NULL
);
