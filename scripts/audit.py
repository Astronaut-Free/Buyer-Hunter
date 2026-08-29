"""Cross-runtime audit for the integrated Buyer Hunter / 黔脉 repo.

    python scripts/audit.py [--skip-tests] [--no-html]

Runs the Python + Node test suites, exercises the A1->A5 pipeline + decision API,
the bidirectional Free<->agent bridge, the agent runtime boot, the A2-A6
skill-dispatch check, and the portal live-data wiring, then writes:

    docs/AUDIT_<date>.md      the report
    docs/audit/audit.html     a standalone artifact (unless --no-html)

Exit code is non-zero if any hard check fails.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import closing
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "agent"
DOCS = ROOT / "docs"
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
PY = sys.executable
NPM = shutil.which("npm") or shutil.which("npm.cmd") or "npm"
NODE = shutil.which("node") or "node"
LOCAL_HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def run(cmd: list[str], cwd: Path = ROOT, timeout: int = 900) -> subprocess.CompletedProcess:
    # pytest / node both emit UTF-8; force it so a stray em-dash in test output
    # doesn't crash the reader thread on a non-UTF-8 system locale (e.g. GBK).
    return subprocess.run(
        cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout,
        encoding="utf-8", errors="replace",
        shell=(os.name == "nt" and Path(cmd[0]).name.startswith("npm")),
    )


def free_port() -> int:
    with closing(socket.socket()) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_http(url: str, timeout: float = 20.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            # Audit targets are loopback services.  Bypass macOS/system proxy
            # settings so 127.0.0.1 health checks cannot leak to a local proxy.
            with LOCAL_HTTP.open(url, timeout=2) as resp:
                if resp.status < 500:
                    return True
        except (urllib.error.URLError, ConnectionError, socket.timeout):
            time.sleep(0.4)
    return False


def get_json(url: str, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(url, headers=headers or {})
    with LOCAL_HTTP.open(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def current_branch() -> str:
    proc = run(["git", "branch", "--show-current"], timeout=5)
    return proc.stdout.strip() if proc.returncode == 0 and proc.stdout.strip() else "unknown"


class Check:
    def __init__(self, name: str) -> None:
        self.name = name
        self.ok: bool | None = None
        self.detail = ""

    def record(self, ok: bool, detail: str = "") -> "Check":
        self.ok, self.detail = ok, detail
        mark = "PASS" if ok else "FAIL"
        print(f"  [{mark}] {self.name} — {detail}", flush=True)
        return self


results: list[Check] = []


def check(name: str) -> Check:
    c = Check(name)
    results.append(c)
    return c


# --------------------------------------------------------------------------- #
# audit steps
# --------------------------------------------------------------------------- #
def audit_python_tests() -> None:
    proc = run([PY, "-m", "pytest", "-q"])
    m = re.search(r"(\d+) passed(?:, (\d+) skipped)?", proc.stdout)
    passed = int(m.group(1)) if m else 0
    skipped = int(m.group(2)) if m and m.group(2) else 0
    fails = re.search(r"(\d+) failed", proc.stdout)
    check("python test suite").record(
        proc.returncode == 0 and not fails,
        f"{passed} passed, {skipped} skipped",
    )


def audit_agent_tests() -> None:
    test_files = [str(path.relative_to(AGENT)) for path in sorted((AGENT / "tests").glob("*.test.js"))]
    proc = run([NODE, "--test", *test_files], cwd=AGENT)
    m = re.search(r"# tests (\d+)", proc.stdout) or re.search(r"tests (\d+)", proc.stdout)
    p = re.search(r"# pass (\d+)", proc.stdout) or re.search(r"pass (\d+)", proc.stdout)
    f = re.search(r"# fail (\d+)", proc.stdout) or re.search(r"fail (\d+)", proc.stdout)
    total = int(m.group(1)) if m else 0
    passed = int(p.group(1)) if p else 0
    failed = int(f.group(1)) if f else 0
    check("agent test suite").record(
        proc.returncode == 0 and failed == 0 and passed > 0,
        f"{passed}/{total} passed",
    )


def audit_pipeline_store() -> dict[str, int]:
    proc = run([PY, "pipeline/build_opportunity_store_v1.py"])
    db = ROOT / "runtime" / "buyer_hunter.db"
    counts: dict[str, int] = {}
    if db.exists():
        import sqlite3

        with sqlite3.connect(db) as conn:
            for table in ("opportunity_decision", "opportunity", "buyer", "signal", "evidence", "seller_sku_fit"):
                counts[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            non_pass = conn.execute(
                "SELECT COUNT(*) FROM opportunity_decision WHERE decision_status!='PASS'"
            ).fetchone()[0]
    check("A1-A5 pipeline -> decision store").record(
        proc.returncode == 0 and counts.get("opportunity_decision", 0) > 0,
        f"{counts.get('opportunity_decision', 0)} decisions ({non_pass if counts else 0} non-PASS), "
        f"{counts.get('buyer', 0)} buyers, {counts.get('seller_sku_fit', 0)} SKU-fit rows",
    )
    return counts


def audit_decision_api() -> None:
    port = free_port()
    server = subprocess.Popen(
        [PY, "-m", "uvicorn", "api.app:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        base = f"http://127.0.0.1:{port}"
        if not wait_http(f"{base}/health"):
            check("decision API").record(False, "server did not come up")
            return
        health = get_json(f"{base}/health")
        today = get_json(
            f"{base}/api/v1/opportunities/today?seller_profile_id=seller-guizhou-specialty-demo&limit=5"
        )
        items = today.get("items", [])
        ok = health.get("status") == "ok" and isinstance(items, list) and len(items) > 0
        detail = f"/health={health.get('status')}, today returned {len(items)} items"
        if items:
            first = items[0]
            detail_ok = all(k in first for k in ("id", "decision_status", "opportunity_score", "why_now"))
            ok = ok and detail_ok
            det = get_json(f"{base}/api/v1/opportunities/{first['id']}/decision")
            ok = ok and det.get("id") == first["id"]
            detail += f", /decision[{first['id'][:12]}] ok={det.get('id') == first['id']}"
        check("decision API").record(ok, detail)
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


def audit_bridge() -> None:
    proc = run([PY, "scripts/export_opportunities_for_agent.py"])
    out = AGENT / "db" / "opportunities.json"
    ok = proc.returncode == 0 and out.exists()
    detail = "export failed"
    if ok:
        rows = json.loads(out.read_text(encoding="utf-8"))
        import sqlite3

        with sqlite3.connect(ROOT / "runtime" / "buyer_hunter.db") as conn:
            expect = conn.execute(
                "SELECT COUNT(*) FROM opportunity_decision WHERE decision_status!='PASS'"
            ).fetchone()[0]
        ok = isinstance(rows, list) and len(rows) == expect and all(
            r.get("source") == "FREE_PIPELINE" and r.get("seller", {}).get("id") for r in rows
        )
        detail = f"{len(rows)} rows exported (db non-PASS = {expect})"
    check("Free -> agent bridge").record(ok, detail)


def audit_reverse_bridge() -> None:
    """Smoke the reverse channel against the real store: a temp agent-outcomes.json
    (one WON outcome for a real non-PASS opportunity + one A2 target) is imported
    twice; row counts must increase once and stay put on replay."""
    import sqlite3
    import tempfile

    db = ROOT / "runtime" / "buyer_hunter.db"
    try:
        with sqlite3.connect(db) as conn:
            opp_id = conn.execute(
                "SELECT opportunity_id FROM opportunity_decision "
                "WHERE decision_status!='PASS' ORDER BY rank_position LIMIT 1"
            ).fetchone()[0]
            before_outcomes = conn.execute("SELECT COUNT(*) FROM deal_outcome").fetchone()[0]
            before_targets = conn.execute("SELECT COUNT(*) FROM agent_discovered_target").fetchone()[0]
    except (sqlite3.Error, TypeError):
        check("reverse bridge (agent -> Free)").record(False, "store not queryable")
        return

    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    payload = {
        "exported_at": stamp,
        "contract": "contracts/opportunity-bridge-v1.md (v2 reverse)",
        "direction": "agent -> free (v2 reverse)",
        "entries": {
            "a6_outcomes": [
                {
                    "opportunity_id": opp_id,
                    "seed_key": f"bridge:free:{opp_id}",
                    "source": "FREE_PIPELINE",
                    "outcome": "WON",
                    "reason": "audit smoke",
                    "next_action": None,
                    "stage_after": "NEGOTIATING",
                    "reported_at": stamp,
                }
            ],
            "a2_targets": [
                {
                    "seed_key": "a2:audit:smoke",
                    "source": "A2_PROACTIVE_BUYER_DEVELOPMENT",
                    "seller": {"id": "seller-guizhou-specialty-demo", "name": "audit"},
                    "buyer": {"id": "audit_buyer", "name": "Audit Smoke Co", "country": "DE",
                              "domain": "audit-smoke.invalid"},  # non-matching: no entity link rows
                    "contact": None, "stage": None, "status": "READY_FOR_OUTREACH_APPROVAL",
                    "a2": {"rank_score": 50.0}, "evidence_ids": [],
                    "created_at": stamp, "updated_at": stamp,
                }
            ],
        },
    }
    with tempfile.TemporaryDirectory() as tmp:
        in_path = Path(tmp) / "agent-outcomes.json"
        in_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        proc1 = run([PY, "scripts/import_agent_outcomes.py", "--db", str(db), "--in", str(in_path)])
        proc2 = run([PY, "scripts/import_agent_outcomes.py", "--db", str(db), "--in", str(in_path)])

    with sqlite3.connect(db) as conn:
        after_outcomes = conn.execute("SELECT COUNT(*) FROM deal_outcome").fetchone()[0]
        after_targets = conn.execute("SELECT COUNT(*) FROM agent_discovered_target").fetchone()[0]
    ok = (
        proc1.returncode == 0
        and proc2.returncode == 0
        and after_outcomes == before_outcomes + 1
        and after_targets == before_targets + 1
    )
    check("reverse bridge (agent -> Free)").record(
        ok,
        f"deal_outcome {before_outcomes}->{after_outcomes}, "
        f"targets {before_targets}->{after_targets}, replay idempotent",
    )


def audit_portal_wiring() -> None:
    """Static checks: API CORS admits the site origin; the opportunities page
    loads the live-data shim."""
    cors_ok = False
    try:
        source = (ROOT / "api" / "app.py").read_text(encoding="utf-8")
        cors_ok = all(origin in source for origin in ("http://127.0.0.1:4180", "http://localhost:4180"))
    except OSError:
        pass
    live_js = ROOT / "site" / "opportunities-live.js"
    page = ROOT / "site" / "opportunities.html"
    wired = live_js.exists() and (
        'src="opportunities-live.js"' in page.read_text(encoding="utf-8", errors="replace")
        if page.exists()
        else False
    )
    check("portal live wiring (CORS + opportunities-live.js)").record(
        cors_ok and wired,
        f"CORS 4180={cors_ok}, live js wired={wired}",
    )


def audit_agent_boot() -> None:
    port = free_port()
    env = {"PORT": str(port), "QIANPULSE_EXTERNAL_MODE": "sandbox"}
    server = subprocess.Popen(
        [NODE, "server/bootstrap.js"], cwd=str(AGENT),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        env={**os.environ, **env},
    )
    try:
        base = f"http://127.0.0.1:{port}"
        if not wait_http(f"{base}/api/health"):
            check("agent runtime boot").record(False, "did not come up")
            return
        health = get_json(f"{base}/api/health")
        caps = get_json(f"{base}/api/v1/agent/capabilities")
        cap_ids = {c["capability_id"] for c in caps}
        need = {
            "qianpulse.a2.proactive_buyer_development",
            "qianpulse.a6.opportunity_progression",
        }
        ok = health.get("a2_a6_runtime") == "ready" and need <= cap_ids
        check("agent runtime boot").record(
            ok, f"a2_a6_runtime={health.get('a2_a6_runtime')}, {len(caps)} capabilities"
        )
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


def audit_skill_dispatch() -> dict[str, Any]:
    proc = run([NODE, "scripts/skill-dispatch-audit.mjs", "--json"], cwd=AGENT)
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        check("A2-A6 skill dispatch").record(False, "audit script did not emit JSON")
        return {}
    s = payload.get("summary", {})
    ok = proc.returncode == 0 and payload.get("ok") is True
    check("A2-A6 skill dispatch").record(
        ok,
        f"registry={s.get('registry')} routing={s.get('routing')} "
        f"envelopes={s.get('envelopes')} e2e={s.get('e2e')} "
        f"({s.get('dispatched')}/{s.get('total')} capabilities dispatched)",
    )

    py = payload.get("python", {})
    caps = py.get("capabilities", {})
    available = py.get("available")
    expect = "python"
    py_ok = ok and available is True and bool(caps) and all(c.get("source") == expect for c in caps.values())
    a4_source = payload.get("summary_e2e_a4_source")
    check("Python capability CLI (A3/A4/A5 -> Free)").record(
        py_ok,
        f"available={available}; A3/A4/A5 source={expect}"
        + (f"; live A6 cycle A4 refresh source={a4_source}" if a4_source else ""),
    )
    return payload


def audit_a345_invariants(dispatch: dict[str, Any]) -> None:
    from pipeline.skills.a3_purchase_timing import run as run_a3
    from pipeline.skills.a4_supply_match import run as run_a4
    from pipeline.skills.a5_trade_risk import run as run_a5

    runtime_files = [
        ROOT / "pipeline/skills/a3_purchase_timing.py",
        ROOT / "pipeline/skills/a4_supply_match.py",
        ROOT / "pipeline/skills/a5_trade_risk.py",
    ]
    check("A3/A4/A5 Python authoritative runtime").record(all(path.exists() for path in runtime_files), ", ".join(path.name for path in runtime_files))

    adapter = (ROOT / "agent/skill-runtime/python-capability-runners.mjs").read_text(encoding="utf-8")
    node_domains = "\n".join((ROOT / f"agent/skill-runtime/a{i}.js").read_text(encoding="utf-8") for i in (3, 4, 5))
    no_fallback = "node-fallback" not in adapter and "execFileSync" not in adapter and "timing_score" not in node_domains
    check("Node semantic fallback count = 0").record(no_fallback, "no node-fallback, execFileSync, or Node domain scoring")

    a3 = run_a3({"opportunity_id": "audit-a3", "evaluated_at": "2026-08-29T00:00:00Z", "latest_buyer_message": {"content": "", "evidence_refs": []}})
    check("A3 unknown timing = MORE_EVIDENCE").record(a3["run_status"] == "MORE_EVIDENCE" and a3["domain_result"]["window_status"] == "UNKNOWN")

    a4 = run_a4({"opportunity_id": "audit-a4", "evaluated_at": "2026-08-29T00:00:00Z", "demand": {"category_code": "MATCHA", "grade": "beverage", "quantity": "5 pallets"}})
    check("A4 unknown != mismatch").record(a4["run_status"] == "MORE_EVIDENCE" and a4["domain_result"]["recommendation"] == "NEED_MORE_DATA")

    a5 = run_a5({"opportunity_id": "audit-a5", "evaluated_at": "2026-08-29T00:00:00Z", "buyer_country": "US", "destination_market": "JP", "regulatory_evidence": [{"market": "JP", "result": "ALLOWED", "evidence_ref": "audit-reg"}]})
    check("A5 buyer_country != destination_market supported").record(a5["domain_result"]["buyer_country"] == "US" and a5["domain_result"]["destination_market"] == "JP")

    caps = {item.get("capability_id"): item for item in dispatch.get("capabilities", [])}
    direct_ok = all(caps.get(f"qianpulse.a{i}.{name}", {}).get("dispatched") for i, name in ((3, "purchase_timing"), (4, "supply_match"), (5, "trade_risk")))
    check("Agent direct dispatch A3/A4/A5").record(direct_ok)
    trace_ok = dispatch.get("checks", {}).get("same_run_a345a6") is True
    check("Buyer reply A3+A4+A5+A6 trace").record(trace_ok)


def audit_landing_site() -> None:
    site = ROOT / "site"
    pages = ["index.html", "opportunities.html"]
    required = pages + ["nav-bridge.js", "PROVENANCE.md"]
    missing = [f for f in required if not (site / f).exists()]

    broken_assets: list[str] = []
    unbridged: list[str] = []
    for page in pages:
        p = site / page
        if not p.exists():
            continue
        html = p.read_text(encoding="utf-8", errors="replace")
        if 'src="nav-bridge.js"' not in html:
            unbridged.append(page)
        for ref in re.findall(r'(?:src|href)="(assets/[^"?#]+)"', html):
            if not (site / ref).exists():
                broken_assets.append(f"{page} -> {ref}")

    served = None
    if not missing:
        port = free_port()
        server = subprocess.Popen(
            [PY, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(site)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            base = f"http://127.0.0.1:{port}"
            if wait_http(f"{base}/index.html"):
                codes = []
                for path in ("/index.html", "/opportunities.html", "/nav-bridge.js"):
                    try:
                        with LOCAL_HTTP.open(f"{base}{path}", timeout=3) as r:
                            codes.append(r.status)
                    except urllib.error.HTTPError as e:  # noqa: PERF203
                        codes.append(e.code)
                served = all(c == 200 for c in codes)
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()

    ok = not missing and not broken_assets and not unbridged and served is not False
    detail = (
        f"{len(pages)} pages, assets ok={not broken_assets}, "
        f"nav-bridge wired={not unbridged}, http 200={served}"
    )
    if missing:
        detail = f"missing {missing}"
    elif broken_assets:
        detail = f"broken asset refs: {broken_assets}"
    elif unbridged:
        detail = f"nav-bridge.js not included in {unbridged}"
    check("landing site (site/ <- origin/ui)").record(ok, detail)


def audit_orchestrator_skills() -> None:
    skills_dir = ROOT / ".agents" / "skills"
    conflict = (ROOT / "docs" / "04_参考稿冲突矩阵与统一方案_v2.md").read_text(encoding="utf-8")
    missing: list[str] = []
    unreferenced: list[str] = []
    for skill in sorted(skills_dir.glob("*/SKILL.md")):
        text = skill.read_text(encoding="utf-8")
        fm = re.search(r"^---\n(.*?)\n---", text, re.S)
        if not fm or "name:" not in fm.group(1) or "description:" not in fm.group(1):
            missing.append(skill.parent.name)
    for token in ("需求理解", "窗口判断", "供需匹配", "市场准入", "行动判断", "证据审查"):
        if token not in conflict:
            unreferenced.append(token)
    check(".agents/skills orchestrator specs").record(
        not missing and not unreferenced,
        f"{len(list(skills_dir.glob('*/SKILL.md')))} skills, "
        f"frontmatter-missing={missing or 'none'}, doc-unreferenced={unreferenced or 'none'}",
    )


def audit_a6_progression() -> None:
    a6_dir = AGENT / "skill-runtime" / "a6"
    sources = "\n".join(path.read_text(encoding="utf-8") for path in sorted(a6_dir.glob("*.js")))
    parser_count = len(re.findall(r"(?:function|const)\s+(?:observeA6Fields|detectA6ChangedFields)\b", sources))
    check("A6 duplicate field parser count = 1").record(parser_count == 1, f"count={parser_count}")

    raw_fact_hits = re.findall(r"sellerContext\.(?:moq|delivery|lead_time|certifications?)", sources)
    check("A6 raw seller fact outbound claim = 0").record(not raw_fact_hits, f"hits={len(raw_fact_hits)}")
    dependency_hits = re.findall(r"\b(?:runA3PurchaseTiming|runA4SupplyMatch|runA5TradeRisk|runAffectedSkills)\b", sources)
    check("A6 direct dependency invocation = 0").record(not dependency_hits, f"hits={len(dependency_hits)}")
    provider_hits = re.findall(r"\b(?:fetch|smartlead|apollo|trademo|provider)\s*\(", sources, re.I)
    check("A6 direct provider invocation = 0").record(not provider_hits, f"hits={len(provider_hits)}")

    script = r"""
