from __future__ import annotations

import importlib
import sys
import unittest
from copy import deepcopy
from pathlib import Path


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
engine = importlib.import_module("opportunity_decision_engine_v1")


SELLER = {
    "id": "seller-guizhou-matcha-demo",
    "attributes": {
        "product": {"form": "beverage_grade_matcha", "moq_kg": 100},
        "certifications": ["HACCP", "ISO22000"],
        "capacity": {"monthly_kg": 8000},
    },
}


def signal(opportunity_id: str = "opp-001") -> dict:
    return {
        "opportunity_id": opportunity_id,
        "buyer_id": "buyer-001",
        "truth_score": 82,
        "exact_product_match": True,
        "age_days": 5,
        "buying_window": {"status": "OPEN"},
        "commercial_execution": 85,
        "procurement_channel_actionability": 80,
        "market_access": 80,
        "why_now": ["5 天前发布明确采购需求"],
        "requirements": [
            {"field_code": "product.form", "operator": "EQ", "value": "beverage_grade_matcha", "hard": True, "requirement_type": "PRODUCT"},
            {"field_code": "capacity.monthly_kg", "operator": "GTE", "value": 1000, "hard": False, "requirement_type": "COMMERCIAL"},
        ],
        "next_action": {"action_type": "SEND_SAMPLE", "summary": "发送三款样品", "checklist": ["规格表", "COA"]},
    }


class OpportunityDecisionTests(unittest.TestCase):
    def test_truth_is_gate_not_opportunity_weight(self):
        first = signal()
        second = deepcopy(first)
        first["truth_score"] = 60
        second["truth_score"] = 95
        low = engine.assess_opportunity(first, SELLER)
        high = engine.assess_opportunity(second, SELLER)
        self.assertEqual(low.opportunity_score, high.opportunity_score)
        self.assertTrue(low.hard_gate_passed)

    def test_phase1_weights_and_components_are_exact(self):
        decision = engine.assess_opportunity(signal(), SELLER)
        self.assertEqual(decision.opportunity_score, 80.4)
        self.assertEqual(
            set(decision.component_scores),
            {"timing", "seller_fit", "commercial_execution", "procurement_channel_actionability", "market_access"},
        )

    def test_buyer_strength_is_not_a_component_or_weight(self):
        first = signal()
        second = deepcopy(first)
        first["buyer_strength"] = 0
        second["buyer_strength"] = 100
        low = engine.assess_opportunity(first, SELLER)
        high = engine.assess_opportunity(second, SELLER)
        self.assertEqual(low.opportunity_score, high.opportunity_score)
        self.assertNotIn("buyer_strength", low.component_scores)

    def test_observable_window_signals_raise_timing(self):
        baseline = engine.assess_opportunity(signal(), SELLER)
        active = signal()
        active["buying_window"].update({
            "explicit_urgency": True,
            "transaction_stage": "BULK_RFQ",
            "continuity_signals": ["LONG_TERM_SIGNAL"],
        })
        decision = engine.assess_opportunity(active, SELLER)
        self.assertGreater(decision.component_scores["timing"], baseline.component_scores["timing"])

    def test_truth_below_gate_passes_no_sales_time(self):
        item = signal()
        item["truth_score"] = 59
        decision = engine.assess_opportunity(item, SELLER)
        self.assertEqual(decision.decision_status, "PASS")
        self.assertFalse(decision.hard_gate_passed)
        self.assertEqual(decision.next_action["action_type"], "NO_ACTION")

    def test_hard_requirement_failure_blocks(self):
        item = signal()
        item["requirements"][0]["value"] = "ceremonial_grade_matcha"
        decision = engine.assess_opportunity(item, SELLER)
        self.assertEqual(decision.decision_status, "PASS")
        self.assertIn("硬条件不满足：product.form", decision.blockers)

    def test_unknown_field_generates_gap_and_verify_first(self):
        item = signal()
        item["requirements"].append({
            "field_code": "certificates.usda_organic",
            "operator": "EXISTS",
            "value": True,
            "hard": False,
            "requirement_type": "MARKET_ACCESS",
        })
        decision = engine.assess_opportunity(item, SELLER)
        self.assertEqual(decision.decision_status, "VERIFY_FIRST")
        self.assertTrue(any("usda_organic" in gap for gap in decision.gaps))
        self.assertEqual(decision.next_action["action_type"], "VERIFY_GAP")

    def test_rank_is_deterministic(self):
        first, second = signal("opp-b"), signal("opp-a")
        ranked = engine.rank_opportunities([first, second], SELLER)
        self.assertEqual([item["opportunity_id"] for item in ranked], ["opp-a", "opp-b"])
        self.assertEqual([item["rank"] for item in ranked], [1, 2])

    def test_same_input_has_same_snapshot_hash(self):
        first = engine.assess_opportunity(signal(), SELLER)
        second = engine.assess_opportunity(signal(), SELLER)
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main(verbosity=2)
