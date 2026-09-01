"""Locks truth-v1.1.0 scoring so a change to the weights or parsers cannot land
without a failing test, and proves the v1 / v1_1 entry points are one function.
"""

from __future__ import annotations

import importlib
import sys
import unittest
from datetime import date
from pathlib import Path


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
v1 = importlib.import_module("clean_and_score_buyer_signals_v1")
v1_1 = importlib.import_module("clean_and_score_buyer_signals_v1_1")


CANONICAL_ROW = {
    "source_code": "go4worldbusiness",
    "category_code": "MATCHA",
    "record_kind": "DIRECT_BUY_REQUIREMENT",
    "exact_product_match": "True",
    "title": "Wanted : Matcha Powder",
    "description_raw": (
        "VERIFIED Aug-27-26 Wanted Matcha Powder Buyer From Japan "
        "Quantity Required: 500 Kilograms Payment Terms: L/C Destination: Japan "
        "Specifications: organic grade Contact: Jane Doe Buyer Of Matcha Tea"
    ),
    "source_url": "https://example.test/buylead/1",
    "contact_gate": "platform_login_or_membership",
    "observed_at": "2026-08-28T00:00:00+00:00",
    "snapshot_sha256": "a" * 64,
    "data_mode": "LIVE",
}

EXPECTED = {
    "buyer_country_code": "JP",
    "quantity_raw": "500 Kilograms",
    "published_at": "2026-08-27",
    "d1_demand_explicitness": 35,
    "d2_account_business_context": 25,
    "d2_entity_authenticity": 5,
    "d3_recency": 25,
    "d4_corroboration": 4,
    "truth_score": 89,
    "truth_level": "A",
    "qualification_status": "QUALIFIED_PENDING_ENTITY",
    "buyer_identity_status": "PLATFORM_ACCOUNT",
    "ruleset_version": "truth-v1.1.0",
}

OBSERVED = date(2026, 8, 28)


class ScoringDeterminismTests(unittest.TestCase):
    def test_canonical_row_scores_exactly(self):
        out = v1.clean_row(dict(CANONICAL_ROW), OBSERVED)
        for field, value in EXPECTED.items():
            with self.subTest(field=field):
                self.assertEqual(out[field], value)

    def test_repeated_calls_are_identical(self):
        first = v1.clean_row(dict(CANONICAL_ROW), OBSERVED)
        second = v1.clean_row(dict(CANONICAL_ROW), OBSERVED)
        self.assertEqual(first, second)

    def test_v1_and_v1_1_entrypoints_are_the_same_function(self):
        self.assertIs(v1.clean_row, v1_1.clean_row)
        self.assertIs(v1.clean_row, v1_1.upgraded_clean_row)
        a = v1.clean_row(dict(CANONICAL_ROW), OBSERVED)
        b = v1_1.upgraded_clean_row(dict(CANONICAL_ROW), OBSERVED)
        self.assertEqual(a, b)

    def test_importing_v1_1_does_not_mutate_v1(self):
        # The old module installed base.clean_row = upgraded_clean_row on import.
        original = v1.clean_row
        importlib.reload(v1_1)
        self.assertIs(v1.clean_row, original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
