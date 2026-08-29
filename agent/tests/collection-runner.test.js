import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCollectionRunner } from '../server/collection-runner.js';

const USER_SELLER = { id: 'u1', email: 'seller@qianpulse.cn', role: 'SELLER' };
const USER_BUYER = { id: 'u2', email: 'buyer@qianpulse.cn', role: 'BUYER' };

function makeEnv({ repoRoot, spawnFn, timeoutMs = 5000, samAvailable = false } = {}) {
  const state = { collection_runs: {} };
  const counters = { reload: 0, mutate: 0 };
  const runner = createCollectionRunner({
    getState: () => state,
    onMutate: () => { counters.mutate += 1; },
    now: () => new Date().toISOString(),
    id: prefix => `${prefix}_${Math.random().toString(36).slice(2, 8)}`,
    repoRoot,
    pythonBin: 'python',
    reloadFree: async () => { counters.reload += 1; },
    timeoutMs,
    samAvailable,
    spawnFn,
  });
  return { runner, state, counters };
}

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 4242;
  child.killed = false;
  child.kill = () => { child.killed = true; };
  return child;
}

// Pipeline child: emits canned stdout lines, then exits — schedule with
// setTimeout so the runner attaches its listeners first.
function pipelineChild(lines, exitCode = 0) {
  const child = fakeChild();
  child.schedule = () => {
    for (const line of lines) child.stdout.emit('data', line + '\n');
    child.emit('exit', exitCode);
  };
  return child;
}

// Bridge child (export/import): built lazily inside the spawn call so its
// emissions happen after the runner attaches its listeners.
function lazyBridgeChild(json, exitCode = 0) {
  return () => {
    const child = fakeChild();
    setImmediate(() => {
      child.stdout.emit('data', JSON.stringify(json) + '\n');
      setImmediate(() => child.emit('exit', exitCode));
    });
    return child;
  };
}

async function waitFor(fn, timeoutMs = 2000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

function emptyRepoRoot() {
  return mkdtempSync(join(tmpdir(), 'coll-root-'));
}

function repoRootWithPriorRuns() {
  const root = emptyRepoRoot();
  for (const dir of ['data_b2b_public_v3', 'data_alibaba_public', 'data_ted', 'data_v2']) {
    const path = join(root, 'pipeline', dir);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'probe_results.json'), '{}');
  }
  return root;
}

const FULL_SOURCES = ['b2b', 'alibaba', 'ted', 'ec21', 'sam', 'ungm', 'samples'];

test('trigger accepts a full selection on a fresh machine and starts RUNNING', () => {
  const { runner, state } = makeEnv({ repoRoot: emptyRepoRoot(), spawnFn: () => fakeChild() });
  const result = runner.trigger({ sources: FULL_SOURCES }, USER_SELLER);
  assert.equal(result.status, 201);
  assert.equal(result.body.status, 'RUNNING');
  // 2 (b2b) + 1 + 1 + 1 + 1 (sam) + 1 + 1 collect steps + aggregate + build
  assert.equal(result.body.steps.length, 10);
  assert.equal(Object.keys(state.collection_runs).length, 1);
});

test('trigger rejects a partial selection on a fresh machine with 422', () => {
  const { runner } = makeEnv({ repoRoot: emptyRepoRoot(), spawnFn: () => fakeChild() });
  const result = runner.trigger({ sources: ['ec21'] }, USER_SELLER);
  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'COLLECTION_REQUIRES_FULL_RUN');
  assert.deepEqual(result.body.missing_prior_dirs, ['data_b2b_public_v3', 'data_alibaba_public', 'data_ted', 'data_v2']);
});

test('trigger accepts a partial selection once required prior runs exist', () => {
  const { runner } = makeEnv({ repoRoot: repoRootWithPriorRuns(), spawnFn: () => fakeChild() });
  const result = runner.trigger({ sources: ['ec21'] }, USER_SELLER);
  assert.equal(result.status, 201);
});

