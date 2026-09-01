PRAGMA foreign_keys = ON;

-- A2↔A1 rank promotion: agent-side progress on a linked buyer adds a bonus to
-- the Free opportunity score for ordering (Top 5). Recomputed idempotently by
-- scripts/import_agent_outcomes.py after every rebuild + import (never
-- accumulates across replays).
ALTER TABLE opportunity_decision ADD COLUMN promotion_bonus REAL NOT NULL DEFAULT 0
  CHECK (promotion_bonus >= 0);
