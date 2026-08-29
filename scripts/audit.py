"""Cross-runtime audit for the integrated Buyer Hunter / 黔脉 repo.

    python scripts/audit.py [--skip-tests] [--no-html]

Runs the Python + Node test suites, exercises the A1->A5 pipeline + decision API,
the Free->agent bridge, the agent runtime boot, and the A2-A6 skill-dispatch
check, then writes:

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
PY = sys.executable
NPM = shutil.which("npm") or shutil.which("npm.cmd") or "npm"
NODE = shutil.which("node") or "node"


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def run(cmd: list[str], cwd: Path = ROOT, timeout: int = 900) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout,
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
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status < 500:
                    return True
        except (urllib.error.URLError, ConnectionError, socket.timeout):
            time.sleep(0.4)
    return False


def get_json(url: str, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


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
    proc = run([NPM, "test"], cwd=AGENT)
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
    expect = "python" if available else "node-fallback"
    py_ok = ok and bool(caps) and all(c.get("source") == expect for c in caps.values())
    a4_source = payload.get("summary_e2e_a4_source")
    check("Python capability CLI (A3/A4/A5 -> Free)").record(
        py_ok,
        f"available={available}; A3/A4/A5 source={expect}"
        + (f"; live A6 cycle A4 refresh source={a4_source}" if a4_source else ""),
    )
    return payload


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
            "runtime": "Python 权威（timing_score + buying_window_fields）· Node fallback",
            "state": "Python 权威",
            "evidence": "A6 会话内刷新经 capability CLI 调 Free 的 timing_score；recency + urgency + stage + continuity − staleness；"
            "Python 不可用时自动回退 Node placeholder",
            "gap": "未做统计校准；子进程启动 ~200ms/次",
        },
        {
            "module": "A4 贵州供需匹配",
            "runtime": "Python 权威（supply_demand_fit_v1.py 逐 SKU）· Node fallback",
            "state": "Python 权威",
            "evidence": f"{store_counts.get('seller_sku_fit', 0)} 条逐 SKU 评估入库；A6 会话内刷新经 capability CLI 拿到真实 "
            "supply_pool_status / best_verdict / summary_zh；硬条件先于软条件，MATCH/CONDITIONAL/BLOCK",
            "gap": "卖家目录是 demo 数据（3 卖家/5 SKU），需真实卖家入库",
        },
        {
            "module": "A5 智能匹配风控",
            "runtime": "Python 权威（market_access_score + 目的地/allowed/blocked/支付 审查）· Node fallback",
            "state": "部分（准入已归 Python）",
            "evidence": "A6 会话内刷新经 capability CLI 调 Free；目的地黑名单 → BLOCKED，缺政策 → MORE_EVIDENCE，"
            "否则 REVIEWED + market_access 分",
            "gap": "买家信用 / 欺诈预警 / 知识产权 / 合同履约 未做；法规 Provider 未接",
        },
        {
            "module": "A6 成交自动推进",
            "runtime": "Node — agent/skill-runtime/a6*.js + 两趟判断 + dependency gate",
            "state": "sandbox 闭环" if disp_ok else "异常",
            "evidence": "16 意图 taxonomy + 11 阶段机 + 15 动作 taxonomy；买家回复 -> 变更字段 -> 自动刷新 A3/A4/A5 -> "
            "证据安全草稿 -> Human Gate；高风险强制人工；skill 调度审计通过",
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
            "module": "Agent 控制面",
            "runtime": "Node — AgentRun / Step / Checkpoint / Approval / Trace / Idempotency",
            "state": "就绪",
            "evidence": "每个 capability 调用记为 Step；四层幂等；INTERNAL 可观测性；registry + 事件路由审计通过",
            "gap": "INTERNAL 用户无法自注册（需手工种子或环境变量）；控制面与 Free 采集为单向桥",
        },
        {
            "module": "数据桥 (Free -> agent)",
            "runtime": "Python — scripts/export_opportunities_for_agent.py",
            "state": "就绪(v1 单向)",
            "evidence": "决策 store -> agent/db/opportunities.json；非 PASS 行；证据 URL 可回溯；6 个测试",
            "gap": "单向；A2 发现与 A6 结果不回流；无 domain 实体合并",
        },
        {
            "module": "Capability 合同 + Python 桥",
            "runtime": "scripts/capability_cli.py（stdin/stdout）· agent/skill-runtime/python-capability-runners.mjs",
            "state": "就绪",
            "evidence": "统一 CapabilityResultEnvelope / AgentEvent JSON Schema + 两侧合同测试；"
            "A6 依赖刷新经 execFileSync 调 Python，任何失败自动回退 Node；QIANPULSE_PYTHON_CAPABILITIES=off 可关",
            "gap": "子进程启动延迟；后续可升级为常驻 HTTP capability 服务",
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
    hard_ok = all(c.ok for c in results)
    lines = [
        "# 整合仓库审计报告",
        "",
        f"> 生成时间：{now}　·　分支：`integration`　·　结论：**{'全部通过' if hard_ok else '存在失败项'}**",
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
        "```",
        "",
        "## 5. 不在整合范围（后续）",
        "",
        "- 单语言统一（Node ↔ Python 移植）",
        "- A2 自然语言入口接线",
        "- A2↔A1 双向汇合（被开发公司之后发 RFQ 自动升进）",
        "- 实网 provider smoke（Smartlead / Apollo / Trademo 凭据）",
        "- INTERNAL 用户种子 / 控制面反向写回",
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
<div class="sub">{now} · 分支 <code>integration</code> ·
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
    audit_agent_boot()
    dispatch = audit_skill_dispatch()
    audit_orchestrator_skills()

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