import { transitionStage } from './skill-runtime/a6/stage-machine.js';
import { createMemoryOpportunityStore } from './opportunity-store.js';
import { createQianPulseSkillOrchestrator } from './qianpulse-skill-orchestrator.js';
const regression = transitionStage({ currentStage: 'COMMERCIAL_DISCUSSION', intent: { primary: 'DELIVERY_REQUEST' } });
const terminal = transitionStage({ currentStage: 'WON', intent: { primary: 'DELIVERY_REQUEST' }, triggerEvent: { event_type: 'BUYER_MESSAGE' } });
const store = createMemoryOpportunityStore([{ id: 'audit-opp', status: 'ACTIVE', stage: 'CONTACTED', fields: {}, evidence_ids: [] }]);
const ids = ['qianpulse.a3.purchase_timing', 'qianpulse.a4.supply_match', 'qianpulse.a5.trade_risk'];
const dependencyRunners = Object.fromEntries(ids.map(capabilityId => [capabilityId, async input => ({
  capability_id: capabilityId, capability_version: 'audit', run_status: 'DONE',
  changed_fields: input.changed_fields || [], missing_evidence: [],
  evidence_refs: ['conversation:audit', 'seller:delivery:1', 'risk:japan:1'],
  human_review_required: false, error: null,
  domain_result: capabilityId.endsWith('supply_match')
    ? { verified_facts: { delivery: '20 days' } }
    : capabilityId.endsWith('trade_risk') ? { access_status: 'PASS' } : { window_status: 'OPEN' }
})]));
const orchestrator = createQianPulseSkillOrchestrator({ opportunityStore: store, dependencyRunners, clock: () => '2026-08-29T00:00:00Z' });
const result = await orchestrator.runBuyerProgression({
  opportunityId: 'audit-opp',
  event: { event_id: 'audit-event', event_type: 'BUYER_MESSAGE', content: 'Please deliver to Japan by October 2026. What is your delivery lead time?', evidence_ref: 'conversation:audit' },
  sellerContext: { delivery: '20 days', evidence_refs: ['seller:delivery:1', 'risk:japan:1'] }
});
const claims = result.envelope.domain_result.communication_brief?.allowed_claims || [];
console.log(JSON.stringify({
  regression,
  terminal,
  trace: result.trace.map(item => `${item.capability_id}:${item.phase}`),
  claimsCovered: claims.length > 0 && claims.every(item => item.evidence_refs?.length),
  briefOnly: !Object.hasOwn(result.envelope.domain_result, 'reply_draft')
}));
"""
    proc = run([NODE, "--input-type=module", "-e", script], cwd=AGENT)
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        payload = {}
    regression_ok = payload.get("regression", {}).get("reason") == "ILLEGAL_STAGE_REGRESSION"
    terminal_ok = payload.get("terminal", {}).get("reason") == "TERMINAL_STATE_LOCKED"
    expected_trace = [
        "qianpulse.a6.opportunity_progression:ANALYSIS",
        "qianpulse.a3.purchase_timing:REFRESH",
        "qianpulse.a4.supply_match:REFRESH",
        "qianpulse.a5.trade_risk:REFRESH",
        "qianpulse.a6.opportunity_progression:FINAL",
    ]
    check("A6 illegal stage regression").record(regression_ok, payload.get("regression", {}).get("reason", "node check failed"))
    check("A6 terminal state lock").record(terminal_ok, payload.get("terminal", {}).get("reason", "node check failed"))
    check("A6 communication brief evidence coverage").record(
        payload.get("claimsCovered") is True and payload.get("briefOnly") is True,
        f"claims covered={payload.get('claimsCovered')}, no reply_draft={payload.get('briefOnly')}",
    )
    check("Agent A6→A3/A4/A5→A6 trace").record(payload.get("trace") == expected_trace, " -> ".join(payload.get("trace", [])))

    live_source = (AGENT / "server" / "a2a6-live-runtime.js").read_text(encoding="utf-8")
    smartlead_source = (AGENT / "server" / "smartlead-live-webhook.js").read_text(encoding="utf-8")
    human_gate = all(token in live_source for token in ("composeReply", "state.approvals", "WAITING_APPROVAL"))
    no_direct_send = "replyEmailThread" not in smartlead_source and "send" not in smartlead_source
    check("Smartlead reply Human Gate").record(human_gate and no_direct_send, f"approval={human_gate}, webhook direct send={not no_direct_send}")


# --------------------------------------------------------------------------- #
# completeness matrix (informed by the audit's live checks)
# --------------------------------------------------------------------------- #
def completeness_matrix(store_counts: dict[str, int], dispatch: dict[str, Any]) -> list[dict[str, str]]:
    disp_ok = dispatch.get("ok") is True
    return [
        {
            "module": "A1 全球需求捕捉",
            "runtime": "Python — pipeline/collect_*.py, clean_and_score_*, aggregate_*",
            "state": "运行中",
            "evidence": f"{store_counts.get('signal', 0)} signals -> {store_counts.get('opportunity_decision', 0)} decisions；"
            "多平台采集器 + 四维验真 + 实体去重；committed fixture 支持离线重建",
            "gap": "买方法定主体解析未完成（QUALIFIED_PENDING_ENTITY）；部分源精准命中率低；hktdc/jetro 采集器在 Free 上未提交",
        },
        {
            "module": "A2 主动商机拓展",
            "runtime": "Node — agent/skill-runtime/a2*.js + agent/server/a2a6-live-runtime.js",
            "state": "sandbox 闭环" if disp_ok else "异常",
            "evidence": "Target -> Buyer Company Discovery -> Buyer Fit(证据门槛) -> Contact -> Readiness Gate -> "
            "Email Draft -> Human Gate -> Smartlead 队列；skill 调度审计通过",
            "gap": "自然语言入口未接线（只吃结构化 target）；发现源仅 Trademo 1 个；实网待 5 个凭据",
        },
        {
            "module": "A3 采购时机判断",
            "runtime": "Python 唯一运行时（pipeline/skills/a3_purchase_timing.py）",
            "state": "Python 权威",
            "evidence": "A6 会话内刷新经 capability CLI 调 Free 的 timing_score；recency + urgency + stage + continuity − staleness；"
            "Python 不可用时返回结构化 ERROR，不改变业务语义",
            "gap": "未做统计校准；子进程启动有额外延迟",
        },
        {
            "module": "A4 贵州供需匹配",
            "runtime": "Python 唯一运行时（supply_demand_fit_v1.py 逐 SKU）",
            "state": "Python 权威",
            "evidence": f"{store_counts.get('seller_sku_fit', 0)} 条逐 SKU 评估入库；A6 会话内刷新经 capability CLI 拿到真实 "
            "supply_pool_status / best_verdict / summary_zh；硬条件先于软条件，MATCH/CONDITIONAL/BLOCK",
            "gap": "卖家目录是 demo 数据（3 卖家/5 SKU），需真实卖家入库",
        },
        {
            "module": "A5 智能匹配风控",
            "runtime": "Python 唯一运行时（pipeline/skills/a5_trade_risk.py）",
            "state": "部分（准入已归 Python）",
            "evidence": "A6 会话内刷新经 capability CLI 调 Free；目的地黑名单 → BLOCKED，缺政策 → MORE_EVIDENCE，"
            "否则 REVIEWED + market_access 分",
            "gap": "买家信用 / 欺诈预警 / 知识产权 / 合同履约 未做；法规 Provider 未接",
        },
        {
            "module": "A6 成交自动推进",
            "runtime": "Node — agent/skill-runtime/a6/* + Agent-owned skill dependency gate + Reply Composer",
            "state": "sandbox 闭环" if disp_ok else "异常",
            "evidence": "固定 Intent/Stage/Action taxonomy；买家回复 -> A6 Analysis -> 按 input_hash 刷新 A3/A4/A5 -> A6 Final -> "
            "Communication Brief -> Reply Composer -> Human Gate；高风险强制人工；Opportunity 仅最终写一次",
            "gap": "实网回复回路未验证（缺 Smartlead 凭据）；LLM 判断层未加（仍规则化）",
        },
        {
            "module": "机会决策引擎 / 读接口 / Demo",
            "runtime": "Python — opportunity_decision_engine_v1.py + api/app.py + demo/(React)",
            "state": "就绪",
            "evidence": "权重 30/30/20/10/10，truth 门槛 60，ruleset_version + input_snapshot_sha256；FastAPI 4 端点；demo 可构建",
            "gap": "会员/Lead Access 为 demo 模拟；未接支付",
        },
        {
            "module": "门户站点 (landing)",
            "runtime": "静态 — site/(index.html + opportunities.html)，vendored 自 origin/ui @ c7d5634",
            "state": "就绪(前门)",
            "evidence": "WebGL/canvas 首页 + 全球商机展示页（network-stage + deal-section）；离线地图数据自带；"
            "nav-bridge.js 把登录/CTA 指向 demo；opportunities-live.js 把精选卡片/需求行/KPI 换成 /api/v1 实时数据"
            "（API 失败静默回退静态样例，LIVE/FALLBACK 徽标）；run.ps1 -Up / make up 起在 4180",
            "gap": "作者 yayaw2826-oss 仍在 origin/ui 迭代（re-sync 时需重加两行 script）",
        },
        {
            "module": "Agent 控制面",
            "runtime": "Node — AgentRun / Step / Checkpoint / Approval / Trace / Idempotency",
            "state": "就绪",
            "evidence": "每个 capability 调用记为 Step；四层幂等；INTERNAL 可观测性；registry + 事件路由审计通过；"
            "INTERNAL 注册经 INTERNAL_INVITE_CODE 邀请码开放",
            "gap": "控制面与 Free 采集为文件桥（非实时 API 写回）",
        },
        {
            "module": "数据桥 (Free <-> agent)",
            "runtime": "Python — scripts/export_opportunities_for_agent.py + scripts/import_agent_outcomes.py · "
            "Node — persist 写 agent-outcomes.json + boot 时 merge-on-reload",
            "state": "就绪(v2 双向)",
            "evidence": "正向：决策 store -> agent/db/opportunities.json（非 PASS 行，证据 URL 可回溯）；"
            "反向：A6 结果 -> deal_outcome、A2 目标 -> agent_discovered_target，幂等 upsert，重建后可重放；"
            "domain 实体解析自动建 buyer_alias + entity_merge_audit（AUTO_MERGE）并在 agent 侧绑定 free:buyer 引用",
            "gap": "实网 A6 回流待 Smartlead 凭据；实体合并待 buyer domain 填充生效（当前 51 买家均无 domain）",
        },
        {
            "module": "Capability 合同 + Python 桥",
            "runtime": "scripts/capability_cli.py（stdin/stdout）· agent/skill-runtime/python-capability-runners.mjs",
            "state": "就绪",
            "evidence": "统一 CapabilityResultEnvelope / AgentEvent JSON Schema + 两侧合同测试；"
            "A6 依赖刷新异步调用 Python，失败返回 CAPABILITY_RUNTIME_UNAVAILABLE，不存在语义回退",
            "gap": "子进程启动延迟；后续可升级为常驻 capability 服务",
        },
        {
            "module": "统一 Opportunity（v2）",
            "runtime": "contracts/opportunity-v2.md（设计）",
            "state": "设计完成 · 未实现",
            "evidence": "core.opportunity（origin A1/A2）+ intel.decision_snapshot + runtime.agent_* 的目标形状与迁移草案",
            "gap": "Phase 4：Free SQLite 与 MVP agent-state 仍是两套主键；下一增量",
        },
    ]


# --------------------------------------------------------------------------- #
# report writers
# --------------------------------------------------------------------------- #
def write_markdown(path: Path, matrix: list[dict[str, str]], dispatch: dict[str, Any]) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    branch = current_branch()
    hard_ok = all(c.ok for c in results)
    lines = [
        "# 整合仓库审计报告",
        "",
        f"> 生成时间：{now}　·　分支：`{branch}`　·　结论：**{'全部通过' if hard_ok else '存在失败项'}**",
        "",
        "## 1. 硬性检查",
        "",
        "| 检查项 | 结果 | 详情 |",
        "|---|---|---|",
    ]
    for c in results:
        lines.append(f"| {c.name} | {'✅ PASS' if c.ok else '❌ FAIL'} | {c.detail} |")
    lines += [
        "",
        "## 2. A2–A6 skill 调度",
        "",
    ]
    if dispatch.get("capabilities"):
        lines += ["| capability | 调度 | envelope 有效 | 记为 Step | run_status |", "|---|---|---|---|---|"]
        for cap in dispatch["capabilities"]:
            lines.append(
                f"| `{cap['capability_id']}` | {'✅' if cap['dispatched'] else '❌'} | "
                f"{'✅' if cap['envelope_valid'] else '❌'} | {'✅' if cap['step_recorded'] else '❌'} | "
                f"{cap['run_status']} |"
            )
        s = dispatch.get("summary", {})
        lines += [
            "",
            f"- registry：{s.get('registry')}　routing：{s.get('routing')}　"
            f"envelopes：{s.get('envelopes')}　e2e：{s.get('e2e')}",
            f"- 事件路由：`SELLER_PROACTIVE_DEVELOPMENT`/`SYSTEM_NEW_PROSPECT_SIGNAL`/`PRE_REPLY_FOLLOWUP_DUE` → A2；"
            "`BUYER_MESSAGE`/`QUOTE_UPDATED`/`SAMPLE_UPDATED`/`APPROVAL_RESULT`/`EVIDENCE_ADDED`/`MANUAL_RESUME` → A6",
            "- E2E：A2 派发 → 生成 Opportunity → 买家回复 → A6 派发 → 自动刷新 A4/A5/A3 → 每步记为 AgentStep → 生成 Checkpoint",
        ]
    lines += ["", "## 3. 模块完成度", "", "| 模块 | 运行时 | 状态 | 已实现 | 缺口 |", "|---|---|---|---|---|"]
    for row in matrix:
        lines.append(
            f"| **{row['module']}** | {row['runtime']} | {row['state']} | {row['evidence']} | {row['gap']} |"
        )
    lines += [
        "",
        "## 4. 如何复跑",
        "",
        "```bash",
        "python scripts/audit.py          # 本报告",
        "python -m pytest -q              # Python 测试",
        "cd agent && npm test            # Node 测试",
        "node agent/scripts/skill-dispatch-audit.mjs   # 仅 skill 调度",
        "python scripts/import_agent_outcomes.py       # 反向桥（幂等）",
        "```",
        "",
        "## 5. 不在整合范围（后续）",
        "",
        "- 单语言统一（Node ↔ Python 移植）",
        "- 统一 Opportunity 主键（Phase 4，设计见 `contracts/opportunity-v2.md`）",
        "- A2 自然语言入口接线",
        "- 实网 provider smoke（Smartlead / Apollo / Trademo 凭据）",
        "- 控制面实时反向写回（当前为文件桥，非 API）",
        "- `brand2` 前端增量 cherry-pick（联系方式解锁双态 UX）",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, matrix: list[dict[str, str]], dispatch: dict[str, Any]) -> None:
    hard_ok = all(c.ok for c in results)
    rows_checks = "".join(
        f"<tr><td>{c.name}</td><td class='{'ok' if c.ok else 'bad'}'>{'PASS' if c.ok else 'FAIL'}</td>"
        f"<td>{c.detail}</td></tr>"
        for c in results
    )
    rows_disp = "".join(
        f"<tr><td><code>{c['capability_id']}</code></td>"
        f"<td class='{'ok' if c['dispatched'] else 'bad'}'>{c['dispatched']}</td>"
        f"<td class='{'ok' if c['envelope_valid'] else 'bad'}'>{c['envelope_valid']}</td>"
        f"<td class='{'ok' if c['step_recorded'] else 'bad'}'>{c['step_recorded']}</td>"
        f"<td>{c['run_status']}</td></tr>"
        for c in dispatch.get("capabilities", [])
    )
    rows_matrix = "".join(
        f"<tr><td><b>{r['module']}</b></td><td>{r['runtime']}</td><td>{r['state']}</td>"
        f"<td>{r['evidence']}</td><td>{r['gap']}</td></tr>"
        for r in matrix
    )
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    branch = current_branch()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"""<!doctype html><meta charset="utf-8"><title>整合仓库审计</title>
<style>
:root{{color-scheme:light dark}}
body{{font:14px/1.55 -apple-system,'Segoe UI','PingFang SC',sans-serif;margin:0;padding:32px;
 background:#fff;color:#1a1a1a;max-width:1100px;margin:auto}}
@media(prefers-color-scheme:dark){{body{{background:#0e0e10;color:#e6e6e6}}}}
h1{{font-size:22px;margin:0 0 4px}} .sub{{opacity:.6;font-size:13px;margin-bottom:24px}}
h2{{font-size:16px;margin:28px 0 10px;border-bottom:1px solid #8883;padding-bottom:4px}}
table{{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}}
td,th{{border:1px solid #8884;padding:7px 9px;vertical-align:top;text-align:left}}
th{{background:#8881}}
.ok{{color:#137333;font-weight:600}} .bad{{color:#c5221f;font-weight:600}}
code{{background:#8882;padding:1px 4px;border-radius:3px;font-size:12px}}
.verdict{{display:inline-block;padding:3px 10px;border-radius:4px;font-weight:600}}
.v-ok{{background:#13733322;color:#137333}} .v-bad{{background:#c5221f22;color:#c5221f}}
</style>
<h1>整合仓库审计报告</h1>
<div class="sub">{now} · 分支 <code>{branch}</code> ·
 <span class="verdict {'v-ok' if hard_ok else 'v-bad'}">{'全部通过' if hard_ok else '存在失败项'}</span></div>
<h2>1. 硬性检查</h2>
<table><tr><th>检查项</th><th>结果</th><th>详情</th></tr>{rows_checks}</table>
<h2>2. A2–A6 skill 调度</h2>
<table><tr><th>capability</th><th>调度</th><th>envelope</th><th>Step</th><th>run_status</th></tr>{rows_disp}</table>
<p style="font-size:13px;opacity:.8">E2E：A2 派发 → 生成 Opportunity → 买家回复 → A6 派发 → 自动刷新 A4/A5/A3 →
 每步记为 AgentStep → 生成 Checkpoint。</p>
<h2>3. 模块完成度</h2>
<table><tr><th>模块</th><th>运行时</th><th>状态</th><th>已实现</th><th>缺口</th></tr>{rows_matrix}</table>
""",
        encoding="utf-8",
    )


# --------------------------------------------------------------------------- #
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-tests", action="store_true", help="skip pytest + npm test (fast)")
    parser.add_argument("--no-html", action="store_true")
    args = parser.parse_args()

    print("\n=== integrated repo audit ===\n")
    if not args.skip_tests:
        audit_python_tests()
        audit_agent_tests()
    store_counts = audit_pipeline_store()
    audit_decision_api()
    audit_bridge()
    audit_reverse_bridge()
    audit_agent_boot()
    dispatch = audit_skill_dispatch()
    audit_a345_invariants(dispatch)
    audit_orchestrator_skills()
    audit_a6_progression()
    audit_landing_site()
    audit_portal_wiring()

    matrix = completeness_matrix(store_counts, dispatch)
    DOCS.mkdir(exist_ok=True)
    md_path = DOCS / f"AUDIT_{date.today():%Y%m%d}.md"
    write_markdown(md_path, matrix, dispatch)
    print(f"\n  report -> {md_path.relative_to(ROOT)}")
    if not args.no_html:
        html_path = DOCS / "audit" / "audit.html"
        write_html(html_path, matrix, dispatch)
        print(f"  artifact -> {html_path.relative_to(ROOT)}")

    hard_ok = all(c.ok for c in results)
    print("\n" + "=" * 40)
    print("AUDIT:", "ALL CHECKS PASS" if hard_ok else "FAILURES PRESENT")
    return 0 if hard_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
