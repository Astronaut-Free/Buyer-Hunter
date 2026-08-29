"""One command that runs the whole Buyer Hunter data pipeline end to end.

    python pipeline/run_pipeline.py

Order: collectors -> clean/score -> aggregate -> build decision store. Each
collector runs in its own process, so one crash does not take the run down; the
run is marked PARTIAL and the rest continues. Aggregation and store build are
required - if they fail the run fails. A collector that needs a credential it
does not have is skipped, not failed.

Designed to be triggered on a schedule (Windows Task Scheduler / cron / a cloud
scheduler). Every run writes runtime/pipeline_last_run.json and appends to
runtime/pipeline_runs.jsonl so the "found N minutes ago" surface has a source.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path


PIPELINE = Path(__file__).resolve().parent
ROOT = PIPELINE.parent
RUNTIME = ROOT / "runtime"


@dataclass(frozen=True)
class Step:
    name: str
    script: str
    args: tuple[str, ...] = ()
    required: bool = False
    needs_env: str | None = None


# Collectors are best-effort; aggregation and the store build are not.
STEPS: tuple[Step, ...] = (
    Step("collect_b2b_public", "collect_b2b_public_v3.py", ("--delay", "1.5", "--retries", "2")),
    Step("clean_and_score_b2b", "clean_and_score_buyer_signals_v1.py"),
    Step("collect_alibaba_rfq", "collect_alibaba_public_rfq.py"),
    Step("collect_ted", "collect_ted_precise.py"),
    Step("collect_ec21_regions", "collect_ec21_regions.py"),
    Step("collect_sam_precise", "collect_sam_precise.py", needs_env="SAM_API_KEY"),
    Step("collect_ungm", "collect_ungm_public.py"),
    Step("collect_samples", "collect_samples_v2.py"),
    Step("aggregate_full_collection", "aggregate_full_collection_v1.py", required=True),
    Step("build_opportunity_store", "build_opportunity_store_v1.py", required=True),
)


@dataclass
class StepResult:
    name: str
    status: str  # OK | FAILED | SKIPPED
    exit_code: int | None = None
    duration_s: float = 0.0
    detail: str = ""


@dataclass
class RunReport:
    run_id: str
    started_at: str
    completed_at: str = ""
    status: str = "RUNNING"  # SUCCEEDED | PARTIAL | FAILED
    steps: list[StepResult] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "status": self.status,
            "steps": [vars(s) for s in self.steps],
        }


def _run_step(step: Step, *, python: str, timeout: int) -> StepResult:
    cmd = [python, str(PIPELINE / step.script), *step.args]
    started = time.monotonic()
    try:
        completed = subprocess.run(
            cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return StepResult(step.name, "FAILED", None, round(time.monotonic() - started, 1), "timeout")

    duration = round(time.monotonic() - started, 1)
    if completed.returncode == 0:
        tail = (completed.stdout or "").strip().splitlines()[-1:] or [""]
        return StepResult(step.name, "OK", 0, duration, tail[0][:500])
    err = (completed.stderr or completed.stdout or "").strip().splitlines()[-1:] or [""]
    return StepResult(step.name, "FAILED", completed.returncode, duration, err[0][:500])


def run(steps=STEPS, *, python: str | None = None, timeout: int = 1800,
        env_present=None, step_runner=None) -> RunReport:
    python = python or sys.executable
    env_present = env_present or (lambda name: bool(os.environ.get(name)))
    step_runner = step_runner or (
        lambda step: _run_step(step, python=python, timeout=timeout)
    )
    now = datetime.now(timezone.utc)
    report = RunReport(run_id=now.strftime("%Y%m%dT%H%M%SZ"), started_at=now.isoformat(timespec="seconds"))

    required_failed = False
    collector_failed = False
    for step in steps:
        if required_failed:
            report.steps.append(StepResult(step.name, "SKIPPED", detail="a required step failed earlier"))
            continue
        if step.needs_env and not env_present(step.needs_env):
            report.steps.append(StepResult(step.name, "SKIPPED", detail=f"missing env {step.needs_env}"))
            print(f"[SKIPPED] {step.name} (missing env {step.needs_env})", flush=True)
            continue
        result = step_runner(step)
        report.steps.append(result)
        print(f"[{result.status:>7}] {step.name} ({result.duration_s}s) {result.detail}", flush=True)
        if result.status == "FAILED":
            if step.required:
                required_failed = True
            else:
                collector_failed = True

    report.status = "FAILED" if required_failed else "PARTIAL" if collector_failed else "SUCCEEDED"
    report.completed_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return report


def _persist(report: RunReport) -> None:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    (RUNTIME / "pipeline_last_run.json").write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    with (RUNTIME / "pipeline_runs.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(report.to_dict(), ensure_ascii=False) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the full Buyer Hunter pipeline")
    parser.add_argument("--only", nargs="*", help="run only these step names")
    parser.add_argument("--skip-collect", action="store_true", help="re-aggregate and rebuild from existing collector output")
    parser.add_argument("--timeout", type=int, default=1800, help="per-step timeout in seconds")
    args = parser.parse_args()

    steps = STEPS
    if args.skip_collect:
        steps = tuple(s for s in steps if s.name in {"aggregate_full_collection", "build_opportunity_store"})
    if args.only:
        wanted = set(args.only)
        steps = tuple(s for s in steps if s.name in wanted)
        if not steps:
            raise SystemExit(f"no matching steps: {sorted(wanted)}")

    report = run(steps, timeout=args.timeout)
    _persist(report)
    print(json.dumps({"run_id": report.run_id, "status": report.status}, ensure_ascii=False))
    return 0 if report.status in {"SUCCEEDED", "PARTIAL"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
