from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
aggregate = importlib.import_module("aggregate_full_collection_v1")


class FullCollectionAggregationTests(unittest.TestCase):
    def test_blueberry_flavour_product_is_not_blueberry_raw_material(self):
        self.assertFalse(aggregate.strict_product_match(
            "BLUEBERRY",
            "Blueberry Flavored Ice Slush Powder Mix",
            "Rush order for blueberry flavored drink mix",
        ))

    def test_chili_con_carne_is_not_chili_ingredient_demand(self):
        self.assertFalse(aggregate.strict_product_match(
            "CHILI",
            "Canned prepared meals",
            "Supply of chili con carne portions",
        ))

    def test_matcha_product_remains_a_match(self):
        self.assertTrue(aggregate.strict_product_match(
            "MATCHA",
            "Organic matcha powder RFQ",
            "Buyer requests wholesale pricing and MOQ",
        ))

    def test_relative_alibaba_date_is_reproducible(self):
        self.assertEqual(
            aggregate.iso_date("9 days ago", "2026-08-28T08:00:00+00:00"),
            "2026-08-19",
        )

    def test_dedupe_does_not_merge_distinct_api_records_with_shared_url(self):
        first = aggregate.base_record(
            record_id="award-1", source_code="usaspending",
            source_url="https://api.usaspending.gov/search", title="Award one",
            quality_status="SUPPORTING_EVIDENCE",
        )
        second = aggregate.base_record(
            record_id="award-2", source_code="usaspending",
            source_url="https://api.usaspending.gov/search", title="Award two",
            quality_status="SUPPORTING_EVIDENCE",
        )
        self.assertEqual(len(aggregate.dedupe([first, second])), 2)

    def test_commercial_contact_can_enter_ranking_without_becoming_a_company(self):
        row = aggregate.base_record(
            source_code="alibaba_rfq", source_role="DIRECT_RFQ",
            contact_person_raw="Jane Doe", product_match=True, timely=True,
            source_url="https://example.test/rfq/1",
            quality_status="QUALIFIED_PENDING_ENTITY",
        )
        self.assertEqual(row["account_holder_type"], "PERSON_OR_AGENT")
        self.assertEqual(row["business_context_status"], "CONFIRMED")
        self.assertEqual(row["buyer_entity_status"], "UNRESOLVED")
        self.assertFalse(row["entity_resolved"])



if __name__ == "__main__":
    unittest.main(verbosity=2)
