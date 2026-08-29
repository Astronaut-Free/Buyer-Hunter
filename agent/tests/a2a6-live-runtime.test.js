import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveA2A6Runtime } from '../server/a2a6-live-runtime.js';

function buyerCompany() {
  return {
    buyer_company_id: 'buyer-company-1',
    legal_or_display_name: 'US Ingredient Importer',
    country: 'US',
    domain: 'buyer.example',
    sells_or_uses_product: true,
    buyer_type: 'importer',
    why_fit: 'imports relevant tea ingredients',
    number_of_shipments: 20,
    evidence_refs: ['ev_company'],
    product_evidence: ['ev_product'],
    trade_evidence: ['ev_trade']
  };
}

const targetInput = {
  seller: { product_id: 'p1', company_name: 'Guizhou Tea', product_name: 'Matcha' },
  target: { countries: ['US'], product_keywords: ['matcha'] },
  buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] },
  constraints: { max_candidates: 5, language: 'en', contact_limit_per_company: 1 },
  execution: { channel: 'email', human_gate: true }
};

function runtimeFixture() {
  const state = { opportunities: {}, users: {}, sessions: {} };
  let mutations = 0;
  let counter = 0;
  const user = { id: 'seller-1', role: 'SELLER', profile: { company_name: 'Guizhou Tea' } };
  const runtime = createLiveA2A6Runtime({
    getState: () => state,
    onMutate: () => { mutations += 1; },
    now: () => '2026-08-29T04:00:00Z',
    id: prefix => `${prefix}-${++counter}`,
    authorizeOpportunity: (actor, opportunity) => actor?.role === 'INTERNAL' || (actor?.role === 'SELLER' && opportunity.seller?.id === actor.id),
    providers: {
      trade_data: { async searchBuyers() { return { companies: [buyerCompany()] }; } },
      contact_data: { async findDecisionMakers() { return [{ buyer_company_id: 'buyer-company-1', name: 'Alex', work_email: 'alex@buyer.example', role_reason: 'Procurement Manager', source_refs: ['ev_contact'] }]; } }
    }
  });
  return { state, runtime, user, mutations: () => mutations };
}

test('authenticated seller runs A2 through AgentRun and creates an accessible Opportunity', async () => {
  const { state, runtime, user } = runtimeFixture();
  const result = await runtime.runProactive({
    event_type: 'SELLER_PROACTIVE_DEVELOPMENT',
    idempotency_key: 'a2-live-1',
    input: targetInput,
    max_ready: 1
  }, user);

  assert.equal(result.status, 201);
  assert.equal(result.body.run.status, 'COMPLETED');
  assert.equal(result.body.generated_opportunity_ids.length, 1);
  const opportunity = result.body.opportunities[0];
  assert.equal(opportunity.seller.id, user.id);
  assert.equal(opportunity.status, 'READY_FOR_OUTREACH_APPROVAL');
  assert.equal(Object.values(state.runs).length, 1);
  assert.equal(Object.values(state.steps)[0].capability_id, 'qianpulse.a2.proactive_buyer_development');
  assert.equal(Object.values(state.checkpoints).length, 1);
});

test('A2 live runtime creates a Human Gate first-outreach approval when campaign is configured', async () => {
  const { state, runtime, user } = runtimeFixture();
  const result = await runtime.runProactive({
    event_type: 'SELLER_PROACTIVE_DEVELOPMENT',
    idempotency_key: 'a2-live-approval',
    input: targetInput,
    max_ready: 1,
    campaign_id: 12
  }, user);

  assert.equal(result.status, 201);
  assert.equal(result.body.outreach_approval_required, true);
  assert.equal(result.body.outreach_approvals.length, 1);
  const approval = result.body.outreach_approvals[0];
  assert.equal(approval.action_type, 'A2_OUTREACH_DRAFT');
  assert.equal(approval.status, 'PENDING');
  assert.equal(approval.payload.transport.provider, 'smartlead');
  assert.equal(approval.payload.transport.campaign_id, 12);
  assert.equal(approval.payload.transport.lead.email, 'alex@buyer.example');
  const opportunity = result.body.opportunities[0];
  assert.equal(opportunity.outreach_approval_id, approval.approval_id);
  assert.equal(state.approvals[approval.approval_id].opportunity_id, opportunity.id);
});

