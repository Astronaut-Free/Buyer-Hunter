"""Reverse bridge (agent -> Free): outcome mapping, FK skip, target upsert idempotency."""

from __future__ import annotations

import importlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "scripts"))

store = importlib.import_module("build_opportunity_store_v1")
importer = importlib.import_module("import_agent_outcomes")

FIXTURE = ROOT / "pipeline/tests/fixtures/full_collection/qualified_pending_entity_opportunities.csv"


def _entries(**overrides):
    base = {
        "a6_outcomes": [],
        "a2_targets": [],
    }
    base.update(overrides)
    return base


class ImportAgentOutcomesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls._tmp.name) / "store.db"
        store.build_store(input_csv=FIXTURE, db_path=cls.db_path)
        cls.conn = sqlite3.connect(cls.db_path)
        cls.real_opp = cls.conn.execute(
            "SELECT opportunity_id FROM opportunity_decision WHERE decision_status != 'PASS' "
            "ORDER BY rank_position LIMIT 1"
        ).fetchone()[0]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.conn.close()
        cls._tmp.cleanup()

    def _apply(self, entries):
        outcome_rows = importer.build_outcome_rows(entries)
        target_rows = importer.build_target_rows(entries)
        counts = importer.apply(self.conn, outcome_rows, target_rows)
        counts["entity_links"] = importer.resolve_entities(self.conn, target_rows)
        return counts

    def _give_domain_to_first_buyer(self, domain: str = "acme.de") -> str:
        buyer_id = self.conn.execute(
            "SELECT buyer_id FROM opportunity WHERE id = "
            "(SELECT opportunity_id FROM opportunity_decision WHERE decision_status != 'PASS' "
            "ORDER BY rank_position LIMIT 1)"
        ).fetchone()[0]
        self.conn.execute("UPDATE buyer SET domain = ? WHERE id = ?", (domain, buyer_id))
        self.conn.commit()
        return buyer_id

    def test_outcome_mapping(self) -> None:
        rows = importer.build_outcome_rows(_entries(a6_outcomes=[
            {"opportunity_id": self.real_opp, "outcome": "WON", "reason": "po", "reported_at": "2026-08-29T10:00:00+00:00"},
            {"opportunity_id": self.real_opp, "outcome": "LOST", "reason": "gone", "reported_at": "2026-08-29T11:00:00+00:00"},
            {"opportunity_id": self.real_opp, "outcome": "STOPPED", "reason": "stale", "reported_at": "2026-08-29T12:00:00+00:00"},
            {"opportunity_id": self.real_opp, "outcome": "BOGUS", "reported_at": "2026-08-29T13:00:00+00:00"},
        ]))
        stages = [row["stage"] for row in rows]
        self.assertEqual(stages, ["WON", "LOST", "NEGOTIATING"])
        stopped = rows[2]
        self.assertTrue(stopped["reason"].startswith("STOP_CONTACT"), stopped["reason"])
        for row in rows:
            self.assertIn(row["stage"], importer.VALID_STAGES)

    def test_outcome_lands_and_unknown_id_skipped(self) -> None:
        counts = self._apply(_entries(a6_outcomes=[
            {"opportunity_id": self.real_opp, "outcome": "WON", "reason": "po", "reported_at": "2026-08-29T10:00:00+00:00"},
            {"opportunity_id": "opp_a2_unknown", "outcome": "WON", "reason": "x", "reported_at": "2026-08-29T10:00:00+00:00"},
        ]))
        self.assertEqual(counts["deal_outcome_inserted"], 1)
        landed = self.conn.execute(
            "SELECT stage, reason FROM deal_outcome WHERE opportunity_id = ?", (self.real_opp,)
        ).fetchall()
        self.assertEqual([(row[0], row[1]) for row in landed], [("WON", "po")])
        self.assertIsNone(self.conn.execute(
            "SELECT 1 FROM deal_outcome WHERE opportunity_id = 'opp_a2_unknown'"
        ).fetchone())

    def test_outcome_replay_is_idempotent(self) -> None:
        entries = _entries(a6_outcomes=[
            {"opportunity_id": self.real_opp, "outcome": "WON", "reason": "po",
             "reported_at": "2026-08-29T22:00:00+00:00"},  # unique vs other tests' rows
        ])
        first = self._apply(entries)
        second = self._apply(entries)
        self.assertEqual(first["deal_outcome_inserted"], 1)
        self.assertEqual(second["deal_outcome_inserted"], 0)  # same stable id -> OR IGNORE

    def test_entity_resolution_links_domain_match(self) -> None:
        # Give one Free buyer a domain, then import an A2 target for the same
        # domain (case-folded) and expect the link + alias + AUTO_MERGE audit.
        buyer_id = self._give_domain_to_first_buyer()

        target = {
            "seed_key": "a2:seller-guizhou-specialty-demo:entity-1",
            "source": "A2_PROACTIVE_BUYER_DEVELOPMENT",
            "seller": {"id": "seller-guizhou-specialty-demo", "name": "demo"},
            "buyer": {"id": "buyer_entity_1", "name": "ACME Imports GmbH", "country": "DE", "domain": "ACME.DE"},
            "contact": None, "stage": None, "status": "READY_FOR_OUTREACH_APPROVAL",
            "a2": {"rank_score": 90.0}, "evidence_ids": [],
            "created_at": "2026-08-29T08:00:00+00:00", "updated_at": "2026-08-29T09:00:00+00:00",
        }
        counts = self._apply(_entries(a2_targets=[target]))
        self.assertEqual(counts["entity_links"], 1)
        matched = self.conn.execute(
            "SELECT matched_free_buyer_id FROM agent_discovered_target WHERE seed_key = ?",
            (target["seed_key"],),
        ).fetchone()[0]
        self.assertEqual(matched, buyer_id)
        alias = self.conn.execute(
            "SELECT alias_raw, alias_normalized FROM buyer_alias WHERE buyer_id = ?", (buyer_id,)
        ).fetchone()
        self.assertEqual(alias[0], "ACME Imports GmbH")
        self.assertEqual(alias[1], "acme imports gmbh")
        audit = self.conn.execute(
            "SELECT kept_buyer_id, merged_buyer_id, decision, decided_by FROM entity_merge_audit"
        ).fetchone()
        self.assertEqual(audit[0], buyer_id)
        self.assertEqual(audit[1], "buyer_entity_1")
        self.assertEqual(audit[2], "AUTO_MERGE")
        self.assertEqual(audit[3], "reverse-bridge-v2")

    def test_entity_resolution_is_idempotent_and_skips_unknown_domains(self) -> None:
        self._give_domain_to_first_buyer()  # idempotent re-set (alphabetical test order)
        target = {
            "seed_key": "a2:seller-guizhou-specialty-demo:entity-1",
            "source": "A2_PROACTIVE_BUYER_DEVELOPMENT",
            "seller": {"id": "seller-guizhou-specialty-demo", "name": "demo"},
            "buyer": {"id": "buyer_entity_1", "name": "ACME Imports GmbH", "country": "DE", "domain": "ACME.DE"},
            "contact": None, "stage": None, "status": "READY_FOR_OUTREACH_APPROVAL",
            "a2": {"rank_score": 90.0}, "evidence_ids": [],
            "created_at": "2026-08-29T08:00:00+00:00", "updated_at": "2026-08-29T09:00:00+00:00",
        }
        unknown = dict(target, seed_key="a2:seller-guizhou-specialty-demo:unknown-1",
                        buyer={"id": "buyer_unknown_1", "name": "Nobody Ltd", "country": "US", "domain": "nobody.us"})
        counts = self._apply(_entries(a2_targets=[target, unknown]))
        self.assertEqual(counts["entity_links"], 1)  # replay of known + skip unknown
        alias_rows = self.conn.execute("SELECT COUNT(*) FROM buyer_alias").fetchone()[0]
        audit_rows = self.conn.execute("SELECT COUNT(*) FROM entity_merge_audit").fetchone()[0]
        self.assertEqual(alias_rows, 1)
        self.assertEqual(audit_rows, 1)
        self.assertIsNone(self.conn.execute(
            "SELECT matched_free_buyer_id FROM agent_discovered_target WHERE seed_key = ?",
            (unknown["seed_key"],),
        ).fetchone()[0])

    def test_target_upsert_is_idempotent(self) -> None:
        target = {
            "seed_key": "a2:seller-guizhou-specialty-demo:company-1",
            "source": "A2_PROACTIVE_BUYER_DEVELOPMENT",
            "seller": {"id": "seller-guizhou-specialty-demo", "name": "demo"},
            "buyer": {"id": "buyer_company_1", "name": "Acme Imports", "country": "DE", "domain": "zorglub.de"},
            "contact": {"email": "buy@acme.de"},
            "stage": None,
            "status": "READY_FOR_OUTREACH_APPROVAL",
            "a2": {"rank_score": 87.5},
            "evidence_ids": ["https://acme.de/about"],
            "created_at": "2026-08-29T08:00:00+00:00",
            "updated_at": "2026-08-29T09:00:00+00:00",
        }
        first = self._apply(_entries(a2_targets=[target]))
        second = self._apply(_entries(a2_targets=[target]))
        self.assertEqual(first["target_upserted"], 1)
        self.assertEqual(second["target_upserted"], 1)
        rows = self.conn.execute(
            "SELECT seed_key, buyer_name, domain, a2_rank_score, status, matched_free_buyer_id "
            "FROM agent_discovered_target WHERE seed_key = ?",
            (target["seed_key"],),
        ).fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], target["seed_key"])
        self.assertEqual(rows[0][1], "Acme Imports")
        self.assertEqual(rows[0][2], "zorglub.de")
        self.assertEqual(rows[0][3], 87.5)
        self.assertIsNone(rows[0][5])  # no domain match yet (entity resolution is a later layer)

    def test_missing_payload_returns_skipped(self) -> None:
        result = importer.import_outcomes(self.db_path, Path(self._tmp.name) / "nope.json")
        self.assertTrue(result["skipped"])
        self.assertIn("missing", result["reason"])


if __name__ == "__main__":
    unittest.main()
