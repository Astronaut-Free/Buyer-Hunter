import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryOpportunityStore } from '../opportunity-store.js';
import { createQianPulseSkillOrchestrator } from '../qianpulse-skill-orchestrator.js';
import { composeReply } from '../services/reply-composer.js';

function dependencyRunner(capabilityId, runStatus = 'DONE', missing = []) {
  return async context => ({
    capability_id: capabilityId, capability_version: 'test', run_status: runStatus,
    changed_fields: context.changed_fields || [], missing_evidence: missing,
    evidence_refs: context.latest_buyer_message?.evidence_ref ? [context.latest_buyer_message.evidence_ref] : [],
    human_review_required: runStatus !== 'DONE', domain_result: capabilityId.endsWith('trade_risk')
      ? { access_status: 'PASS' }
      : capabilityId.endsWith('supply_match')
        ? { verified_facts: { delivery: context.seller_context?.delivery, capacity_or_moq: context.seller_context?.moq || context.seller_context?.capacity } }
        : {}, error: null
  });
}

const input = {
  seller: { seller_id: 'seller1', company_id: 'company1', product_id: 'p1', company_name: 'Guizhou Tea', product_name: 'Matcha' },
  target: { countries: ['US'], product_keywords: ['matcha'] },
  buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] },
  constraints: { max_candidates: 5, language: 'en', contact_limit_per_company: 1 },
  execution: { channel: 'email', human_gate: true, campaign_id: 12 }
};

function providerCompany() {
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

test('A2 batch persists READY candidates as idempotent Opportunity records', async () => {
  const store = createMemoryOpportunityStore();
  const orchestrator = createQianPulseSkillOrchestrator({
    opportunityStore: store,
    clock: () => '2026-08-29T02:00:00Z',
    providers: {
      trade_data: { async searchBuyers() { return { companies: [providerCompany()] }; } },
      contact_data: { async findDecisionMakers() { return [{ name: 'Alex', work_email: 'alex@buyer.example', role_reason: 'Procurement Manager', source_refs: ['ev_contact'] }]; } }
    }
  });
  const first = await orchestrator.runProactiveDevelopment({ input, maxReady: 1 });
  const second = await orchestrator.runProactiveDevelopment({ input, maxReady: 1 });
  assert.equal(first.opportunities.length, 1);
  assert.equal(second.opportunities.length, 1);
  assert.equal(first.opportunities[0].id, second.opportunities[0].id);
  assert.equal(store.list().length, 1);
  assert.equal(first.opportunities[0].status, 'READY_FOR_OUTREACH_APPROVAL');
});

test('A6 buyer progression keeps waiting when automatic dependency refresh lacks seller evidence', async () => {
  const store = createMemoryOpportunityStore();
  const opportunity = store.upsertSeed({
    seed_key: 'a2:seller:buyer',
    seller: { id: 'seller' },
    buyer: { id: 'buyer', name: 'Buyer' },
    status: 'READY_FOR_OUTREACH_APPROVAL',
    stage: 'CONTACTED',
    fields: { quantity: '500 kg' },
    evidence_ids: ['ev_seed']
  });
  const orchestrator = createQianPulseSkillOrchestrator({ opportunityStore: store, clock: () => '2026-08-29T02:10:00Z', dependencyRunners: {
    'qianpulse.a3.purchase_timing': dependencyRunner('qianpulse.a3.purchase_timing'),
    'qianpulse.a4.supply_match': dependencyRunner('qianpulse.a4.supply_match', 'MORE_EVIDENCE', ['capacity_or_moq'])
  } });
  const result = await orchestrator.runBuyerProgression({
    opportunityId: opportunity.id,
    event: { event_id: 'evt1', event_type: 'BUYER_MESSAGE', content: 'We need 20 tons. What is your delivery lead time?', evidence_ref: 'ev_reply' },
    sellerContext: { delivery: '20 days' }
  });
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.opportunity.id, opportunity.id);
  assert.equal(result.opportunity.status, 'WAITING_EVIDENCE');
  assert.equal(result.envelope.domain_result.decision_state, 'VERIFY');
  assert.ok(result.dependency_refresh.executions.some(item => item.capability_id === 'qianpulse.a4.supply_match' && item.run_status === 'MORE_EVIDENCE'));
  assert.ok(result.dependency_refresh.refreshed_capabilities.includes('qianpulse.a3.purchase_timing'));
  assert.ok(result.opportunity.evidence_ids.includes('ev_reply'));
  assert.equal(result.opportunity.fields.quantity, '20 tons');
});