test('A2 live runtime is idempotent and does not create duplicate Opportunities', async () => {
  const { state, runtime, user } = runtimeFixture();
  const payload = { event_type: 'SELLER_PROACTIVE_DEVELOPMENT', idempotency_key: 'a2-live-replay', input: targetInput, max_ready: 1 };
  const first = await runtime.runProactive(payload, user);
  const second = await runtime.runProactive(payload, user);

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(second.replayed, true);
  assert.equal(Object.keys(state.opportunities).length, 1);
  assert.equal(Object.keys(state.runs).length, 1);
});

test('buyer reply enters A6 AgentRun and waits for invalidated dependency refresh', async () => {
  const { state, runtime, user } = runtimeFixture();
  const proactive = await runtime.runProactive({ event_type: 'SELLER_PROACTIVE_DEVELOPMENT', idempotency_key: 'a2-live-2', input: targetInput, max_ready: 1 }, user);
  const opportunityId = proactive.body.generated_opportunity_ids[0];

  const result = runtime.runBuyerMessage({
    opportunity_id: opportunityId,
    idempotency_key: 'buyer-msg-1',
    message: 'We need 20 tons. What is your delivery lead time?',
    source_message_id: 'mail-001',
    evidence_ref: 'email:mail-001',
    seller_context: { delivery: '20 days' }
  }, user);

  assert.equal(result.status, 201);
  assert.equal(result.body.envelope.run_status, 'MORE_EVIDENCE');
  assert.equal(result.body.run.status, 'WAITING_EVIDENCE');
  assert.equal(result.body.opportunity.status, 'WAITING_EVIDENCE');
  assert.ok(result.body.envelope.domain_result.dependency_refresh.required.includes('qianpulse.a4.supply_match'));
  assert.ok(result.body.opportunity.evidence_ids.includes('email:mail-001'));
  assert.deepEqual(result.body.run.capabilities_called, [
    'qianpulse.a4.supply_match',
    'qianpulse.a3.purchase_timing',
    'qianpulse.a6.opportunity_progression'
  ]);
  const runSteps = Object.values(state.steps)
    .filter(step => step.run_id === result.body.run.run_id)
    .sort((left, right) => left.sequence - right.sequence);
  assert.deepEqual(runSteps.map(step => step.capability_id), result.body.run.capabilities_called);
  assert.equal(runSteps.at(-1).capability_id, 'qianpulse.a6.opportunity_progression');
});

test('A6 verified low-risk answer creates a Human Gate approval with evidence-safe draft', async () => {
  const { state, runtime, user } = runtimeFixture();
  const proactive = await runtime.runProactive({ event_type: 'SELLER_PROACTIVE_DEVELOPMENT', idempotency_key: 'a2-live-3', input: targetInput, max_ready: 1 }, user);
  const opportunityId = proactive.body.generated_opportunity_ids[0];

  const result = runtime.runBuyerMessage({
    opportunity_id: opportunityId,
    idempotency_key: 'buyer-msg-2',
    message: 'What is your MOQ?',
    evidence_ref: 'email:mail-002',
    seller_context: { moq: '500 kg' }
  }, user);

  assert.equal(result.status, 201);
  assert.equal(result.body.envelope.run_status, 'DONE');
  assert.equal(result.body.run.status, 'WAITING_APPROVAL');
  assert.equal(result.body.approval.status, 'PENDING');
  assert.match(result.body.approval.payload.draft.content, /MOQ: 500 kg/);
  assert.equal(Object.values(state.approvals).length, 1);
});

test('A6 live runtime rejects wrong seller before touching Opportunity state', async () => {
  const { runtime, user } = runtimeFixture();
  const proactive = await runtime.runProactive({ event_type: 'SELLER_PROACTIVE_DEVELOPMENT', idempotency_key: 'a2-live-4', input: targetInput, max_ready: 1 }, user);
  const opportunityId = proactive.body.generated_opportunity_ids[0];

  const result = runtime.runBuyerMessage({ opportunity_id: opportunityId, idempotency_key: 'buyer-msg-3', message: 'Hello' }, { id: 'seller-2', role: 'SELLER' });
  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'FORBIDDEN');
});
