from __future__ import annotations

import csv
import importlib
import json
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
collector = importlib.import_module("collect_b2b_public_v3")
cleaner = importlib.import_module("clean_and_score_buyer_signals_v1_1")
base = importlib.import_module("clean_and_score_buyer_signals_v1")


class CollectorStabilityTests(unittest.TestCase):
    def test_retries_transient_then_succeeds(self):
        first = Mock(status_code=503)
        second = Mock(status_code=200)
        session = Mock()
        session.get.side_effect = [first, second]
        with patch.object(collector.time, "sleep"), patch.object(collector.random, "uniform", return_value=0):
            response, attempts = collector.fetch(session, "https://example.test/list", retries=2)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([a["status"] for a in attempts], [503, 200])

    def test_does_not_retry_access_block(self):
        blocked = Mock(status_code=403)
        session = Mock()
        session.get.return_value = blocked
        response, attempts = collector.fetch(session, "https://example.test/list", retries=2)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(len(attempts), 1)

    def test_saved_snapshots_remain_parseable(self):
        runs = sorted((PIPELINE / "data_b2b_public_v3").glob("*/raw"), reverse=True)
        self.assertTrue(runs, "collection snapshots are missing")
        trade = next(path for raw in runs for path in raw.glob("tradekey_MATCHA_*.html"))
        go4 = next(path for raw in runs for path in raw.glob("go4worldbusiness_MATCHA_*.html"))
        self.assertGreater(len(collector.parse_tradekey(trade.read_bytes(), "https://example.test")), 0)
        self.assertGreater(len(collector.parse_go4worldbusiness(go4.read_bytes(), "https://example.test")), 0)


class CleaningAndTruthTests(unittest.TestCase):
    def test_platform_field_repair_and_score_is_deterministic(self):
        row = {
            "source_code": "go4worldbusiness",
            "category_code": "MATCHA",
            "record_kind": "DIRECT_BUY_REQUIREMENT",
            "exact_product_match": "True",
            "title": "Wanted : Matcha Powder",
            "description_raw": "VERIFIED Aug-27-26 Wanted Matcha Powder Buyer From Japan Quantity Required: 500 Kilograms Payment Terms: L/C Destination: Japan Product Name: Matcha Powder Specifications: organic grade Packing Size in Bulk Shipping Terms: CIF Contact: Jane Doe Buyer Of Matcha Tea",
            "published_at": "",
            "buyer_country_raw": "Japan Quantity Required",
            "buyer_name_raw": "Jane Doe Buyer Of Matcha Tea",
            "quantity_raw": "",
            "source_url": "https://example.test/buylead/1",
            "listing_url": "https://example.test/list",
            "contact_gate": "platform_login_or_membership",
            "observed_at": "2026-08-28T00:00:00+00:00",
            "snapshot_sha256": "a" * 64,
            "data_mode": "LIVE",
        }
        first = cleaner.upgraded_clean_row(row, date(2026, 8, 28))
        second = cleaner.upgraded_clean_row(row, date(2026, 8, 28))
        self.assertEqual(first, second)
        self.assertEqual(first["buyer_country_code"], "JP")
        self.assertEqual(first["quantity_raw"], "500 Kilograms")
        self.assertEqual(first["published_at"], "2026-08-27")
        self.assertEqual(first["d1_demand_explicitness"], 35)
        self.assertEqual(first["d2_account_business_context"], 25)
        self.assertEqual(first["d2_entity_authenticity"], 5)
        self.assertEqual(first["d3_recency"], 25)
        self.assertEqual(first["d4_corroboration"], 4)
        self.assertEqual(first["truth_score"], 89)
        self.assertEqual(first["truth_level"], "A")
        self.assertEqual(first["buyer_identity_status"], "PLATFORM_ACCOUNT")
        self.assertEqual(first["buyer_entity_status"], "UNRESOLVED")

    def test_broad_tea_page_does_not_accept_unrelated_product(self):
        self.assertFalse(cleaner.product_matches("TEA", "Import Inquiry: Turmeric", "Buyer Of Tea"))

    def test_specific_matcha_is_not_duplicated_as_generic_tea(self):
        text = "Wanted Matcha Tea, 500 kg, CIF Japan"
        self.assertTrue(cleaner.product_matches("MATCHA", text, text))
        self.assertFalse(cleaner.product_matches("TEA", text, text))

    def test_latest_quality_report_has_no_hard_gate_failures(self):
        reports = sorted((PIPELINE / "data_b2b_public_v3").glob("*/cleaned_v1/data_quality_report.json"), reverse=True)
        self.assertTrue(reports, "quality report is missing")
        report = json.loads(reports[0].read_text(encoding="utf-8"))
        self.assertEqual(report["hard_gate_failure_count"], 0)
        self.assertEqual(report["future_date_count"], 0)

    def test_latest_clean_output_has_unique_signal_ids(self):
        outputs = sorted((PIPELINE / "data_b2b_public_v3").glob("*/cleaned_v1/buyer_signals_cleaned_scored.csv"), reverse=True)
        with outputs[0].open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        ids = [row["signal_id"] for row in rows]
        self.assertEqual(len(ids), len(set(ids)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
