PRAGMA foreign_keys = ON;

CREATE TABLE source (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  min_interval_ms INTEGER NOT NULL DEFAULT 2000,
  access_policy_checked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE crawl_run (
  id TEXT PRIMARY KEY,
  target_product_query TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','PARTIAL','FAILED')),
  stage TEXT NOT NULL CHECK (stage IN ('DISCOVER','FETCH','NORMALIZE','RESOLVE','SCORE','COMPLETE')),
  raw_count INTEGER NOT NULL DEFAULT 0,
  normalized_count INTEGER NOT NULL DEFAULT 0,
  buyer_count INTEGER NOT NULL DEFAULT 0,
  opportunity_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE crawl_item (
  id TEXT PRIMARY KEY,
  crawl_run_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','FETCHED','PARSED','FAILED','SKIPPED')),
  http_status INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (crawl_run_id, url),
  FOREIGN KEY (crawl_run_id) REFERENCES crawl_run(id),
  FOREIGN KEY (source_id) REFERENCES source(id)
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  crawl_item_id TEXT,
  source_type TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  published_at TEXT,
  observed_at TEXT NOT NULL,
  time_precision TEXT NOT NULL CHECK (time_precision IN ('EXACT','DATE','MONTH','UNKNOWN')),
  excerpt TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL,
  snapshot_path TEXT,
  data_mode TEXT NOT NULL CHECK (data_mode IN ('LIVE','CACHED','SAMPLE')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES source(id),
  FOREIGN KEY (crawl_item_id) REFERENCES crawl_item(id)
);

CREATE INDEX idx_evidence_url ON evidence(url);
CREATE INDEX idx_evidence_published_at ON evidence(published_at);

CREATE TABLE buyer (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  domain TEXT,
  country_code TEXT NOT NULL,
  address_normalized TEXT,
  registration_id TEXT,
  phone_normalized TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_buyer_domain ON buyer(domain);
CREATE INDEX idx_buyer_name_country ON buyer(normalized_name, country_code);

CREATE TABLE buyer_alias (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  alias_raw TEXT NOT NULL,
  alias_normalized TEXT NOT NULL,
  evidence_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (buyer_id, alias_normalized),
  FOREIGN KEY (buyer_id) REFERENCES buyer(id),
  FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE buyer_relation (
  id TEXT PRIMARY KEY,
  source_buyer_id TEXT NOT NULL,
  target_buyer_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('SUBSIDIARY_OF','BRAND_OF','OPERATED_BY','ALIAS_OF')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (source_buyer_id, target_buyer_id, relation_type),
  FOREIGN KEY (source_buyer_id) REFERENCES buyer(id),
  FOREIGN KEY (target_buyer_id) REFERENCES buyer(id),
  FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE entity_merge_audit (
  id TEXT PRIMARY KEY,
  kept_buyer_id TEXT NOT NULL,
  merged_buyer_id TEXT NOT NULL,
  score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
  feature_json TEXT NOT NULL CHECK (json_valid(feature_json)),
  decision TEXT NOT NULL CHECK (decision IN ('AUTO_MERGE','MANUAL_MERGE','REJECT_MERGE')),
  decided_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE signal (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  buying_action TEXT,
  product_terms_json TEXT NOT NULL CHECK (json_valid(product_terms_json)),
  published_at TEXT,
  latest_observed_at TEXT NOT NULL,
  truth_score REAL NOT NULL DEFAULT 0 CHECK (truth_score >= 0 AND truth_score <= 100),
  truth_level TEXT NOT NULL DEFAULT 'D' CHECK (truth_level IN ('A','B','C','D')),
  truth_breakdown_json TEXT NOT NULL CHECK (json_valid(truth_breakdown_json)),
  extraction_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (buyer_id) REFERENCES buyer(id)
);

CREATE TABLE signal_evidence (
  signal_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  evidence_role TEXT NOT NULL CHECK (evidence_role IN ('PRIMARY','CORROBORATING','BACKGROUND')),
  PRIMARY KEY (signal_id, evidence_id),
  FOREIGN KEY (signal_id) REFERENCES signal(id),
  FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE field_observation (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('BUYER','SIGNAL','REQUIREMENT','SELLER_PRODUCT')),
  owner_id TEXT NOT NULL,
  field_code TEXT NOT NULL,
  raw_value TEXT,
  raw_unit TEXT,
  normalized_value TEXT,
  normalized_unit TEXT,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_span TEXT,
  evidence_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE INDEX idx_field_observation_owner ON field_observation(owner_type, owner_id, field_code);

CREATE TABLE matching_template (
  id TEXT PRIMARY KEY,
  template_code TEXT NOT NULL,
  category TEXT NOT NULL,
  product_type TEXT NOT NULL,
  product_form TEXT,
  schema_version TEXT NOT NULL,
  attribute_schema_json TEXT NOT NULL CHECK (json_valid(attribute_schema_json)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (template_code, schema_version)
);

CREATE TABLE seller_capability_profile (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  matching_template_id TEXT NOT NULL,
  target_product_name TEXT NOT NULL,
  target_markets_json TEXT NOT NULL CHECK (json_valid(target_markets_json)),
  attributes_json TEXT NOT NULL CHECK (json_valid(attributes_json)),
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (matching_template_id) REFERENCES matching_template(id)
);

CREATE TABLE membership_plan (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('MONTH','YEAR','DEMO')),
  unlock_quota_per_period INTEGER NOT NULL CHECK (unlock_quota_per_period >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE seller_subscription (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  membership_plan_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','EXPIRED','PAUSED')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  unlock_quota_used INTEGER NOT NULL DEFAULT 0 CHECK (unlock_quota_used >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (membership_plan_id) REFERENCES membership_plan(id)
);

CREATE INDEX idx_subscription_seller_status ON seller_subscription(seller_id, status, ends_at);

CREATE TABLE requirement (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL,
  field_code TEXT NOT NULL,
  requirement_type TEXT NOT NULL CHECK (requirement_type IN ('PRODUCT','CERTIFICATION','MARKET_ACCESS','COMMERCIAL')),
  operator TEXT NOT NULL CHECK (operator IN ('EQ','IN','GTE','LTE','RANGE','EXISTS')),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  hard INTEGER NOT NULL DEFAULT 0 CHECK (hard IN (0, 1)),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (signal_id) REFERENCES signal(id),
  FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE opportunity (
  id TEXT PRIMARY KEY,
  seller_capability_profile_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  primary_signal_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('NEW','REVIEWED','FOLLOW_UP_STARTED','REJECTED_CONFLICT')),
  why_now TEXT NOT NULL,
  gap_json TEXT NOT NULL CHECK (json_valid(gap_json)),
  risk_json TEXT NOT NULL CHECK (json_valid(risk_json)),
  next_action TEXT NOT NULL,
  latest_signal_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (seller_capability_profile_id, buyer_id, primary_signal_id),
  FOREIGN KEY (seller_capability_profile_id) REFERENCES seller_capability_profile(id),
  FOREIGN KEY (buyer_id) REFERENCES buyer(id),
  FOREIGN KEY (primary_signal_id) REFERENCES signal(id)
);

CREATE TABLE score_breakdown (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  truth_score REAL NOT NULL CHECK (truth_score >= 0 AND truth_score <= 100),
  intent REAL NOT NULL CHECK (intent >= 0 AND intent <= 100),
  fit REAL NOT NULL CHECK (fit >= 0 AND fit <= 100),
  timing REAL NOT NULL CHECK (timing >= 0 AND timing <= 100),
  reachability REAL NOT NULL CHECK (reachability >= 0 AND reachability <= 100),
  penalty REAL NOT NULL CHECK (penalty >= 0 AND penalty <= 30),
  opportunity_score REAL NOT NULL CHECK (opportunity_score >= 0 AND opportunity_score <= 100),
  ruleset_version TEXT NOT NULL,
  input_snapshot_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (opportunity_id) REFERENCES opportunity(id)
);

CREATE INDEX idx_score_top ON score_breakdown(opportunity_score DESC, opportunity_id);

CREATE TABLE match_result (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  seller_value_json TEXT CHECK (seller_value_json IS NULL OR json_valid(seller_value_json)),
  status TEXT NOT NULL CHECK (status IN ('PASS','FAIL','UNKNOWN')),
  hard INTEGER NOT NULL CHECK (hard IN (0, 1)),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (opportunity_id, requirement_id),
  FOREIGN KEY (opportunity_id) REFERENCES opportunity(id),
  FOREIGN KEY (requirement_id) REFERENCES requirement(id)
);

CREATE TABLE buyer_access_channel (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('PROCUREMENT_PAGE','BUSINESS_CONTACT_PAGE','PUBLIC_BUSINESS_EMAIL','COMPANY_LINKEDIN')),
  channel_value TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  risk TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (buyer_id) REFERENCES buyer(id),
  FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE buyer_access_grant (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  quota_consumed INTEGER NOT NULL CHECK (quota_consumed IN (0, 1)),
  UNIQUE (subscription_id, opportunity_id),
  FOREIGN KEY (subscription_id) REFERENCES seller_subscription(id),
  FOREIGN KEY (opportunity_id) REFERENCES opportunity(id)
);

CREATE TABLE seller_follow_up (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  buyer_access_grant_id TEXT NOT NULL,
  access_channel_id TEXT NOT NULL,
  note TEXT,
  followed_up_at TEXT NOT NULL,
  FOREIGN KEY (opportunity_id) REFERENCES opportunity(id),
  FOREIGN KEY (buyer_access_grant_id) REFERENCES buyer_access_grant(id),
  FOREIGN KEY (access_channel_id) REFERENCES buyer_access_channel(id)
);

CREATE TABLE deal_outcome (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('NEGOTIATING','WON','LOST')),
  reason TEXT,
  reported_at TEXT NOT NULL,
  FOREIGN KEY (opportunity_id) REFERENCES opportunity(id)
);
