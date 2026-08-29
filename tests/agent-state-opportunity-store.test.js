import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentStateOpportunityStore } from '../server/agent-state-opportunity-store.js';

test('Agent State store reuses existing opportunities and keeps A2 seed idempotent', () => {
  const state = {
    opportunities: {
      opp_demo_001: { id: 'opp_demo_001', status: '待确认', evidence_ids: ['ev_demo'] }
    }
  };
  let mutations = 0;
  const store = createAgentStateOpportunityStore({
    getState: () => state,
    onMutate: () => { mutations += 1; },
    now: () => '2026-08-29T03:00:00Z'
  });

  const first = store.upsertSeed({
    seed_key: 'a2:seller1:buyer1',
    seller: { id: 'seller1' },
    buyer: { id: 'buyer1' },
    status: 'READY_FOR_OUTREACH_APPROVAL',
    evidence_ids: ['ev_a2']
  });
  const second = store.upsertSeed({
    seed_key: 'a2:seller1:buyer1',
    seller: { id: 'seller1' },
    buyer: { id: 'buyer1' },
    status: 'READY_FOR_OUTREACH_APPROVAL',
    evidence_ids: ['ev_a2', 'ev_contact']
  });

  assert.equal(first.id, second.id);
  assert.equal(store.list().length, 2);
  assert.equal(store.get('opp_demo_001').status, '待确认');
  assert.deepEqual(second.evidence_ids.sort(), ['ev_a2', 'ev_contact'].sort());
  assert.equal(state.opportunity_seed_index['a2:seller1:buyer1'], first.id);
  assert.equal(mutations, 2);
});

test('Agent State store persists external Smartlead mapping for webhook resolution', () => {
  const state = { opportunities: {} };
  const store = createAgentStateOpportunityStore({ getState: () => state, now: () => '2026-08-29T03:01:00Z' });
  const opportunity = store.upsertSeed({ seed_key: 'a2:seller1:buyer2', seller: { id: 'seller1' }, buyer: { id: 'buyer2' } });

  store.bindExternalRef({ opportunityId: opportunity.id, provider: 'smartlead', kind: 'lead', externalId: 501, metadata: { campaign_id: 9 } });
  const resolved = store.resolveExternalRef({ provider: 'smartlead', kind: 'lead', externalId: 501 });

  assert.equal(resolved.id, opportunity.id);
  assert.equal(state.external_refs['smartlead:lead:501'].metadata.campaign_id, 9);
});

test('Agent State store applies A6 result into the existing Opportunity record', () => {
  const state = { opportunities: {} };
  const store = createAgentStateOpportunityStore({ getState: () => state });
  const opportunity = store.upsertSeed({
    seed_key: 'a2:seller1:buyer3',
    seller: { id: 'seller1' },
    buyer: { id: 'buyer3' },
    stage: 'CONTACTED',
    status: 'READY_FOR_OUTREACH_APPROVAL',
    evidence_ids: ['ev_seed']
  });

  const updated = store.applyA6Envelope({
    opportunityId: opportunity.id,
    at: '2026-08-29T03:02:00Z',
    envelope: {
      run_status: 'MORE_EVIDENCE',
      evidence_refs: ['ev_reply'],
      domain_result: {
        stage: { before: 'CONTACTED', after: 'REPLIED' },
        next_action: { action: 'WAIT', reason: '等待 A4 刷新' },
        dependency_refresh: { required: ['qianpulse.a4.supply_match'] },
        evidence_refs: ['ev_reply']
      }
    }
  });

  assert.equal(updated.status, 'WAITING_EVIDENCE');
  assert.equal(updated.stage, 'CONTACTED');
  assert.ok(updated.evidence_ids.includes('ev_reply'));
  assert.deepEqual(updated.a6.dependency_refresh.required, ['qianpulse.a4.supply_match']);
});
