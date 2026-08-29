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


def ctx(**over):
    base = {
        "opportunity_id": "opp-t",
        "evaluated_at": "2026-08-29T00:00:00Z",
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
        self.assertIn(env["run_status"], {"DONE", "MORE_EVIDENCE", "BLOCKED"})
        self.assertIn(dr["recommendation"], {"FIT", "CONDITIONAL_FIT", "NOT_FIT", "NEED_MORE_DATA"})
        self.assertIsInstance(dr["eligible_skus"], list)
        self.assertEqual(dr["ruleset_version"], "a4-supply-match-v1.1.0")

    def test_a4_missing_category_is_more_evidence(self) -> None:
        env = cli.run_capability(A4, ctx(opportunity_state={"fields": {}}, field_updates={}))
        self.assertEqual(env["run_status"], "MORE_EVIDENCE")
        self.assertIn("product_category", env["missing_evidence"])

    def test_a3_returns_numeric_window_score(self) -> None:
        env = cli.run_capability(A3, ctx(latest_buyer_message={"content": "urgent RFQ, delivery needed by October", "evidence_ref": "email:m1"}))
        self.assertIn(env["run_status"], {"DONE", "MORE_EVIDENCE", "BLOCKED"})
        self.assertIsInstance(env["domain_result"]["window_score"], (int, float))
        self.assertGreater(env["domain_result"]["window_score"], 0)

    def test_a5_does_not_block_market_without_regulatory_evidence(self) -> None:
        env = cli.run_capability(A5, ctx(
            changed_fields=["destination"],
            destination_market="IR",
            seller_context={"blocked_markets": ["IR"]},
        ))
        self.assertNotEqual(env["run_status"], "BLOCKED")
        self.assertEqual(env["domain_result"]["access_status"], "CONDITIONAL")

    def test_a5_needs_evidence_when_policy_missing(self) -> None:
        env = cli.run_capability(A5, ctx(
            changed_fields=["payment_terms"],
            destination_market=None,
            seller_context={},
        ))
        self.assertEqual(env["run_status"], "MORE_EVIDENCE")
        self.assertIn("destination_market", env["missing_evidence"])

    def test_missing_opportunity_id_blocks(self) -> None:
        for cap in (A3, A4, A5):
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
