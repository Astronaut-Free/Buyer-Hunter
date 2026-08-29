"""Buyer identity keys + public buying profile: reliable-key grouping only.

Phase-1 rule: an account may be merged only on a verifiable domain / platform
account id / official page / registration id — never on contact person + country
or similar names.
"""

from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))

store = importlib.import_module("build_opportunity_store_v1")
bp = importlib.import_module("buyer_profile_v1")

DEMO = PIPELINE / "tests" / "fixtures" / "full_collection" / "demo_buyer_history.csv"

AURORA = "domain:auroramatcha.example"
NORDIC = "domain:nordicbevimports.example"


class GroupingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.rows = store.load_rows(DEMO)
        cls.groups = bp.group_account_history(cls.rows)

    def test_two_groups_keyed_by_domain(self) -> None:
        self.assertEqual(set(self.groups), {AURORA, NORDIC})

    def test_each_group_has_three_to_four_records(self) -> None:
        for key, records in self.groups.items():
            self.assertIn(len(records), (3, 4), key)
            self.assertTrue(all(rec["association_key"] == key for rec in records))

    def test_history_record_shape(self) -> None:
        record = self.groups[AURORA][0]
        self.assertEqual(set(record), {
            "association_key", "observed_at", "demand_summary", "evidence_url",
            "category_code", "quantity_raw", "transaction_stage",
        })
        self.assertLessEqual(len(record["demand_summary"]), 120)

    def test_four_post_buyer_profile_is_derived(self) -> None:
        history = self.groups[AURORA]
        self.assertEqual(len(history), 4)
        profile = bp.summarize_buying_profile(history)
        self.assertEqual(profile["category_continuity"]["tier"], "DERIVED")
        self.assertGreaterEqual(profile["repeat_post_count"]["value"], 3)
        self.assertEqual(profile["repeat_post_count"]["tier"], "DERIVED")
        self.assertIs(profile["long_term_signal"]["value"], True)
        self.assertTrue(profile["evidence"])

    def test_build_buyer_context_only_has_keyed_accounts(self) -> None:
        context = bp.build_buyer_context(self.rows)
        self.assertEqual(set(context), {AURORA, NORDIC})
        for entry in context.values():
            self.assertIn("same_account_public_history", entry)
            self.assertIsNotNone(entry["buying_profile"])


class ReliableKeyOnlyTests(unittest.TestCase):
    def test_same_contact_and_country_without_domain_do_not_merge(self) -> None:
        rows = store.load_rows(DEMO)
        orphans = [
            row for row in rows
            if not row.get("buyer_domain") and row.get("contact_person_raw") == "Kenji Tanaka"
        ]
        self.assertEqual(len(orphans), 2)
        self.assertEqual(orphans[0]["contact_person_raw"], orphans[1]["contact_person_raw"])
        self.assertEqual(orphans[0]["buyer_country_code"], orphans[1]["buyer_country_code"])
        self.assertIsNone(bp.account_key(orphans[0]))
        self.assertIsNone(bp.account_key(orphans[1]))
        self.assertEqual(bp.group_account_history(orphans), {})

    def test_account_key_source_precedence(self) -> None:
        self.assertEqual(bp.account_key({"buyer_domain": "Aurora-Matcha.EXAMPLE"}), "domain:aurora-matcha.example")
        self.assertEqual(bp.account_key({"registration_id": "HRB-98765"}), "reg:hrb-98765")
        self.assertEqual(
            bp.account_key({"source_url": "https://www.go4worldbusiness.com/suppliers/nordic-bev-imports"}),
            "platform:go4worldbusiness.com:nordic-bev-imports",
        )

    def test_account_key_is_none_without_any_reliable_identifier(self) -> None:
        self.assertIsNone(bp.account_key({"contact_person_raw": "Jane Doe", "buyer_country_code": "US"}))
        self.assertIsNone(bp.account_key({
            "source_url": "https://www.go4worldbusiness.com/buylead/view/12345/wanted-matcha.html",
        }))

    def test_single_post_profile_is_not_derived(self) -> None:
        one_post = bp.group_account_history(store.load_rows(DEMO))[AURORA][:1]
        profile = bp.summarize_buying_profile(one_post)
        self.assertIn(profile["category_continuity"]["tier"], {"FACT", "UNKNOWN"})
        self.assertNotEqual(profile["repeat_post_count"]["tier"], "DERIVED")

    def test_empty_history_is_all_unknown(self) -> None:
        profile = bp.summarize_buying_profile([])
        self.assertEqual(profile["category_continuity"]["tier"], "UNKNOWN")
        self.assertEqual(profile["evidence"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