test('A6 automatically refreshes A3 and A4 then resumes the same buyer message', async () => {
  const store = createMemoryOpportunityStore();
  const opportunity = store.upsertSeed({
    seed_key: 'a2:seller:buyer:delivery',
    seller: { id: 'seller' },
    buyer: { id: 'buyer', name: 'Buyer' },
    status: 'ACTIVE',
    stage: 'CONTACTED',
    fields: {},
    evidence_ids: ['ev_seed']
  });
  const orchestrator = createQianPulseSkillOrchestrator({ opportunityStore: store, clock: () => '2026-08-29T02:20:00Z', dependencyRunners: {
    'qianpulse.a3.purchase_timing': dependencyRunner('qianpulse.a3.purchase_timing'),
    'qianpulse.a4.supply_match': dependencyRunner('qianpulse.a4.supply_match')
  } });
  const result = await orchestrator.runBuyerProgression({
    opportunityId: opportunity.id,
    event: { event_id: 'evt2', event_type: 'BUYER_MESSAGE', content: 'What is your delivery lead time?', evidence_ref: 'ev_delivery' },
    sellerContext: { delivery: '20 days', moq: '500 kg', capacity: '5 tons/month', seller_sku: { sku: 'matcha-001' }, seller_policy: { allowed_markets: ['US'], payment_terms: ['T/T'] }, evidence_refs: ['seller_delivery_policy', 'seller_moq', 'seller_capacity', 'seller_sku', 'seller_policy', 'reg:US:1'] }
  });
  assert.equal(result.run_status, 'DONE');
  assert.deepEqual(result.dependency_refresh.refreshed_capabilities.sort(), [
    'qianpulse.a3.purchase_timing',
    'qianpulse.a4.supply_match'
  ].sort());
  assert.equal(result.envelope.domain_result.dependency_refresh.required.length, 0);
  const draft = composeReply({ communicationBrief: result.envelope.domain_result.communication_brief });
  assert.match(draft.content, /Lead time: 20 days/);
  assert.equal(result.envelope.domain_result.reply_draft, undefined);
  assert.equal(result.opportunity.stage, 'REPLIED');
});

test('A6 extracts buyer changes, refreshes A3 A4 A5 and persists the new Opportunity facts', async () => {
  const store = createMemoryOpportunityStore();
  const opportunity = store.upsertSeed({
    seed_key: 'a2:seller:buyer:multi-change',
    seller: { id: 'seller' },
    buyer: { id: 'buyer', name: 'Buyer' },
    status: 'ACTIVE',
    stage: 'CONTACTED',
    fields: { quantity: '5 tons', destination: 'US' },
    evidence_ids: ['ev_seed']
  });
  const orchestrator = createQianPulseSkillOrchestrator({ opportunityStore: store, clock: () => '2026-08-29T02:30:00Z', dependencyRunners: {
    'qianpulse.a3.purchase_timing': dependencyRunner('qianpulse.a3.purchase_timing'),
    'qianpulse.a4.supply_match': dependencyRunner('qianpulse.a4.supply_match'),
    'qianpulse.a5.trade_risk': dependencyRunner('qianpulse.a5.trade_risk')
  } });
  const result = await orchestrator.runBuyerProgression({
    opportunityId: opportunity.id,
    event: {
      event_id: 'evt3',
      event_type: 'BUYER_MESSAGE',
      content: 'We need 20 tons. Please deliver 20 tons to Germany by October 2026. What is your delivery lead time?',
      evidence_ref: 'ev_multi_change'
    },
    sellerContext: {
      capacity: '30 tons/month',
      delivery: '20 days',
      market_access: 'EU distribution allowed',
      seller_sku: { sku: 'matcha-001' },
      seller_policy: { allowed_markets: ['DE'], payment_terms: ['T/T'] },
      evidence_refs: ['seller_capacity', 'seller_delivery', 'seller_market_access', 'seller_sku', 'seller_policy', 'reg:DE:1', 'seller_moq']
    }
  });

  assert.equal(result.run_status, 'DONE');
  assert.deepEqual(result.dependency_refresh.refreshed_capabilities.sort(), [
    'qianpulse.a3.purchase_timing',
    'qianpulse.a4.supply_match',
    'qianpulse.a5.trade_risk'
  ].sort());
  assert.equal(result.opportunity.fields.quantity, '20 tons');
  assert.equal(result.opportunity.fields.destination, 'Germany');
  assert.equal(result.opportunity.fields.delivery_date, 'October 2026');
  assert.equal(result.opportunity.a6.pending_structured_extraction.length, 0);
  assert.equal(result.envelope.domain_result.dependency_refresh.required.length, 0);
  const draft = composeReply({ communicationBrief: result.envelope.domain_result.communication_brief });
  assert.match(draft.content, /Lead time: 20 days/);
  assert.deepEqual(result.trace.map(item => `${item.capability_id}:${item.phase}`), [
    'qianpulse.a6.opportunity_progression:ANALYSIS',
    'qianpulse.a3.purchase_timing:REFRESH',
    'qianpulse.a4.supply_match:REFRESH',
    'qianpulse.a5.trade_risk:REFRESH',
    'qianpulse.a6.opportunity_progression:FINAL'
  ]);
});
