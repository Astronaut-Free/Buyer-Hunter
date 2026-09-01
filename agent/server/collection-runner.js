import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/*
 * collection-runner.js — real-time collection service (A1, on demand).
 *
 * The Python collection pipeline (pipeline/run_pipeline.py) is a batch CLI.
 * This factory turns it into an async, panel-triggerable job service inside the
 * agent runtime:
 *
 *   POST /api/v1/collection-runs        trigger { sources: [...] }
 *   GET  /api/v1/collection-runs        { config, runs } (newest first, cap 20)
 *   GET  /api/v1/collection-runs/:id    one job
 *
 * Job lifecycle (persisted in state.collection_runs):
 *   RUNNING -> SUCCEEDED (pipeline exit 0 + export + import + reloadFree)
 *           -> FAILED    (non-zero exit / bridge failure / timeout)
 *           -> INTERRUPTED (server restart, marked at boot)
 *
 * The pipeline child is spawned directly (no shell). Its stdout carries
 * step-level progress lines emitted by run_pipeline.py:
 *   [START] <step>                      (step now running)
 *   [     OK] <step> (<dur>s) <detail>  (step finished)
 *   [SKIPPED] <step> (missing env X)    (no duration — env-gated step)
 *   {"run_id": "...", "status": "..."}  (final line)
 * Steps the pipeline never prints (SKIPPED because a required step failed
 * earlier) are backfilled from runtime/pipeline_last_run.json after exit.
 */

const SOURCE_ORDER = ['b2b', 'alibaba', 'ted', 'ec21', 'sam', 'ungm', 'samples'];

const SOURCE_MAP = {
  b2b:      { label: '公开 B2B 平台',   steps: ['collect_b2b_public', 'clean_and_score_b2b'], dir: 'data_b2b_public_v3' },
  alibaba:  { label: '阿里巴巴 RFQ',     steps: ['collect_alibaba_rfq'],                     dir: 'data_alibaba_public' },
  ted:      { label: 'TED 欧盟招标',     steps: ['collect_ted'],                              dir: 'data_ted' },
  ec21:     { label: 'EC21 多国',        steps: ['collect_ec21_regions'],                     dir: 'data_ec21_regions' },
  sam:      { label: 'SAM 美国政府采购', steps: ['collect_sam_precise'],                     dir: 'data_sam_precise' },
  ungm:     { label: 'UNGM 联合国',      steps: ['collect_ungm'],                             dir: 'data_ungm' },
  samples:  { label: '样例源',           steps: ['collect_samples'],                          dir: 'data_v2' },
};

// aggregate_full_collection_v1.py hard-fails without the newest run of each of
// these four sources, so the first collection on a machine must include them.
const REQUIRED_SOURCES = ['b2b', 'alibaba', 'ted', 'samples'];
const POST_STEPS = [
  { key: 'export', name: 'export_opportunities_for_agent', label: '导出机会到 Agent' },
  { key: 'import', name: 'import_agent_outcomes', label: '回流结果到决策库' },
];

const MAX_LEDGER = 20;
const BRIDGE_TIMEOUT_MS = 120000;

const STEP_DONE_RE = /^\[\s*(OK|FAILED|SKIPPED)\s*\]\s+(\S+)\s+\(([\d.]+)s\)\s?(.*)$/;
const STEP_SKIP_ENV_RE = /^\[\s*SKIPPED\s*\]\s+(\S+)\s+\((.*)\)$/;

function tail(text, maxChars = 2000) {
  if (!text) return '';
  const cleaned = String(text).replace(/\r/g, '');
  return cleaned.length > maxChars ? cleaned.slice(-maxChars) : cleaned;
}

