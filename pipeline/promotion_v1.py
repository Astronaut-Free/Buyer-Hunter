"""A2↔A1 rank promotion (idempotent recompute).

Agent-side progress on a linked buyer adds a bonus to the Free opportunity
score for Top-5 ordering. Rules (max wins, never stacked):
  - WON deal outcome                -> +15
  - NEGOTIATING (incl. STOPPED)     -> +10
  - linked A2 target (matched_free_buyer_id) with a2_rank_score >= 70 -> +10
    for every Free opportunity of that buyer

Pure functions of the store; replay-safe (zero-all then set, never accumulate).
"""

from __future__ import annotations

import sqlite3
from typing import Any


def compute_promotions(conn: sqlite3.Connection) -> dict[str, float]:
    """Idempotent A2<->A1 promotion map: opportunity_id -> bonus.

    Rules (max wins, never stacked):
      - WON deal outcome                -> +15
      - NEGOTIATING (incl. STOPPED)     -> +10
      - linked A2 target (matched_free_buyer_id) with a2_rank_score >= 70 -> +10
        for every Free opportunity of that buyer
    """
    bonuses: dict[str, float] = {}
    for (opportunity_id, stage) in conn.execute(
        "SELECT opportunity_id, stage FROM deal_outcome"
    ):
        if stage == "WON":
            bonuses[opportunity_id] = max(bonuses.get(opportunity_id, 0.0), 15.0)
        elif stage == "NEGOTIATING":
            bonuses[opportunity_id] = max(bonuses.get(opportunity_id, 0.0), 10.0)
    rows = conn.execute(
        """SELECT o.id
           FROM agent_discovered_target t
           JOIN opportunity o ON o.buyer_id = t.matched_free_buyer_id
           WHERE t.matched_free_buyer_id IS NOT NULL AND t.a2_rank_score >= 70"""
    ).fetchall()
    for (opportunity_id,) in rows:
        bonuses[opportunity_id] = max(bonuses.get(opportunity_id, 0.0), 10.0)
    return bonuses


def apply_promotions(conn: sqlite3.Connection) -> int:
    """Zero all bonuses, then set the computed ones (replay-safe recompute)."""
    bonuses = compute_promotions(conn)
    conn.execute("UPDATE opportunity_decision SET promotion_bonus = 0")
    for opportunity_id, bonus in bonuses.items():
        conn.execute(
            "UPDATE opportunity_decision SET promotion_bonus = ? WHERE opportunity_id = ?",
            (bonus, opportunity_id),
        )
    return len(bonuses)
