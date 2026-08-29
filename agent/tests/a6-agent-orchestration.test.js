import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveA2A6Runtime } from '../server/a2a6-live-runtime.js';

test('Agent runs A6 analysis → A3/A4/A5 → A6 final, applies once, and replays duplicate event', () => {
  const state = {
    opportunities: {
      opp1: {
        id: 'opp1', status: 'ACTIVE', stage: 'CONTACTED', fields: { quantity: '500 kg', destination: 'US' },
        seller: { id: 'seller1' }, buyer: { id: 'buyer1' }, evidence_ids: []
      }
    },
    users: {}, sessions: {}
  };
  let counter = 0;
  const runtime = createLiveA2A6Runtime({
    getState: () => state,
    id: prefix => `${prefix}-${++counter}`,
    now: () => '2026-08-29T00:00:00Z'
  });
  const payload = {
    opportunity_id: 'opp1', idempotency_key: 'event:combined:1',
    message: 'We need 2 tons delivered to Japan by October 2026. JAS required.',
    evidence_ref: 'conversation:m1',
    seller_context: {
      capacity: '5 tons/month', delivery: '20 days', certifications: ['JAS'],
      market_access: 'Japan allowed', evidence_refs: ['seller:capacity:1', 'seller:delivery:1', 'seller:jas:1', 'risk:japan:1']
    }
  };
  const first = runtime.runBuyerMessage(payload, { id: 'buyer1', role: 'BUYER' });
  const replay = runtime.runBuyerMessage(payload, { id: 'buyer1', role: 'BUYER' });

  assert.equal(first.status, 201);
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, true);
  assert.deepEqual(first.body.run.capabilities_called, [
    'qianpulse.a6.opportunity_progression',
    'qianpulse.a3.purchase_timing',
    'qianpulse.a4.supply_match',
    'qianpulse.a5.trade_risk',
    'qianpulse.a6.opportunity_progression'
  ]);
  const steps = Object.values(state.steps).filter(step => step.run_id === first.body.run.run_id).sort((a, b) => a.sequence - b.sequence);
  assert.deepEqual(steps.map(step => step.phase), ['ANALYSIS', 'REFRESH', 'REFRESH', 'REFRESH', 'FINAL']);
  assert.equal(Object.keys(state.runs).length, 1);
  assert.equal(Object.keys(state.approvals).length, 1);
  assert.equal(state.opportunities.opp1.fields.quantity, '2 tons');
  assert.equal(state.opportunities.opp1.fields.destination, 'Japan');
  assert.equal(state.opportunities.opp1.fields.delivery_date, 'October 2026');
  assert.equal(state.opportunities.opp1.fields.certification, 'JAS');
  assert.equal(state.opportunities.opp1.stage, 'REPLIED');
});
