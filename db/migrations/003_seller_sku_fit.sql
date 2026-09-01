PRAGMA foreign_keys = ON;

-- Phase-1 Supply Demand Fit: one RFQ evaluated against every Guizhou Seller x SKU.
-- report_json holds the full per-SKU breakdown (checks / blockers / gaps);
-- the flat columns are for fast filtering and the opportunity list.
CREATE TABLE IF NOT EXISTS seller_sku_fit (
  opportunity_id TEXT PRIMARY KEY,
  supply_pool_status TEXT NOT NULL CHECK (supply_pool_status IN ('HAS_MATCH','CONDITIONAL_ONLY','NO_MATCH')),
  best_verdict TEXT NOT NULL CHECK (best_verdict IN ('MATCH','CONDITIONAL','BLOCK','NONE')),
  best_fit_score REAL NOT NULL CHECK (best_fit_score BETWEEN 0 AND 100),
  eligible_match_count INTEGER NOT NULL DEFAULT 0 CHECK (eligible_match_count >= 0),
  evaluated_sku_count INTEGER NOT NULL DEFAULT 0 CHECK (evaluated_sku_count >= 0),
  summary_zh TEXT NOT NULL,
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
  ruleset_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (opportunity_id) REFERENCES opportunity(id)
);
