"""Thin stdin/stdout dispatcher for authoritative Python capabilities."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
# supply_demand_fit_v1 imports destination_v1 as a sibling module, so the
# pipeline directory itself must be importable when the CLI runs from any cwd.
sys.path.insert(0, str(ROOT / "pipeline"))

from pipeline.skills.a3_purchase_timing import A3, run as run_a3  # noqa: E402
from pipeline.skills.a4_supply_match import A4, run as run_a4  # noqa: E402
from pipeline.skills.a5_trade_risk import A5, run as run_a5  # noqa: E402

Runner = Callable[[dict[str, Any]], dict[str, Any]]
DISPATCH: dict[str, Runner] = {A3: run_a3, A4: run_a4, A5: run_a5}


def run_capability(capability: str, context: dict[str, Any]) -> dict[str, Any]:
    """Dispatch without embedding any domain rules in the CLI."""
    runner = DISPATCH.get(capability)
    if runner is None:
        raise ValueError(f"unknown capability: {capability}")
    return runner(context or {})


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        result = run_capability(str(payload.get("capability") or ""), payload.get("context") or {})
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 2
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
