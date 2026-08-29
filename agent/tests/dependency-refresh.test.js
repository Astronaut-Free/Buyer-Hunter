import test from 'node:test';
import assert from 'node:assert/strict';
import { runInvalidatedDependencies } from '../skill-runtime/dependency-refresh.js';
import { createPythonDependencyRunners } from '../skill-runtime/python-capability-runners.mjs';
import { A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID } from '../skill-runtime/capability-ids.js';

const runners = createPythonDependencyRunners();
const evaluated_at = '2026-08-29T00:00:00Z';

test('A3 refresh treats a fresh delivery question as current timing evidence', async () => {
  const result = await runners[A3_CAPABILITY_ID]({
    opportunity_id: 'opp1', evaluated_at,
    latest_buyer_message: { content: 'What is your delivery lead time?', evidence_ref: 'ev1' },
    opportunity_state: { fields: {} }
  });
  assert.equal(result.run_status, 'DONE');
  assert.equal(result.domain_result.window_status, 'OPEN');
  assert.deepEqual(result.evidence_refs, ['ev1']);
});

test('A4 keeps non-weight quantity unknown instead of inventing kilograms', async () => {
  const result = await runners[A4_CAPABILITY_ID]({
    opportunity_id: 'opp1', evaluated_at, changed_fields: ['quantity'],
    demand: { category_code: 'MATCHA', quantity: '5 pallets' }, seller_context: {}
  });
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.domain_result.recommendation, 'NEED_MORE_DATA');
  assert.ok(result.domain_result.unknowns.some(item => item.dimension === 'quantity_capacity'));
});

test('A5 blocks only an evidence-backed regulatory prohibition and dependency runner preserves it', async () => {
  const context = {
    opportunity_id: 'opp1', evaluated_at, changed_fields: ['destination'],
    buyer_country: 'US', destination_market: 'JP',
    regulatory_evidence: [{ market: 'JP', result: 'PROHIBITED', reason: 'test prohibition', evidence_ref: 'reg1' }]
  };
  const direct = await runners[A5_CAPABILITY_ID](context);
  assert.equal(direct.run_status, 'BLOCKED');
  assert.equal(direct.domain_result.access_status, 'BLOCK');

  const refresh = await runInvalidatedDependencies({
    capabilities: [A5_CAPABILITY_ID],
    opportunity: { id: 'opp1', stage: 'CONTACTED', buyer: { market: 'US' }, fields: { destination: 'JP' } },
    event: { timestamp: evaluated_at, evidence_ref: 'ev1', changed_fields: [{ field: 'destination' }], payload: { field_updates: { destination: 'JP' } } },
    sellerContext: { regulatory_evidence: context.regulatory_evidence }, runners
  });
  assert.deepEqual(refresh.refreshed_capabilities, [A5_CAPABILITY_ID]);
  assert.equal(refresh.dependency_results.a5.run_status, 'BLOCKED');
});
