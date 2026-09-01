"""9-class Risk Item taxonomy: per-code triggers, item shape, access_status, order."""

from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))

risk = importlib.import_module("risk_items_v1")
fit_mod = importlib.import_module("supply_demand_fit_v1")

RfqDemand = fit_mod.RfqDemand
FitReport = fit_mod.FitReport
CATALOG = fit_mod.load_catalog()

VALID_SEVERITY = {"HIGH", "MEDIUM", "LOW"}
VALID_ACCESS = {"PASS", "CONDITIONAL", "BLOCK", "UNKNOWN"}
ITEM_KEYS = {"code", "severity", "evidence", "reason", "mitigation", "review_by"}


def demand(**over):
    base = dict(
        category_code="MATCHA",
        text="beverage grade matcha powder 500 kg to rotterdam",
        quantity_kg=500.0,
        quantity_precision="EXACT",
        required_grade="beverage",
        required_certs=[],
        destination_market="NL",
        deadline_days=None,
        target_price_usd_per_kg=None,
    )
    base.update(over)
    return RfqDemand(**base)


def clean_fit():
    return FitReport(
        supply_pool_status="HAS_MATCH", best_verdict="MATCH", best_fit_score=100.0,
        eligible_matches=[{"sku": "TR-BEV-2026", "verdict": "MATCH"}],
        all_evaluations=[], summary_zh="ok",
    )


def clean_row(**over):
    base = dict(
        title="Wanted: beverage grade matcha powder",
        description_raw=("We need 500 kg beverage grade matcha powder delivered to "
                         "Rotterdam. Payment by L/C at sight."),
        specs_present="True",
        destination_present="True",
        contact_gate="",
    )
    base.update(over)
    return base


def classify(d=None, f=None, row=None, identity="DOMAIN_LINKED"):
    return risk.classify_risk_items(
        d if d is not None else demand(),
        f if f is not None else clean_fit(),
        row if row is not None else clean_row(),
        buyer_identity_status=identity, catalog=CATALOG,
    )


def codes(*args, **kwargs):
    return {item["code"] for item in classify(*args, **kwargs)[0]}


class CleanCaseTests(unittest.TestCase):
    def test_clean_case_has_no_risk_and_passes(self):
        items, access = classify()
        self.assertEqual(items, [])
        self.assertEqual(access, "PASS")

    def test_every_item_is_well_formed(self):
        items, access = risk.classify_risk_items(
            demand(quantity_kg=None, quantity_precision="UNKNOWN", destination_market=None),
            clean_fit(),
            clean_row(specs_present="False", destination_present="False",
                      contact_gate="platform_public_response",
                      description_raw="Country of origin: India. Payment terms: D/A 60 days."),
            buyer_identity_status="UNRESOLVED", catalog=CATALOG,
        )
        self.assertTrue(items)
        for item in items:
            self.assertEqual(set(item), ITEM_KEYS)
            self.assertIn(item["severity"], VALID_SEVERITY)
            self.assertTrue(item["mitigation"])
            self.assertTrue(item["review_by"])
            self.assertTrue(item["evidence"])
        self.assertIn(access, VALID_ACCESS)


class QuantitySuspectTests(unittest.TestCase):
    def test_fires_on_missing_quantity(self):
        self.assertIn("QUANTITY_SUSPECT", codes(demand(quantity_kg=None, quantity_precision="UNKNOWN")))

    def test_fires_far_above_pool_capacity(self):
        self.assertIn("QUANTITY_SUSPECT", codes(demand(quantity_kg=500_000.0)))

    def test_fires_far_below_smallest_moq(self):
        self.assertIn("QUANTITY_SUSPECT", codes(demand(quantity_kg=1.0)))

    def test_silent_on_normal_quantity(self):
        self.assertNotIn("QUANTITY_SUSPECT", codes(demand(quantity_kg=500.0)))


class PaymentTermRiskTests(unittest.TestCase):
    def test_fires_on_open_account(self):
        row = clean_row(description_raw="500 kg matcha, payment by open account, net 60.")
        self.assertIn("PAYMENT_TERM_RISK", codes(demand(), clean_fit(), row))

    def test_high_when_large_quantity(self):
        row = clean_row(description_raw="matcha, terms: D/A 90 days.")
        items, _ = classify(demand(quantity_kg=5000.0), clean_fit(), row)
        pay = next(item for item in items if item["code"] == "PAYMENT_TERM_RISK")
        self.assertEqual(pay["severity"], "HIGH")

    def test_low_when_large_quantity_and_no_terms_disclosed(self):
        row = clean_row(description_raw="We want 6 tonnes of matcha powder for our plant.")
        items, _ = classify(demand(quantity_kg=6000.0), clean_fit(), row)
        pay = next(item for item in items if item["code"] == "PAYMENT_TERM_RISK")
        self.assertEqual(pay["severity"], "LOW")

    def test_silent_on_letter_of_credit(self):
        row = clean_row(description_raw="500 kg matcha, payment terms: L/C at sight.")
        self.assertNotIn("PAYMENT_TERM_RISK", codes(demand(), clean_fit(), row))


