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

test('A5 review carries rule-depth risk items (fraud / contract / IP)', () => {
  const direct = runA5TradeRisk({
    opportunity_id: 'opp1',
    changed_fields: ['destination'],
    field_updates: {
      destination: 'DE',
      payment_terms: '100% T/T in advance, no guarantee',
      contact_email_raw: 'buyer77@qq.com',
      buyer_identity_status: 'UNRESOLVED'
    },
    latest_buyer_message: { content: 'want starbucks-style matcha' },
    seller_context: { allowed_markets: ['DE'], payment_policy: ['T/T'] }
  });
  assert.equal(direct.run_status, 'DONE');
  const codes = new Set(direct.domain_result.risk_items.map(item => item.code));
  assert.ok(codes.has('FRAUD_SIGNAL'), 'free-mail + unresolved identity');
  assert.ok(codes.has('CONTRACT_RISK'), 'full advance without guarantee');
  assert.ok(codes.has('IP_CONFLICT'), 'brand mention without authorization');
});
