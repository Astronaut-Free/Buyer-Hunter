"""Python capability CLI: envelope shape, Free-logic delegation, contract compliance."""

from __future__ import annotations

import importlib
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "pipeline"))

cli = importlib.import_module("capability_cli")
SCHEMA = json.loads((ROOT / "contracts" / "capability-result-envelope.schema.json").read_text(encoding="utf-8"))

A3, A4, A5 = cli.A3, cli.A4, cli.A5
A8 = cli.A8


def ctx(**over):
    base = {
        "opportunity_id": "opp-t",
        "changed_fields": ["quantity"],
        "opportunity_state": {
            "stage": "QUALIFYING",
            "fields": {"product": "MATCHA", "demand_title": "bulk ceremonial matcha powder",
                       "quantity": "500 kg", "destination": "US", "age_days": "6"},
        },
        "field_updates": {"quantity": "2 tons"},
        "seller_context": {"capacity": "8000 kg/mo", "allowed_markets": ["US"]},
        "latest_buyer_message": {"content": "we now need 2 tons to the US", "evidence_ref": "email:m1"},
    }
    base.update(over)
    return base


def validate_envelope(env: dict) -> list[str]:
    """Minimal JSON-Schema check (stdlib only): required keys + enum + types."""
    errors: list[str] = []
    for key in SCHEMA["required"]:
        if key not in env:
            errors.append(f"missing {key}")
    props = SCHEMA["properties"]
    if env.get("run_status") not in props["run_status"]["enum"]:
        errors.append(f"run_status {env.get('run_status')!r} not in enum")
    for key in ("changed_fields", "missing_evidence", "evidence_refs"):
        if not isinstance(env.get(key), list):
            errors.append(f"{key} must be array")
    if not isinstance(env.get("human_review_required"), bool):
        errors.append("human_review_required must be boolean")
    if not isinstance(env.get("domain_result"), dict):
        errors.append("domain_result must be object")
    return errors