test('trigger rejects unknown and empty sources with 400', () => {
  const { runner } = makeEnv({ repoRoot: emptyRepoRoot(), spawnFn: () => fakeChild() });
  assert.equal(runner.trigger({ sources: ['narnia'] }, USER_SELLER).status, 400);
  assert.equal(runner.trigger({ sources: [] }, USER_SELLER).status, 400);
  assert.equal(runner.trigger({}, USER_SELLER).status, 400);
});

test('trigger rejects while another run is RUNNING with 409', () => {
  const { runner } = makeEnv({ repoRoot: repoRootWithPriorRuns(), spawnFn: () => fakeChild() });
  const first = runner.trigger({ sources: FULL_SOURCES }, USER_SELLER);
  assert.equal(first.status, 201);
  const second = runner.trigger({ sources: FULL_SOURCES }, USER_SELLER);
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'COLLECTION_ALREADY_RUNNING');
  assert.equal(second.body.collection_id, first.body.collection_id);
});

test('trigger requires a seller/internal role', () => {
  const { runner } = makeEnv({ repoRoot: repoRootWithPriorRuns(), spawnFn: () => fakeChild() });
  assert.equal(runner.trigger({ sources: FULL_SOURCES }, null).status, 401);
  assert.equal(runner.trigger({ sources: FULL_SOURCES }, USER_BUYER).status, 403);
});

test('list/get require login and expose config + runs', () => {
  const { runner, state } = makeEnv({ repoRoot: emptyRepoRoot(), spawnFn: () => fakeChild() });
  assert.equal(runner.list(null).status, 401);
  assert.equal(runner.get('nope', null).status, 401);

  const created = runner.trigger({ sources: FULL_SOURCES }, USER_SELLER);
  const list = runner.list(USER_SELLER);
  assert.equal(list.status, 200);
  assert.equal(list.body.runs.length, 1);
  assert.equal(list.body.config.sam_available, false);
  assert.equal(list.body.config.full_run_required, true);

  const got = runner.get(created.body.collection_id, USER_SELLER);
  assert.equal(got.status, 200);
  assert.equal(got.body.collection_id, created.body.collection_id);
  assert.equal(runner.get('does-not-exist', USER_SELLER).status, 404);
  assert.equal(state.collection_runs[created.body.collection_id].status, 'RUNNING');
});

test('happy path: pipeline + bridges + reload end SUCCEEDED', async () => {
  const pipeline = pipelineChild([
    '[START] collect_b2b_public',
    '[     OK] collect_b2b_public (12.3s) 9 listings fetched',
    '[SKIPPED] collect_sam_precise (missing env SAM_API_KEY)',
    '[ FAILED] collect_ungm (3.0s) boom',
    '{"run_id": "r1", "status": "PARTIAL"}',
  ], 0);
  const makeExport = lazyBridgeChild({ exported_at: 'x', row_count: 51, ruleset_version: 'opportunity-v1.1.0' });
  const makeImport = lazyBridgeChild({ a6_outcomes_read: 0, deal_outcome_inserted: 0 });
  const queue = [pipeline, makeExport, makeImport];
  const { runner, counters } = makeEnv({
    repoRoot: repoRootWithPriorRuns(),
    spawnFn: () => {
      const next = queue.shift();
      return typeof next === 'function' ? next() : next;
    },
  });
  const created = runner.trigger({ sources: FULL_SOURCES }, USER_SELLER);
  const job = created.body;

  setTimeout(() => pipeline.schedule(), 5);
  await waitFor(() => job.status !== 'RUNNING');

  assert.equal(job.status, 'SUCCEEDED');
  assert.equal(job.pipeline_run_id, 'r1');
  assert.equal(job.pipeline_status, 'PARTIAL');
  assert.equal(job.reloaded, true);
  assert.equal(counters.reload, 1);

  const byName = name => job.steps.find(step => step.name === name);
  assert.equal(byName('collect_b2b_public').status, 'OK');
  assert.equal(byName('collect_b2b_public').duration_s, 12.3);
  assert.equal(byName('collect_sam_precise').status, 'SKIPPED');
  assert.equal(byName('collect_ungm').status, 'FAILED');
  assert.equal(job.post_steps[0].status, 'OK');
  assert.match(job.post_steps[0].detail, /row_count=51/);
  assert.equal(job.post_steps[1].status, 'OK');
});

