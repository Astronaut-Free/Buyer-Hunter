import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runInvalidatedDependencies,
  runA3PurchaseTiming,
  runA4SupplyMatch,
  runA5TradeRisk
} from '../skill-runtime/index.js';

test('A3 refresh treats a fresh delivery question as current timing evidence', () => {
  const result = runA3PurchaseTiming({
    opportunity_id: 'opp1',
    latest_buyer_message: { content: 'What is your delivery lead time?', evidence_ref: 'ev1' },
    opportunity_state: { fields: {} }
  });
  assert.equal(result.run_status, 'DONE');
  assert.equal(result.domain_result.timing_signal, 'BUYER_TIMING_QUERY');
  assert.deepEqual(result.evidence_refs, ['ev1']);
});

test('A4 refresh fails closed when changed quantity lacks capacity or MOQ evidence', () => {
  const result = runA4SupplyMatch({
    opportunity_id: 'opp1',
    changed_fields: ['quantity', 'delivery_date'],
    seller_context: { delivery: '20 days' }
  });
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.ok(result.missing_evidence.includes('capacity_or_moq'));
});

test('A5 refresh blocks an explicitly blocked destination and dependency runner preserves it', () => {
  const direct = runA5TradeRisk({
    opportunity_id: 'opp1',
    changed_fields: ['destination'],
    field_updates: { destination: 'Restricted Market' },
    seller_context: { blocked_markets: ['Restricted Market'], evidence_refs: ['policy1'] }
  });
  assert.equal(direct.run_status, 'BLOCKED');

  const refresh = runInvalidatedDependencies({
    capabilities: ['qianpulse.a5.trade_risk'],
    opportunity: { id: 'opp1', stage: 'CONTACTED', fields: {} },
    event: {
      evidence_ref: 'ev1',
      changed_fields: [{ field: 'destination' }],
      payload: { field_updates: { destination: 'Restricted Market' }, message: 'Ship to Restricted Market' }
    },
    sellerContext: { blocked_markets: ['Restricted Market'], evidence_refs: ['policy1'] }
  });
  assert.deepEqual(refresh.refreshed_capabilities, ['qianpulse.a5.trade_risk']);
  assert.equal(refresh.dependency_results.a5.run_status, 'BLOCKED');
});