class CapabilityCliTest(unittest.TestCase):
    def test_all_three_dispatch_and_validate(self) -> None:
        for cap in (A3, A4, A5):
            env = cli.run_capability(cap, ctx())
            self.assertEqual(env["capability_id"], cap)
            self.assertEqual(validate_envelope(env), [], cap)
            self.assertEqual(env["domain_result"]["capability_runtime"], "python")

    def test_a4_uses_free_supply_demand_fit(self) -> None:
        env = cli.run_capability(A4, ctx())
        dr = env["domain_result"]
        self.assertEqual(env["run_status"], "DONE")
        self.assertIn(dr["supply_pool_status"], {"HAS_MATCH", "CONDITIONAL_ONLY", "NO_MATCH"})
        self.assertIn(dr["best_verdict"], {"MATCH", "CONDITIONAL", "BLOCK", "NONE"})
        self.assertIn("抹茶", dr["summary_zh"])

    def test_a4_missing_category_is_more_evidence(self) -> None:
        env = cli.run_capability(A4, ctx(opportunity_state={"fields": {}}, field_updates={}))
        self.assertEqual(env["run_status"], "MORE_EVIDENCE")
        self.assertIn("product_category", env["missing_evidence"])

    def test_a3_returns_numeric_timing_score(self) -> None:
        env = cli.run_capability(A3, ctx())
        self.assertEqual(env["run_status"], "DONE")
        self.assertIsInstance(env["domain_result"]["timing_score"], (int, float))
        self.assertGreater(env["domain_result"]["timing_score"], 0)

    def test_a5_blocks_explicitly_blocked_market(self) -> None:
        env = cli.run_capability(A5, ctx(
            changed_fields=["destination"],
            field_updates={"destination": "Iran"},
            seller_context={"blocked_markets": ["Iran"]},
        ))
        self.assertEqual(env["run_status"], "BLOCKED")
        self.assertEqual(env["domain_result"]["decision"], "BLOCKED")

    def test_a5_needs_evidence_when_policy_missing(self) -> None:
        env = cli.run_capability(A5, ctx(
            changed_fields=["payment_terms"],
            field_updates={},
            seller_context={},
        ))
        self.assertEqual(env["run_status"], "MORE_EVIDENCE")
        self.assertIn("payment_policy", env["missing_evidence"])

    def test_a5_review_carries_rule_depth_risk_items(self) -> None:
        env = cli.run_capability(A5, ctx(
            field_updates={"destination": "DE", "payment_terms": "100% T/T in advance, no guarantee"},
            latest_buyer_message={"content": "want starbucks-style matcha"},
            seller_context={"allowed_markets": ["DE"], "payment_policy": ["T/T"]},
        ))
        self.assertEqual(env["run_status"], "DONE")
        result = env["domain_result"]
        codes = {item["code"] for item in result.get("risk_items", [])}
        self.assertIn("CONTRACT_RISK", codes)
        self.assertIn("IP_CONFLICT", codes)

    def test_a5_depth_fraud_signal_on_free_mail(self) -> None:
        env = cli.run_capability(A5, ctx(
            field_updates={"destination": "DE", "contact_email_raw": "buyer77@qq.com",
                           "buyer_identity_status": "UNRESOLVED"},
            seller_context={"allowed_markets": ["DE"], "market_access": "EU-GMP-baseline"},
        ))
        result = env["domain_result"]
        fraud = [i for i in result.get("risk_items", []) if i["code"] == "FRAUD_SIGNAL"]
        self.assertEqual(len(fraud), 1)
        self.assertEqual(fraud[0]["severity"], "MEDIUM")

    def _a8(self, **over):
        base = {
            "opportunity_id": "opp-a8",
            "decision": {"decision_status": "PURSUE_NOW", "opportunity_score": 82.0,
                         "component_scores": {"timing": 80, "seller_fit": 90}, "gaps": []},
            "risks": [], "access_status": "CONDITIONAL", "stage": "QUALIFYING",
        }
        base.update(over)
        return cli.run_capability(A8, base)

    def test_a8_pursue_now_maps_to_outreach(self) -> None:
        env = self._a8()
        self.assertEqual(env["run_status"], "DONE")
        result = env["domain_result"]
        self.assertEqual(result["decision"], "OUTREACH")
        self.assertEqual(result["primary_action"]["type"], "OUTREACH")
        self.assertTrue(result["human_approval_required"])
        self.assertEqual(result["contact_strategy"]["preferred"], "public_channel_first")

    def test_a8_verify_first_maps_to_verify_gaps(self) -> None:
        env = self._a8(decision={"decision_status": "VERIFY_FIRST", "gaps": ["规格待确认", "主体未核验"]})
        result = env["domain_result"]
        self.assertEqual(result["primary_action"]["type"], "VERIFY_GAPS")
        self.assertIn("规格待确认", result["primary_action"]["reason"])
        self.assertEqual(result["secondary_action"]["type"], "PREPARE_OUTREACH")

    def test_a8_block_never_bypassed(self) -> None:
        env = self._a8(access_status="BLOCK")
        self.assertEqual(env["run_status"], "BLOCKED")
        self.assertEqual(env["domain_result"]["primary_action"]["type"], "HALT")
        self.assertTrue(env["human_review_required"])

    def test_a8_pass_maps_to_no_action(self) -> None:
        env = self._a8(decision={"decision_status": "PASS", "gaps": []})
        result = env["domain_result"]
        self.assertEqual(result["primary_action"]["type"], "NO_ACTION")
        self.assertFalse(result["human_approval_required"])

    def test_a8_missing_decision_is_not_applicable(self) -> None:
        env = self._a8(decision={})
        self.assertEqual(env["run_status"], "NOT_APPLICABLE")
        self.assertEqual(env["domain_result"]["decision"], "NO_SNAPSHOT")

    def test_missing_opportunity_id_blocks(self) -> None:
        for cap in (A3, A4, A5, A8):
            env = cli.run_capability(cap, ctx(opportunity_id=None))
            self.assertEqual(env["run_status"], "BLOCKED")

    def test_stdin_stdout_roundtrip(self) -> None:
        import subprocess

        proc = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "capability_cli.py")],
            input=json.dumps({"capability": A4, "context": ctx()}),
            capture_output=True, text=True, cwd=str(Path.home()),
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        env = json.loads(proc.stdout)
        self.assertEqual(env["capability_id"], A4)
        self.assertEqual(validate_envelope(env), [])


if __name__ == "__main__":
    unittest.main()
