"""Free-to-agent opportunity bridge: shape, PASS exclusion, evidence, UTF-8."""

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
bridge = importlib.import_module("export_opportunities_for_agent")

FIXTURE = ROOT / "pipeline/tests/fixtures/full_collection/qualified_pending_entity_opportunities.csv"


class ExportForAgentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        db_path = Path(cls._tmp.name) / "store.db"
        store.build_store(input_csv=FIXTURE, db_path=db_path)
        cls.conn = sqlite3.connect(db_path)
        cls.rows = bridge.build_export_rows(cls.conn)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.conn.close()
        cls._tmp.cleanup()

    def test_excludes_pass_decisions(self) -> None:
        self.assertGreater(len(self.rows), 0)
        self.assertTrue(all(row["decision"] != "PASS" for row in self.rows))
        db_non_pass = self.conn.execute(
            "SELECT COUNT(*) FROM opportunity_decision WHERE decision_status != 'PASS'"
        ).fetchone()[0]
        self.assertEqual(len(self.rows), db_non_pass)

    def test_agent_shape(self) -> None:
        for row in self.rows:
            for key in ("id", "seed_key", "source", "stage", "status", "buyer", "seller", "fields"):
                self.assertIn(key, row)
            self.assertEqual(row["stage"], "CONTACTED")
            self.assertEqual(row["seller"]["id"], "seller-guizhou-specialty-demo")
            self.assertEqual(row["seed_key"], f"bridge:free:{row['id']}")
            self.assertIn("product", row["fields"])
            self.assertIsInstance(row["fields"]["quantity"], str)
            self.assertIn(row["decision"], {"PURSUE_NOW", "VERIFY_FIRST", "WATCH"})

    def test_scores_are_numeric(self) -> None:
        for row in self.rows:
            self.assertIsInstance(row["fit_score"], (int, float))
            self.assertIsInstance(row["opportunity_score"], (int, float))
            self.assertIsNone(row["conversation_score"])
            self.assertEqual(set(row["component_scores"]), {
                "timing", "seller_fit", "commercial_execution",
                "procurement_channel_actionability", "market_access",
            })

    def test_evidence_is_traceable(self) -> None:
        for row in self.rows:
            self.assertIsInstance(row["evidence_ids"], list)
            for ref in row["evidence_ids"]:
                self.assertTrue(ref.startswith("http"), ref)

    def test_serializes_to_utf8_json(self) -> None:
        blob = json.dumps(self.rows, ensure_ascii=False)
        self.assertIn("贵州", json.dumps(self.rows[0]["seller"], ensure_ascii=False))
        json.loads(blob)  # round-trips

    def test_ids_are_unique(self) -> None:
        ids = [row["id"] for row in self.rows]
        self.assertEqual(len(ids), len(set(ids)))


if __name__ == "__main__":
    unittest.main()
