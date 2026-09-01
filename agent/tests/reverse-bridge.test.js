import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeFreeOpportunities, buildAgentOutcomesEntries, linkBridgedBuyers } from '../server/repository.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3401;

test('buildAgentOutcomesEntries emits A6 outcomes and A2 targets only', () => {
  const opportunities = {
    free_1: {
      id: 'opp-free-1',
      seed_key: 'bridge:free:opp-free-1',
      source: 'FREE_PIPELINE',
      stage: 'NEGOTIATING',
      a6: {
        run_status: 'DONE',
        outcome: { opportunity_id: 'opp-free-1', outcome: 'STOPPED', reason: 'stale lead' },
        next_action: { action: 'STOP_CONTACT', reason: 'stale lead' },
        updated_at: '2026-08-29T09:00:00.000Z'
      }
    },
    a2_1: {
      id: 'opp_a2_1',
      seed_key: 'a2:seller-guizhou-specialty-demo:company-1',
      source: 'A2_PROACTIVE_BUYER_DEVELOPMENT',
      buyer: { id: 'buyer_company_1', name: 'Acme Imports', country: 'DE', domain: 'acme.de' },
      status: 'READY_FOR_OUTREACH_APPROVAL'
    },
    free_untouched: {
      id: 'opp-free-2',
      seed_key: 'bridge:free:opp-free-2',
      source: 'FREE_PIPELINE',
      a6: { run_status: 'DONE', outcome: null }
    }
  };
  const entries = buildAgentOutcomesEntries(opportunities, () => 'fixed-now');
  assert.equal(entries.a6_outcomes.length, 1);
  const outcome = entries.a6_outcomes[0];
  assert.equal(outcome.opportunity_id, 'opp-free-1');
  assert.equal(outcome.outcome, 'STOPPED');
  assert.equal(outcome.stage_after, 'NEGOTIATING');
  assert.equal(outcome.seed_key, 'bridge:free:opp-free-1');
  assert.equal(entries.a2_targets.length, 1);
  assert.equal(entries.a2_targets[0].id, 'opp_a2_1');
});

test('mergeFreeOpportunities preserves runtime mutations, refreshes scores', () => {
  const existing = {
    id: 'opp-1',
    seed_key: 'bridge:free:opp-1',
    source: 'FREE_PIPELINE',
    stage: 'NEGOTIATING',
    status: 'ACTIVE',
    fields: { quantity: '2 Twenty-Foot Container', destination: 'GB' },
    a6: { run_status: 'DONE', outcome: { outcome: 'WON' } },
    evidence_ids: ['old-ev'],
    fit_score: 71,
    opportunity_score: 80
  };
  const imported = {
    id: 'opp-1',
    seed_key: 'bridge:free:opp-1',
    source: 'FREE_PIPELINE',
    stage: 'CONTACTED',
    status: 'WATCH',
    fields: { quantity: '未披露', destination: 'GB', product: 'TEA' },
    a6: null,
    evidence_ids: ['https://new-ev'],
    fit_score: 88,
    opportunity_score: 91
  };
  const merged = mergeFreeOpportunities(existing, imported);
  assert.equal(merged.stage, 'NEGOTIATING');        // runtime wins
  assert.equal(merged.status, 'ACTIVE');
  assert.equal(merged.a6.outcome.outcome, 'WON');
  assert.equal(merged.fields.quantity, '2 Twenty-Foot Container'); // per-key existing wins
  assert.equal(merged.fields.product, 'TEA');       // fresh keys pass through
  assert.equal(merged.fit_score, 88);               // scores refresh
  assert.equal(merged.opportunity_score, 91);
  assert.deepEqual(merged.evidence_ids, ['old-ev', 'https://new-ev']);
});