class OriginConflictTests(unittest.TestCase):
    def test_fires_on_explicit_foreign_origin(self):
        row = clean_row(description_raw="Need matcha. Country of origin: Japan. 500 kg.")
        self.assertIn("ORIGIN_CONFLICT", codes(demand(), clean_fit(), row))

    def test_fires_on_nationality_adjective(self):
        row = clean_row(description_raw="Wanted Indian origin green tea powder, 500 kg.")
        self.assertIn("ORIGIN_CONFLICT", codes(demand(), clean_fit(), row))

    def test_silent_on_china_origin(self):
        row = clean_row(description_raw="Need matcha, made in China preferred, 500 kg.")
        self.assertNotIn("ORIGIN_CONFLICT", codes(demand(), clean_fit(), row))

    def test_silent_when_buyer_only_asks_to_state_origin(self):
        row = clean_row(description_raw="Please state origin, moisture and packing for 500 kg matcha.")
        self.assertNotIn("ORIGIN_CONFLICT", codes(demand(), clean_fit(), row))

    def test_silent_with_no_origin_mention(self):
        self.assertNotIn("ORIGIN_CONFLICT", codes())


class DeliveryConflictTests(unittest.TestCase):
    def test_fires_when_deadline_shorter_than_fastest_lead_time(self):
        self.assertIn("DELIVERY_CONFLICT", codes(demand(deadline_days=7)))

    def test_fires_on_incoterm_without_destination_market(self):
        row = clean_row(description_raw="Need matcha 500 kg, please quote FOB.")
        self.assertIn("DELIVERY_CONFLICT", codes(demand(destination_market=None), clean_fit(), row))

    def test_silent_with_slack_deadline(self):
        self.assertNotIn("DELIVERY_CONFLICT", codes(demand(deadline_days=60)))

    def test_silent_with_no_deadline_and_known_destination(self):
        self.assertNotIn("DELIVERY_CONFLICT", codes())


class MigratedCodeTests(unittest.TestCase):
    def test_identity_unknown_keys_on_identity_status(self):
        self.assertIn("IDENTITY_UNKNOWN", codes(identity="UNRESOLVED"))
        self.assertIn("IDENTITY_UNKNOWN", codes(identity="PERSON_ONLY"))
        self.assertNotIn("IDENTITY_UNKNOWN", codes(identity="PLATFORM_ACCOUNT"))
        self.assertNotIn("IDENTITY_UNKNOWN", codes(identity="DOMAIN_LINKED"))

    def test_platform_only_contact_and_spec_and_market_gaps(self):
        row = clean_row(specs_present="False", destination_present="False",
                        contact_gate="platform_public_response")
        found = codes(demand(), clean_fit(), row)
        self.assertTrue(
            {"PLATFORM_ONLY_CONTACT", "SPECIFICATION_GAP", "MARKET_ACCESS_UNKNOWN"}.issubset(found)
        )

    def test_certification_gap_from_fit_report(self):
        report = FitReport(
            supply_pool_status="CONDITIONAL_ONLY", best_verdict="CONDITIONAL", best_fit_score=60.0,
            eligible_matches=[{"sku": "TR-BEV-2026"}],
            all_evaluations=[{"sku": "FJS-BAK-STD", "checks": [
                {"dimension": "mandatory_certs", "kind": "HARD", "status": "FAIL",
                 "detail": "缺少认证：USDA_ORGANIC"}]}],
            summary_zh="",
        )
        items, _ = classify(demand(), report)
        self.assertIn("CERTIFICATION_GAP", {item["code"] for item in items})


class AccessStatusTests(unittest.TestCase):
    def test_pass_on_clean_case(self):
        self.assertEqual(classify()[1], "PASS")

    def test_conditional_on_high_risk_case(self):
        row = clean_row(description_raw="Need matcha 500 kg. Country of origin: India.")
        items, access = classify(demand(), clean_fit(), row)
        self.assertTrue(any(item["severity"] == "HIGH" for item in items))
        self.assertEqual(access, "CONDITIONAL")

    def test_conditional_on_medium_only(self):
        _, access = classify(demand(), clean_fit(), clean_row(specs_present="False"))
        self.assertEqual(access, "CONDITIONAL")

    def test_unknown_when_destination_and_regulation_absent(self):
        _, access = classify(demand(destination_market=None))
        self.assertEqual(access, "UNKNOWN")

    def test_block_when_mandatory_cert_fails_with_no_eligible_match(self):
        report = FitReport(
            supply_pool_status="NO_MATCH", best_verdict="BLOCK", best_fit_score=12.0,
            eligible_matches=[],
            all_evaluations=[{"sku": "FJS-BAK-STD", "checks": [
                {"dimension": "mandatory_certs", "kind": "HARD", "status": "FAIL",
                 "detail": "缺少认证：KOSHER"}]}],
            summary_zh="",
        )
        self.assertEqual(classify(demand(), report)[1], "BLOCK")


