import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveA2A6Runtime } from '../server/a2a6-live-runtime.js';
import { createPythonDependencyRunners } from '../skill-runtime/python-capability-runners.mjs';

function stateFixture() {
  return {
    opportunities: {
      opp_route: { id: 'opp_route', seller: { id: 'seller-1' }, buyer: { id: 'buyer-1', market: 'US' },
        status: 'ACTIVE', stage: 'CONTACTED', fields: { product: 'MATCHA', category_code: 'MATCHA' }, evidence_ids: [] }
    }, users: {}, sessions: {}, runs: {}, steps: {}, checkpoints: {}, events: {}, traces: [], idempotency: {}
  };
}

function fakeRunners() {
  return Object.fromEntries([
    ['qianpulse.a3.purchase_timing', { window_status: 'OPEN', evaluated_at: '2026-08-29T00:00:00Z', ruleset_version: 'test' }],
    ['qianpulse.a4.supply_match', { recommendation: 'FIT', eligible_sku_count: 1, eligible_skus: [], evaluated_at: '2026-08-29T00:00:00Z' }],
    ['qianpulse.a5.trade_risk', { access_status: 'PASS', risk_items: [], evaluated_at: '2026-08-29T00:00:00Z' }]
  ].map(([capabilityId, domainResult]) => [capabilityId, async () => ({
    capability_id: capabilityId, capability_version: 'test', run_status: 'DONE', changed_fields: [], missing_evidence: [],
    evidence_refs: [], human_review_required: false, domain_result: domainResult, error: null
  })]));
}

test('Agent refresh events route A3 A4 A5 and persist Step Trace Checkpoint', async () => {
  const state = stateFixture();
  const runtime = createLiveA2A6Runtime({
    getState: () => state, dependencyRunners: fakeRunners(), now: () => '2026-08-29T00:00:00Z',
    authorizeOpportunity: () => true
  });
  for (const [index, eventType] of ['PURCHASE_TIMING_REFRESH', 'SUPPLY_MATCH_REFRESH', 'TRADE_RISK_REFRESH'].entries()) {
    const response = await runtime.runCapabilityRefresh({
      event_type: eventType, opportunity_id: 'opp_route', idempotency_key: `route-${index}`, evaluated_at: '2026-08-29T00:00:00Z'
    }, { id: 'seller-1', role: 'SELLER' });
    assert.equal(response.status, 201);
    assert.equal(response.body.executions.length, 1);
  }
  assert.equal(Object.keys(state.steps).length, 3);
  assert.equal(Object.keys(state.checkpoints).length, 3);
  assert.equal(state.traces.length, 3);
  assert.equal(state.opportunities.opp_route.a3.result.window_status, 'OPEN');
  assert.equal(state.opportunities.opp_route.a4.result.recommendation, 'FIT');
  assert.equal(state.opportunities.opp_route.a5.result.access_status, 'PASS');
});

test('buyer reply runs A3 A4 A5 A6 through Python in one Agent Run', async () => {
  const state = stateFixture();
  const runtime = createLiveA2A6Runtime({
    getState: () => state, dependencyRunners: createPythonDependencyRunners(), now: () => '2026-08-29T00:00:00Z',
    authorizeOpportunity: () => true
  });
  const sellerContext = {
    seller_id: 'seller-1', company_name: 'Seller', export_experience_markets: ['JP'], data_mode: 'LIVE', version: 'seller-v1',
    skus: [{ sku: 'MATCHA-BEV', product_name: 'Beverage matcha', category_code: 'MATCHA', grade: 'beverage', moq_kg: 100,
      monthly_capacity_kg: 5000, delivery_days: 20, certifications: ['HACCP', 'JAS ORGANIC'], packaging: [], oem: false,
      private_label: false, sample_available: false }],
    seller_sku: { certifications: ['JAS ORGANIC'] },
    regulatory_evidence: [{ market: 'JP', result: 'ALLOWED', evidence_ref: 'reg-jp' }]
  };
  const response = await runtime.runBuyerMessage({
    opportunity_id: 'opp_route', idempotency_key: 'buyer-a345',
    message: 'We need 2 tons of beverage grade matcha delivered to Japan by October. JAS Organic required.',
    evidence_ref: 'email:buyer-a345',
    field_updates: { quantity: '2 tons', grade: 'beverage', destination: 'JP', delivery_date: '2026-10-31', certification: 'JAS Organic' },
    seller_context: sellerContext
  }, { id: 'seller-1', role: 'SELLER' });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.run.capabilities_called, [
    'qianpulse.a6.opportunity_progression', 'qianpulse.a3.purchase_timing', 'qianpulse.a4.supply_match', 'qianpulse.a5.trade_risk', 'qianpulse.a6.opportunity_progression'
  ]);
  const steps = Object.values(state.steps).filter(item => item.run_id === response.body.run.run_id);
  assert.equal(steps.length, 5);
  assert.deepEqual(steps.sort((a, b) => a.sequence - b.sequence).map(item => item.phase), ['ANALYSIS', 'REFRESH', 'REFRESH', 'REFRESH', 'FINAL']);
  assert.ok(steps.filter(item => item.phase === 'REFRESH').every(item => item.result.domain_result.source === 'python'));
  assert.ok(Object.values(state.checkpoints).some(item => item.run_id === response.body.run.run_id));
});