export function createCollectionRunner({
  getState,
  onMutate,
  now,
  id,
  repoRoot,
  pythonBin = process.env.PYTHON_BIN || process.env.PY || 'python',
  pipelineScript = process.env.COLLECTION_PIPELINE_SCRIPT || 'pipeline/run_pipeline.py',
  exportScript = process.env.COLLECTION_EXPORT_SCRIPT || 'scripts/export_opportunities_for_agent.py',
  importScript = process.env.COLLECTION_IMPORT_SCRIPT || 'scripts/import_agent_outcomes.py',
  reloadFree,
  timeoutMs = Number(process.env.COLLECTION_RUN_TIMEOUT_MS || 7200000),
  samAvailable = Boolean(process.env.SAM_API_KEY),
  spawnFn = spawn,
} = {}) {
  const state = () => getState();
  const stateRuns = () => {
    state().collection_runs ||= {};
    return state().collection_runs;
  };

  function hasPriorRun(sourceKey) {
    const dir = join(repoRoot, 'pipeline', SOURCE_MAP[sourceKey].dir);
    try {
      if (!existsSync(dir)) return false;
      return readdirSync(dir).length > 0;
    } catch {
      return false;
    }
  }

  function pruneLedger() {
    const runs = stateRuns();
    const entries = Object.values(runs).sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));
    while (entries.length > MAX_LEDGER) {
      delete runs[entries.shift().collection_id];
    }
  }

  function buildConfig() {
    return {
      sources: SOURCE_ORDER.map(key => ({
        key,
        label: SOURCE_MAP[key].label,
        steps: SOURCE_MAP[key].steps,
        has_prior_run: hasPriorRun(key),
      })),
      required_sources: REQUIRED_SOURCES,
      sam_available: samAvailable,
      full_run_required: REQUIRED_SOURCES.some(key => !hasPriorRun(key)),
    };
  }

  function publicRuns() {
    return Object.values(stateRuns()).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  }

  function findRunning() {
    return Object.values(stateRuns()).find(job => job.status === 'RUNNING') || null;
  }

  function buildSteps(sources) {
    const steps = [];
    for (const key of SOURCE_ORDER) {
      if (!sources.includes(key)) continue;
      for (const name of SOURCE_MAP[key].steps) {
        steps.push({ name, status: 'PENDING', duration_s: null, detail: '', started_at: null, completed_at: null });
      }
    }
    for (const name of ['aggregate_full_collection', 'build_opportunity_store']) {
      steps.push({ name, status: 'PENDING', duration_s: null, detail: '', started_at: null, completed_at: null });
    }
    return steps;
  }

  function list(user) {
    if (!user) return { status: 401, body: { error: '请先登录' } };
    return { status: 200, body: { config: buildConfig(), runs: publicRuns() } };
  }

  function get(collectionId, user) {
    if (!user) return { status: 401, body: { error: '请先登录' } };
    const job = stateRuns()[collectionId];
    if (!job) return { status: 404, body: { error: '采集任务不存在' } };
    return { status: 200, body: job };
  }

  function trigger(payload, user) {
    if (!user) return { status: 401, body: { error: '请先登录' } };
    if (user.role === 'BUYER') return { status: 403, body: { error: '无权触发采集' } };

    const running = findRunning();
    if (running) {
      return { status: 409, body: { code: 'COLLECTION_ALREADY_RUNNING', error: '已有采集任务进行中', collection_id: running.collection_id } };
    }

    const sources = Array.isArray(payload?.sources) ? [...new Set(payload.sources)] : [];
    if (sources.length === 0) return { status: 400, body: { code: 'INVALID_SOURCES', error: '请选择至少一个采集源' } };
    const unknown = sources.filter(key => !SOURCE_MAP[key]);
    if (unknown.length > 0) return { status: 400, body: { code: 'INVALID_SOURCES', error: `未知采集源: ${unknown.join(', ')}` } };

    // Fresh-machine guard: aggregate hard-fails without a prior run of each
    // required source, so the first collection must include all of them.
    const missingPrior = REQUIRED_SOURCES.filter(key => !sources.includes(key) && !hasPriorRun(key));
    if (missingPrior.length > 0) {
      return {
        status: 422,
        body: {
          code: 'COLLECTION_REQUIRES_FULL_RUN',
          error: '首次采集需包含: b2b, alibaba, ted, samples（本机没有历史采集结果，部分采集无法聚合）',
          missing_prior_dirs: missingPrior.map(key => SOURCE_MAP[key].dir),
        },
      };
    }

    const collectionId = id('coll');
    const job = {
      collection_id: collectionId,
      status: 'RUNNING',
      sources,
      steps: buildSteps(sources),
      post_steps: POST_STEPS.map(step => ({ ...step, status: 'PENDING', detail: '' })),
      pipeline_run_id: null,
      pipeline_status: null,
      started_at: now(),
      completed_at: null,
      error: null,
      reloaded: false,
      triggered_by: user.email,
      pid: null,
    };
    stateRuns()[collectionId] = job;
    pruneLedger();
    onMutate();
    runJob(job).catch(() => {});
    return { status: 201, body: job };
  }

  async function markInterrupted() {
    const interrupted = [];
    for (const job of Object.values(stateRuns())) {
      if (job.status !== 'RUNNING') continue;
      job.status = 'INTERRUPTED';
      job.completed_at = now();
      job.error = '服务重启，采集进程已中断';
      interrupted.push(job.collection_id);
    }
    if (interrupted.length > 0) onMutate();
    return interrupted;
  }

  function failJob(job, error) {
    job.status = 'FAILED';
    job.completed_at = now();
    job.error = error;
    onMutate();
  }

  function backfillFromPipelineReport(job) {
    try {
      const report = JSON.parse(readFileSync(join(repoRoot, 'runtime', 'pipeline_last_run.json'), 'utf8'));
      if (report.run_id) job.pipeline_run_id = report.run_id;
      if (report.status) job.pipeline_status = report.status;
      for (const stepResult of report.steps || []) {
        const step = job.steps.find(candidate => candidate.name === stepResult.name);
        if (!step || step.status === 'OK' || step.status === 'FAILED') continue;
        step.status = stepResult.status;
        step.duration_s = stepResult.duration_s;
        step.detail = tail(String(stepResult.detail || ''), 500);
        step.completed_at = now();
      }
    } catch {
      // best-effort only — the pipeline may not have persisted a report yet
    }
  }

  function runBridgeScript(script, job, postStep) {
    return new Promise(settle => {
      const child = spawnFn(pythonBin, [resolve(repoRoot, script)], {
        cwd: repoRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      const guard = setTimeout(() => {
        child.kill();
        postStep.status = 'FAILED';
        postStep.detail = `timeout after ${Math.round(BRIDGE_TIMEOUT_MS / 1000)}s`;
        onMutate();
        settle(false);
      }, BRIDGE_TIMEOUT_MS);
      child.stdout?.on('data', chunk => { stdout += chunk; });
      child.stderr?.on('data', chunk => { stderr += chunk; });
      child.on('error', () => {
        clearTimeout(guard);
        postStep.status = 'FAILED';
        postStep.detail = `spawn failed: ${tail(stderr)}`;
        onMutate();
        settle(false);
      });
      child.on('exit', code => {
        clearTimeout(guard);
        let detail = {};
        try {
          const lines = String(stdout).replace(/\r/g, '').trim().split('\n').filter(Boolean);
          detail = lines.length ? JSON.parse(lines[lines.length - 1]) : {};
        } catch {
          detail = {};
        }
        if (code === 0) {
          postStep.status = 'OK';
          postStep.detail = Object.entries(detail).filter(([key]) => key !== 'exported_at')
            .map(([key, value]) => `${key}=${value}`).join(' ');
        } else {
          postStep.status = 'FAILED';
          postStep.detail = tail(stderr || stdout, 500);
        }
        onMutate();
        settle(code === 0);
      });
    });
  }

  async function runJob(job) {
    const child = spawnFn(pythonBin, [resolve(repoRoot, pipelineScript), '--only', ...job.steps.map(step => step.name), '--timeout', '1800'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    job.pid = child.pid || null;
    onMutate();

    let stdoutTail = '';
    let stderrTail = '';
    let stdoutBuffer = '';

    const timeoutGuard = setTimeout(() => {
      child.kill();
      failJob(job, `timeout after ${Math.round(timeoutMs / 60000)} min`);
    }, timeoutMs);

    function handleLine(line) {
      line = line.replace(/\r$/, '').trim();
      if (!line) return;

      const start = line.match(/^\[START\]\s+(\S+)$/);
      if (start) {
        const step = job.steps.find(candidate => candidate.name === start[1]);
        if (step) {
          step.status = 'RUNNING';
          step.started_at = now();
          onMutate();
        }
        return;
      }

      const done = line.match(STEP_DONE_RE);
      if (done) {
        const step = job.steps.find(candidate => candidate.name === done[2]);
        if (step) {
          step.status = done[1];
          step.duration_s = Number(done[3]);
          step.detail = tail(done[4] || '', 500);
          step.completed_at = now();
          onMutate();
        }
        return;
      }

      const skipEnv = line.match(STEP_SKIP_ENV_RE);
      if (skipEnv) {
        const step = job.steps.find(candidate => candidate.name === skipEnv[1]);
        if (step) {
          step.status = 'SKIPPED';
          step.detail = tail(skipEnv[2], 500);
          step.completed_at = now();
          onMutate();
        }
        return;
      }

      if (line.startsWith('{')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.run_id && parsed.status) {
            job.pipeline_run_id = parsed.run_id;
            job.pipeline_status = parsed.status;
            onMutate();
          }
        } catch {
          // not the final JSON line
        }
      }
    }

    child.stdout?.on('data', chunk => {
      stdoutTail = tail(stdoutTail + chunk, 2000);
      stdoutBuffer += chunk;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();
      for (const line of lines) handleLine(line);
    });
    child.stderr?.on('data', chunk => { stderrTail = tail(stderrTail + chunk, 2000); });

    child.on('error', () => {
      clearTimeout(timeoutGuard);
      failJob(job, `无法启动采集进程: ${tail(stderrTail) || 'python 不可用'}`);
    });

    child.on('exit', async code => {
      clearTimeout(timeoutGuard);
      if (code !== 0) {
        backfillFromPipelineReport(job);
        failJob(job, tail(stderrTail || stdoutTail, 2000) || `pipeline exited with ${code}`);
        return;
      }

      backfillFromPipelineReport(job);

      try {
        const [exportOk, importOk] = [
          await runBridgeScript(exportScript, job, job.post_steps[0]),
          await runBridgeScript(importScript, job, job.post_steps[1]),
        ];
        if (!exportOk || !importOk) {
          failJob(job, `桥接脚本失败（${!exportOk ? 'export' : 'import'}）；决策库已重建，可手动执行 .\\run.ps1 -Export 补桥`);
          return;
        }
        await reloadFree();
        job.reloaded = true;
        job.status = 'SUCCEEDED';
        job.completed_at = now();
        onMutate();
      } catch (error) {
        failJob(job, `采集完成但重载失败: ${error.message}`);
      }
    });
  }

  return { list, get, trigger, markInterrupted };
}
