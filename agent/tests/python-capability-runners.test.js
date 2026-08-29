import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPythonDependencyRunners, pythonCapabilitiesAvailable } from '../skill-runtime/python-capability-runners.mjs';
import { A4_CAPABILITY_ID } from '../skill-runtime/a4.js';

const CTX = {
  opportunity_id: 'opp-x',
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

test('delegates to the capability CLI and tags the result source=python', () => {
  const env = {
    capability_id: A4_CAPABILITY_ID, capability_version: '1.0.0-python', run_status: 'DONE',
    changed_fields: ['quantity'], missing_evidence: [], evidence_refs: [], human_review_required: false,
    domain_result: { match_status: 'VERIFIED_FOR_CHANGED_FIELDS', supply_pool_status: 'CONDITIONAL_ONLY', best_verdict: 'CONDITIONAL' },
    error: null,
  };
  const runners = createPythonDependencyRunners(fakeCli(env));
  const result = runners[A4_CAPABILITY_ID](CTX);
  assert.equal(result.run_status, 'DONE');
  assert.equal(result.domain_result.source, 'python');
  assert.equal(result.domain_result.best_verdict, 'CONDITIONAL');
});

test('falls back to the bundled Node runner when python is missing', () => {
  const messages = [];
  const runners = createPythonDependencyRunners({ pythonBin: 'python-does-not-exist-xyz', onFallback: m => messages.push(m) });
  const result = runners[A4_CAPABILITY_ID](CTX);
  assert.equal(result.domain_result.source, 'node-fallback');
  assert.ok(result.domain_result.fallback_reason);
  assert.match(result.run_status, /DONE|MORE_EVIDENCE|BLOCKED/);
  assert.equal(messages.length, 1);
});

test('falls back when the CLI returns a malformed envelope', () => {
  const runners = createPythonDependencyRunners(fakeCli('malformed'));
  const result = runners[A4_CAPABILITY_ID](CTX);
  assert.equal(result.domain_result.source, 'node-fallback');
});

test('falls back when the CLI exits non-zero', () => {
  const runners = createPythonDependencyRunners(fakeCli('crash'));
  const result = runners[A4_CAPABILITY_ID](CTX);
  assert.equal(result.domain_result.source, 'node-fallback');
});

test('exposes a runner for each of A3 / A4 / A5', () => {
  const runners = createPythonDependencyRunners({ pythonBin: 'python-does-not-exist-xyz' });
  for (const id of ['qianpulse.a3.purchase_timing', 'qianpulse.a4.supply_match', 'qianpulse.a5.trade_risk']) {
    assert.equal(typeof runners[id], 'function', id);
  }
});

test('pythonCapabilitiesAvailable is false for a missing interpreter', () => {
  assert.equal(pythonCapabilitiesAvailable({ pythonBin: 'python-does-not-exist-xyz' }), false);
});