class DeterminismTests(unittest.TestCase):
    def test_same_input_same_output(self):
        args = (demand(quantity_kg=None, quantity_precision="UNKNOWN"), clean_fit(),
                clean_row(specs_present="False"))
        self.assertEqual(classify(*args), classify(*args))

    def test_items_sorted_by_severity_then_code(self):
        row = clean_row(
            specs_present="False", destination_present="False",
            contact_gate="platform_public_response",
            description_raw="Country of origin: India. Payment: open account, net 60. 500 kg.",
        )
        items, _ = classify(demand(quantity_kg=None, quantity_precision="UNKNOWN"),
                            clean_fit(), row, identity="UNRESOLVED")
        rank = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        keys = [(rank[item["severity"]], item["code"]) for item in items]
        self.assertEqual(keys, sorted(keys))
        self.assertEqual(items[0]["code"], "ORIGIN_CONFLICT")


class DepthHeuristicTests(unittest.TestCase):
    """The four rule-based classes added for audit gap '买家信用/欺诈/知产/合同'."""

    def test_credit_unknown_when_unresolved_and_no_anchor(self):
        items, _ = classify(row=clean_row(), identity="UNRESOLVED")
        credit = [i for i in items if i["code"] == "CREDIT_UNKNOWN"]
        self.assertEqual(len(credit), 1)
        self.assertEqual(credit[0]["severity"], "LOW")

    def test_no_credit_unknown_when_identity_resolved(self):
        self.assertNotIn("CREDIT_UNKNOWN", codes(row=clean_row(), identity="DOMAIN_LINKED"))

    def test_fraud_signal_on_free_mail_with_unresolved_identity(self):
        row = clean_row(contact_person_raw="Tim Lee, contact: tim.lee88@gmail.com")
        items, access = classify(row=row, identity="UNRESOLVED")
        fraud = [i for i in items if i["code"] == "FRAUD_SIGNAL"]
        self.assertEqual(len(fraud), 1)
        self.assertEqual(fraud[0]["severity"], "MEDIUM")
        self.assertIn("gmail.com", fraud[0]["evidence"])
        self.assertEqual(access, "CONDITIONAL")

    def test_no_fraud_signal_with_corporate_mail(self):
        row = clean_row(contact_person_raw="Contact: buyers@acme-foods.de")
        self.assertNotIn("FRAUD_SIGNAL", codes(row=row, identity="UNRESOLVED"))

    def test_fraud_escalates_when_quantity_suspect(self):
        row = clean_row(contact_person_raw="buyer1@qq.com", description_raw="no quantity disclosed")
        items, _ = classify(demand(quantity_kg=None, quantity_precision="UNKNOWN"),
                            clean_fit(), row, identity="UNRESOLVED")
        fraud = [i for i in items if i["code"] == "FRAUD_SIGNAL"]
        self.assertEqual(len(fraud), 1)
        self.assertEqual(fraud[0]["severity"], "HIGH")

    def test_ip_conflict_on_brand_title(self):
        row = clean_row(title="Wanted: Starbucks-style matcha latte powder")
        items, _ = classify(row=row)
        ip = [i for i in items if i["code"] == "IP_CONFLICT"]
        self.assertEqual(len(ip), 1)
        self.assertEqual(ip[0]["severity"], "MEDIUM")
        self.assertIn("starbucks", ip[0]["evidence"])

    def test_ip_conflict_chinese_brand(self):
        row = clean_row(title="需求：瑞幸同款抹茶粉")
        self.assertIn("IP_CONFLICT", codes(row=row))

    def test_contract_risk_on_full_advance_without_guarantee(self):
        row = clean_row(description_raw="Payment: 100% T/T in advance, no guarantee.")
        items, _ = classify(row=row)
        contract = [i for i in items if i["code"] == "CONTRACT_RISK"]
        self.assertEqual(len(contract), 1)
        self.assertEqual(contract[0]["severity"], "MEDIUM")

    def test_contract_risk_chinese(self):
        row = clean_row(description_raw="付款方式：无担保全预付")
        self.assertIn("CONTRACT_RISK", codes(row=row))


if __name__ == "__main__":
    unittest.main(verbosity=2)
