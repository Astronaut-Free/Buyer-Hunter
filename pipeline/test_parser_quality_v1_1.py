from __future__ import annotations

import importlib
import sys
import unittest
from datetime import date
from pathlib import Path


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
collector = importlib.import_module("collect_b2b_public_v3")
cleaner = importlib.import_module("clean_and_score_buyer_signals_v1")


class PlatformParserTests(unittest.TestCase):
    def test_tradekey_extracts_country_date_and_spans(self):
        html = b"""
        <div class="cwrap">
          <h2 class="search-title"><a href="https://example.test/buyoffer/1">Need Blueberry</a></h2>
          <div>We need fresh blueberry.</div>
          <span class="location" title="Made in UAE">UAE</span>
          <span>Posted on: 17 Aug 2026</span>
        </div>
        """
        row = collector.parse_tradekey(html, "https://example.test/list")[0]
        self.assertEqual(row["buyer_country_raw"], "UAE")
        self.assertEqual(row["buyer_country_span"], "UAE")
        self.assertEqual(row["published_at"], "2026-08-17")
        self.assertIn("Posted on", row["published_at_span"])

    def test_go4worldbusiness_extracts_bounded_fields(self):
        html = b"""
        <div class="search-results">
          <a href="/buylead/view/1">Wanted : Matcha Powder</a>
          <div>VERIFIED Aug-27-26 Wanted Matcha Powder Buyer From Japan
          Quantity Required: 500 Kilograms Payment Terms: L/C Destination: Japan
          Contact: Jane Doe Buyer Of Matcha Tea</div>
        </div>
        """
        row = collector.parse_go4worldbusiness(html, "https://example.test/list")[0]
        self.assertEqual(row["buyer_country_raw"], "Japan")
        self.assertEqual(row["quantity_raw"], "500 Kilograms")
        self.assertEqual(row["contact_person_raw"], "Jane Doe")
        self.assertIsNone(row["buyer_name_raw"])
        self.assertEqual(row["published_at"], "2026-08-27")


class CleanerQualityTests(unittest.TestCase):
    def test_country_aliases_found_in_live_batch_map_to_iso_codes(self):
        expected = {
            "Uganda": "UG",
            "Sri Lanka": "LK",
            "Benin": "BJ",
            "Kenya": "KE",
            "Afghanistan": "AF",
            "Russia": "RU",
            "Indonesia": "ID",
            "Türkiye": "TR",
        }
        for country, code in expected.items():
            with self.subTest(country=country):
                self.assertEqual(cleaner.COUNTRY_TO_CODE[country.casefold()], code)

    def test_main_cleaner_repairs_platform_fields(self):
        row = {
            "source_code": "go4worldbusiness",
            "category_code": "MATCHA",
            "record_kind": "DIRECT_BUY_REQUIREMENT",
            "exact_product_match": "True",
            "title": "Wanted : Matcha Powder",
            "description_raw": "VERIFIED Aug-27-26 Wanted Matcha Powder Buyer From Japan Quantity Required: 500 Kilograms Payment Terms: L/C Destination: Japan Specifications: organic grade Contact: Jane Doe Buyer Of Matcha Tea",
            "source_url": "https://example.test/buylead/1",
            "contact_gate": "platform_login_or_membership",
            "observed_at": "2026-08-28T00:00:00+00:00",
            "snapshot_sha256": "a" * 64,
            "data_mode": "LIVE",
        }
        cleaned = cleaner.clean_row(row, date(2026, 8, 28))
        self.assertEqual(cleaned["buyer_country_code"], "JP")
        self.assertEqual(cleaned["quantity_raw"], "500 Kilograms")
        self.assertEqual(cleaned["contact_person_raw"], "Jane Doe")
        self.assertIsNone(cleaned["buyer_name_raw"])
        self.assertEqual(cleaned["published_at"], "2026-08-27")
        self.assertEqual(cleaned["truth_score"], 69)
        self.assertEqual(cleaned["entity_resolution_status"], "PERSON_ONLY")
        self.assertEqual(cleaned["qualification_status"], "NEEDS_VERIFICATION")

    def test_non_positive_quantity_is_a_conflict_not_coverage(self):
        row = {
            "source_code": "tradekey",
            "category_code": "BLUEBERRY",
            "record_kind": "DIRECT_BUY_REQUIREMENT",
            "exact_product_match": "True",
            "title": "Need Blueberry",
            "description_raw": "Need blueberry. Initial quantity: 0 pieces. UAE Posted on: 17 Aug 2026",
            "quantity_raw": "0 pieces",
            "buyer_country_raw": "UAE",
            "published_at": "2026-08-17",
            "source_url": "https://example.test/buyoffer/2",
            "contact_gate": "platform_login_or_membership",
            "observed_at": "2026-08-28T00:00:00+00:00",
            "snapshot_sha256": "b" * 64,
            "data_mode": "LIVE",
        }
        cleaned = cleaner.clean_row(row, date(2026, 8, 28))
        self.assertIsNone(cleaned["quantity_raw"])
        self.assertEqual(cleaned["quantity_status"], "CONFLICT")
        self.assertIn("NON_POSITIVE_QUANTITY", cleaned["field_warnings"])
        self.assertEqual(cleaned["d1_demand_explicitness"], 20)


if __name__ == "__main__":
    unittest.main(verbosity=2)
