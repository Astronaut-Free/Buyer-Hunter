import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPythonDependencyRunners, pythonCapabilitiesAvailable } from '../skill-runtime/python-capability-runners.mjs';
import { A4_CAPABILITY_ID } from '../skill-runtime/a4.js';

const CTX = {
  opportunity_id: 'opp-x',
  evaluated_at: '2026-08-29T00:00:00Z',
  changed_fields: ['quantity'],
  opportunity_state: { stage: 'QUALIFYING', fields: { product: 'MATCHA', demand_title: 'bulk matcha', quantity: '500 kg', destination: 'US' } },
  field_updates: { quantity: '2 tons' },
  seller_context: { capacity: '8000 kg/mo' },
  latest_buyer_message: { content: 'we need 2 tons', evidence_ref: 'email:m1' },
};

// A stand-in "python": a node script that reads the CLI payload and prints a canned envelope.
function fakeCli(envelopeOrMode) {
  const dir = mkdtempSync(join(tmpdir(), 'capcli-'));
  const script = join(dir, 'fake_cli.mjs');
  const body = envelopeOrMode === 'malformed'
    ? 'process.stdout.write("{not json");'
    : envelopeOrMode === 'crash'
      ? 'process.exit(3);'
      : `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);process.stdout.write(JSON.stringify(${JSON.stringify(envelopeOrMode)}));});`;
  writeFileSync(script, body);
  return { pythonBin: process.execPath, cliPath: script };
}

test('delegates to the capability CLI and tags the result source=python', async () => {
  const env = {
    capability_id: A4_CAPABILITY_ID, capability_version: '1.0.0-python', run_status: 'DONE',
    changed_fields: ['quantity'], missing_evidence: [], evidence_refs: [], human_review_required: false,
    domain_result: { match_status: 'VERIFIED_FOR_CHANGED_FIELDS', supply_pool_status: 'CONDITIONAL_ONLY', best_verdict: 'CONDITIONAL' },
    error: null,
  };
  const runners = createPythonDependencyRunners(fakeCli(env));
  const result = await runners[A4_CAPABILITY_ID](CTX);
  assert.equal(result.run_status, 'DONE');
  assert.equal(result.domain_result.source, 'python');
  assert.equal(result.domain_result.best_verdict, 'CONDITIONAL');
});

test('returns structured ERROR without semantic fallback when python is missing', async () => {
  const messages = [];
  const runners = createPythonDependencyRunners({ pythonBin: 'python-does-not-exist-xyz', onError: m => messages.push(m) });
  const result = await runners[A4_CAPABILITY_ID](CTX);
  assert.equal(result.run_status, 'ERROR');
  assert.equal(result.error.code, 'CAPABILITY_RUNTIME_UNAVAILABLE');
  assert.deepEqual(result.domain_result, {});
  assert.equal(messages.length, 1);
});

test('returns ERROR when the CLI returns a malformed envelope', async () => {
  const runners = createPythonDependencyRunners(fakeCli('malformed'));
  const result = await runners[A4_CAPABILITY_ID](CTX);
  assert.equal(result.run_status, 'ERROR');
  assert.equal(result.error.code, 'CAPABILITY_RUNTIME_UNAVAILABLE');
});

test('returns ERROR when the CLI exits non-zero', async () => {
  const runners = createPythonDependencyRunners(fakeCli('crash'));
  const result = await runners[A4_CAPABILITY_ID](CTX);
  assert.equal(result.run_status, 'ERROR');
  assert.equal(result.error.code, 'CAPABILITY_RUNTIME_UNAVAILABLE');
});

test('exposes a runner for each of A3 / A4 / A5', () => {
  const runners = createPythonDependencyRunners({ pythonBin: 'python-does-not-exist-xyz' });
  for (const id of ['qianpulse.a3.purchase_timing', 'qianpulse.a4.supply_match', 'qianpulse.a5.trade_risk']) {
    assert.equal(typeof runners[id], 'function', id);
  }
});

test('pythonCapabilitiesAvailable is false for a missing interpreter', async () => {
  assert.equal(await pythonCapabilitiesAvailable({ pythonBin: 'python-does-not-exist-xyz' }), false);
});
