PRAGMA foreign_keys = ON;

-- WS-B: buyer identity status, market-access status and the public buying
-- profile / same-account history threaded onto each opportunity so the read API
-- (impl-C) and the opportunity package can surface them without recomputing.
-- All four columns are nullable; buyer_identity_status is always written
-- (default 'UNRESOLVED'), the two JSON columns are NULL when the buyer has no
-- reliable account key.
ALTER TABLE opportunity ADD COLUMN buyer_identity_status TEXT;
ALTER TABLE opportunity ADD COLUMN access_status TEXT;
ALTER TABLE opportunity ADD COLUMN buying_profile TEXT
  CHECK (buying_profile IS NULL OR json_valid(buying_profile));
ALTER TABLE opportunity ADD COLUMN same_account_public_history TEXT
  CHECK (same_account_public_history IS NULL OR json_valid(same_account_public_history));