test('non-zero pipeline exit ends FAILED with the error tail', async () => {
  const pipeline = pipelineChild(['[START] collect_b2b_public'], 2);
  const { runner } = makeEnv({
    repoRoot: repoRootWithPriorRuns(),
    spawnFn: () => pipeline,
  });
  const created = runner.trigger({ sources: FULL_SOURCES }, USER_SELLER);
  const job = created.body;
  pipeline.stderr.emit('data', 'Traceback: something broke');
  setTimeout(() => pipeline.schedule(), 5);
  await waitFor(() => job.status === 'FAILED');
  assert.match(job.error, /something broke/);
});

test('timeout kills the child and ends FAILED', async () => {
  const pipeline = fakeChild();
  const { runner } = makeEnv({
    repoRoot: repoRootWithPriorRuns(),
    spawnFn: () => pipeline,
    timeoutMs: 50,
  });
  const created = runner.trigger({ sources: FULL_SOURCES }, USER_SELLER);
  const job = created.body;
  await waitFor(() => job.status === 'FAILED');
  assert.equal(pipeline.killed, true);
  assert.match(job.error, /timeout/);
});

test('markInterrupted flips only RUNNING jobs', async () => {
  const root = repoRootWithPriorRuns();
  const { runner, state } = makeEnv({ repoRoot: root, spawnFn: () => fakeChild() });
  const created = runner.trigger({ sources: FULL_SOURCES }, USER_SELLER);
  const done = { collection_id: 'coll_done', status: 'SUCCEEDED', started_at: '2026-08-29T00:00:00Z' };
  state.collection_runs.coll_done = done;

  const interrupted = await runner.markInterrupted();
  assert.deepEqual(interrupted, [created.body.collection_id]);
  assert.equal(state.collection_runs[created.body.collection_id].status, 'INTERRUPTED');
  assert.equal(done.status, 'SUCCEEDED');
});

test('failed runs backfill step status from pipeline_last_run.json', async () => {
  const root = repoRootWithPriorRuns();
  mkdirSync(join(root, 'runtime'), { recursive: true });
  writeFileSync(join(root, 'runtime', 'pipeline_last_run.json'), JSON.stringify({
    run_id: 'r9',
    status: 'FAILED',
    steps: [
      { name: 'collect_b2b_public', status: 'FAILED', duration_s: 4.2, detail: 'boom' },
      { name: 'clean_and_score_b2b', status: 'SKIPPED', duration_s: 0.0, detail: 'a required step failed earlier' },
      { name: 'build_opportunity_store', status: 'SKIPPED', duration_s: 0.0, detail: 'a required step failed earlier' },
    ],
  }));
  const pipeline = pipelineChild(['[START] collect_b2b_public', '[ FAILED] collect_b2b_public (4.2s) boom'], 1);
  const { runner } = makeEnv({ repoRoot: root, spawnFn: () => pipeline });
  const created = runner.trigger({ sources: FULL_SOURCES }, USER_SELLER);
  const job = created.body;
  setTimeout(() => pipeline.schedule(), 5);
  await waitFor(() => job.status === 'FAILED');
  assert.equal(job.pipeline_run_id, 'r9');
  assert.equal(job.pipeline_status, 'FAILED');
  const skipped = job.steps.find(step => step.name === 'clean_and_score_b2b');
  assert.equal(skipped.status, 'SKIPPED');
});

test('ledger is pruned to the newest 20 runs', () => {
  const root = repoRootWithPriorRuns();
  const { runner, state } = makeEnv({ repoRoot: root, spawnFn: () => fakeChild() });
  for (let i = 0; i < 25; i += 1) {
    const result = runner.trigger({ sources: FULL_SOURCES }, USER_SELLER);
    // keep them terminal so no 409
    state.collection_runs[result.body.collection_id].status = 'SUCCEEDED';
  }
  assert.equal(Object.keys(state.collection_runs).length, 20);
});
