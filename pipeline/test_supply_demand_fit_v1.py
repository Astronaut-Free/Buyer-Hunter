"""Supply-demand fit: hard-before-soft, per-SKU verdicts, no forced Top 3,
plain 'no matching Guizhou supply' when the pool cannot serve the RFQ.
"""

from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
fit = importlib.import_module("supply_demand_fit_v1")

CATALOG = fit.load_catalog()


def rfq(**over):
    base = {
        "category_code": "MATCHA",
        "title": "Wanted: bulk matcha powder",
        "description_raw": "Looking for beverage grade matcha powder for a drinks brand.",
        "quantity_raw": "500 kg",
        "buyer_country_code": "US",
    }
    base.update(over)
    return base


class DemandParsingTests(unittest.TestCase):
    def test_quantity_units_normalise_to_kg(self):
        self.assertEqual(fit.parse_demand(rfq(quantity_raw="2 tons")).quantity_kg, 2000)
        self.assertEqual(fit.parse_demand(rfq(quantity_raw="1 container")).quantity_kg, 18000)
        self.assertIsNone(fit.parse_demand(rfq(quantity_raw="", description_raw="need matcha")).quantity_kg)

    def test_grade_and_cert_and_oem_are_detected(self):
        d = fit.parse_demand(rfq(description_raw="Need organic ceremonial matcha, private label, samples first"))
        self.assertEqual(d.required_grade, "ceremonial")
        self.assertIn("ORGANIC", d.required_certs)
        self.assertTrue(d.wants_private_label)
        self.assertTrue(d.wants_sample)


class VerdictTests(unittest.TestCase):
    def test_clean_bulk_beverage_rfq_has_at_least_one_match(self):
        report = fit.evaluate(rfq(quantity_raw="500 kg"), CATALOG)
        self.assertEqual(report.supply_pool_status, "HAS_MATCH")
        self.assertEqual(report.best_verdict, "MATCH")
        self.assertEqual(report.best_fit_score, 100.0)
        self.assertTrue(any(m["verdict"] == "MATCH" for m in report.eligible_matches))

    def test_quantity_below_every_moq_blocks_all(self):
        report = fit.evaluate(rfq(quantity_raw="5 kg"), CATALOG)
        self.assertEqual(report.supply_pool_status, "NO_MATCH")
        self.assertEqual(report.eligible_matches, [])
        self.assertTrue(all(e["verdict"] == "BLOCK" for e in report.all_evaluations))
        self.assertIn("硬性不匹配", report.summary_zh)

    def test_quantity_above_capacity_blocks_that_sku(self):
        report = fit.evaluate(rfq(quantity_raw="50000 kg"), CATALOG)
        big = next(e for e in report.all_evaluations if e["sku"] == "TR-BEV-2026")
        self.assertEqual(big["verdict"], "BLOCK")
        self.assertTrue(any("quantity_capacity" in b for b in big["blockers"]))

    def test_missing_mandatory_cert_is_a_hard_block_not_offset(self):
        report = fit.evaluate(
            rfq(description_raw="Need EU organic certified matcha, beverage grade, 500 kg, private label, samples"),
            CATALOG,
        )
        bakery = next(e for e in report.all_evaluations if e["sku"] == "FJS-BAK-STD")
        self.assertEqual(bakery["verdict"], "BLOCK")  # bakery SKU has only HACCP
        self.assertTrue(any("mandatory_certs" in b for b in bakery["blockers"]))

    def test_unknown_fields_make_conditional_with_gaps(self):
        report = fit.evaluate(
            rfq(quantity_raw="", description_raw="Interested in matcha powder, please send details"),
            CATALOG,
        )
        self.assertIn(report.supply_pool_status, {"HAS_MATCH", "CONDITIONAL_ONLY"})
        cond = [m for m in report.all_evaluations if m["verdict"] == "CONDITIONAL"]
        self.assertTrue(cond)
        self.assertTrue(all(m["gaps"] for m in cond))

    def test_no_forced_top_3(self):
        report = fit.evaluate(rfq(quantity_raw="", description_raw="matcha powder wanted"), CATALOG)
        # all 5 catalog SKUs are matcha; nothing hard-fails on an underspecified RFQ
        self.assertEqual(len(report.all_evaluations), 5)
        self.assertGreaterEqual(len(report.eligible_matches), 4)

    def test_empty_category_pool_is_plain_message(self):
        report = fit.evaluate(rfq(category_code="BLUEBERRY", description_raw="frozen blueberries 1000 kg"), CATALOG)
        self.assertEqual(report.supply_pool_status, "NO_MATCH")
        self.assertEqual(report.best_verdict, "NONE")
        self.assertIn("暂无 蓝莓 品类产品", report.summary_zh)

    def test_ceremonial_demand_blocks_bakery_grade(self):
        report = fit.evaluate(
            rfq(description_raw="Need ceremonial grade matcha, 40 kg, retail pouch"), CATALOG,
        )
        bakery = next(e for e in report.all_evaluations if e["sku"] == "FJS-BAK-STD")
        self.assertEqual(bakery["verdict"], "BLOCK")
        self.assertTrue(any("grade" in b for b in bakery["blockers"]))


class DeterminismTests(unittest.TestCase):
    def test_same_rfq_same_report(self):
        a = fit.evaluate(rfq(quantity_raw="500 kg"), CATALOG)
        b = fit.evaluate(rfq(quantity_raw="500 kg"), CATALOG)
        self.assertEqual(a, b)

    def test_ruleset_version_is_stamped(self):
        self.assertEqual(fit.evaluate(rfq(), CATALOG).ruleset_version, "supply-demand-fit-v1.0.0")


if __name__ == "__main__":
    unittest.main(verbosity=2)
