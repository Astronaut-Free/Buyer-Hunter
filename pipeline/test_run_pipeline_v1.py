"""Orchestration behaviour for run_pipeline: partial vs failed, env skips,
and that a failed required step stops the run.
"""

from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
rp = importlib.import_module("run_pipeline")


def runner_for(outcomes):
    """outcomes: {step_name: 'OK'|'FAILED'}; anything absent is OK."""
    def _run(step):
        return rp.StepResult(step.name, outcomes.get(step.name, "OK"), 0, 0.0, "")
    return _run


class RunPipelineTests(unittest.TestCase):
    def test_all_ok_is_succeeded(self):
        report = rp.run(rp.STEPS, step_runner=runner_for({}), env_present=lambda _: True)
        self.assertEqual(report.status, "SUCCEEDED")
        self.assertTrue(all(s.status == "OK" for s in report.steps))

    def test_collector_failure_is_partial_not_fatal(self):
        report = rp.run(rp.STEPS, step_runner=runner_for({"collect_ted": "FAILED"}), env_present=lambda _: True)
        self.assertEqual(report.status, "PARTIAL")
        # the required build step still ran
        build = next(s for s in report.steps if s.name == "build_opportunity_store")
        self.assertEqual(build.status, "OK")

    def test_required_failure_stops_the_run(self):
        report = rp.run(
            rp.STEPS,
            step_runner=runner_for({"aggregate_full_collection": "FAILED"}),
            env_present=lambda _: True,
        )
        self.assertEqual(report.status, "FAILED")
        build = next(s for s in report.steps if s.name == "build_opportunity_store")
        self.assertEqual(build.status, "SKIPPED")

    def test_missing_credential_skips_that_step_only(self):
        calls = []

        def runner(step):
            calls.append(step.name)
            return rp.StepResult(step.name, "OK", 0, 0.0, "")

        report = rp.run(rp.STEPS, step_runner=runner, env_present=lambda name: False)
        sam = next(s for s in report.steps if s.name == "collect_sam_precise")
        self.assertEqual(sam.status, "SKIPPED")
        self.assertNotIn("collect_sam_precise", calls)
        self.assertEqual(report.status, "SUCCEEDED")

    def test_report_serialises_to_json(self):
        report = rp.run(rp.STEPS, step_runner=runner_for({}), env_present=lambda _: True)
        import json

        blob = json.dumps(report.to_dict())
        self.assertIn(rp.STEPS[0].name, blob)
        self.assertEqual(json.loads(blob)["status"], "SUCCEEDED")


if __name__ == "__main__":
    unittest.main(verbosity=2)