test('linkBridgedBuyers binds A2 targets to Free buyers on domain match', () => {
  const opportunities = {
    free_1: {
      id: 'opp-free-1',
      seed_key: 'bridge:free:opp-free-1',
      source: 'FREE_PIPELINE',
      buyer: { id: 'buyer_free_1', name: 'Acme', domain: 'Acme.de' }
    },
    a2_1: {
      id: 'opp_a2_1',
      seed_key: 'a2:demo:company-1',
      source: 'A2_PROACTIVE_BUYER_DEVELOPMENT',
      buyer: { id: 'buyer_company_1', name: 'ACME Imports GmbH', domain: 'acme.DE' }
    },
    a2_2: {
      id: 'opp_a2_2',
      seed_key: 'a2:demo:company-2',
      source: 'A2_PROACTIVE_BUYER_DEVELOPMENT',
      buyer: { id: 'buyer_company_2', name: 'Nobody Ltd', domain: 'nobody.us' }
    }
  };
  const refs = linkBridgedBuyers(opportunities, () => 'fixed-now');
  assert.equal(refs.length, 1);
  assert.equal(refs[0][0], 'free:buyer:buyer_free_1');
  assert.equal(opportunities.a2_1.buyer.free_buyer_id, 'buyer_free_1');
  assert.equal(opportunities.a2_1.external_refs['free:buyer:buyer_free_1'].provider, 'free');
  assert.equal(opportunities.a2_2.buyer.free_buyer_id, undefined); // no match, untouched
});

test('server persist writes agent-outcomes.json and meta', async () => {
  const stateFile = join(ROOT, 'server', `agent-state.test-${process.pid}.json`);
  const outcomesFile = join(ROOT, 'db', `agent-outcomes.test-${process.pid}.json`);
  const metaFile = outcomesFile.replace(/\.json$/, '.meta.json');

  const state = {
    users: {}, sessions: {}, events: {}, threads: {}, messages: {}, runs: {}, steps: {},
    checkpoints: {}, approvals: {}, idempotency: {}, traces: [],
    opportunities: {
      opp_free_x: {
        id: 'opp_free_x',
        seed_key: 'bridge:free:opp_free_x',
        source: 'FREE_PIPELINE',
        stage: 'NEGOTIATING',
        buyer: { id: 'b1', name: 'B', market: 'DE' },
        seller: { id: 'seller-guizhou-specialty-demo', name: 'demo' },
        fields: {},
        a6: {
          run_status: 'DONE',
          outcome: { opportunity_id: 'opp_free_x', outcome: 'LOST', reason: 'competitor won' },
          next_action: { action: 'MARK_LOST', reason: 'competitor won' },
          updated_at: '2026-08-29T10:00:00.000Z'
        }
      }
    }
  };
  await writeFile(stateFile, JSON.stringify(state, null, 2));

  const child = spawn(process.execPath, ['server/bootstrap.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      AUTH_SECRET: 'qianpulse-ci-secret',
      DEEPSEEK_MODEL: 'deepseek-chat',
      AGENT_STATE_FILE: stateFile,
      AGENT_OUTCOMES_FILE: outcomesFile
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  try {
    // Wait for health, then trigger a state mutation so persist() runs.
    let ready = false;
    for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
        ready = response.ok;
      } catch { /* not up yet */ }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`server not healthy; stderr: ${stderr}`);

    await fetch(`http://127.0.0.1:${PORT}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'SELLER', email: 'seller@test.dev', password: 'password123' })
    });

    // persistSoon is debounced 20ms; give it a moment.
    for (let attempt = 0; attempt < 20 && !existsSync(outcomesFile); attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const payload = JSON.parse(await readFile(outcomesFile, 'utf8'));
    assert.equal(payload.direction, 'agent -> free (v2 reverse)');
    assert.equal(payload.entries.a6_outcomes.length, 1);
    assert.equal(payload.entries.a6_outcomes[0].outcome, 'LOST');
    assert.equal(payload.entries.a6_outcomes[0].stage_after, 'NEGOTIATING');
    const meta = JSON.parse(await readFile(metaFile, 'utf8'));
    assert.equal(meta.a6_outcome_count, 1);
    assert.equal(meta.a2_target_count, 0);
  } finally {
    child.kill('SIGKILL');
    await rm(stateFile, { force: true });
    await rm(outcomesFile, { force: true });
    await rm(metaFile, { force: true });
  }
});
