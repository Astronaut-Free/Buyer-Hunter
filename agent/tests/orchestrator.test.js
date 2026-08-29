import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryOpportunityStore } from '../opportunity-store.js';
import { createQianPulseSkillOrchestrator } from '../qianpulse-skill-orchestrator.js';

const input = {
  seller: { seller_id: 'seller1', company_id: 'company1', product_id: 'p1', company_name: 'Guizhou Tea', product_name: 'Matcha' },
  target: { countries: ['US'], product_keywords: ['matcha'] },
  buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] },
  constraints: { max_candidates: 5, language: 'en', contact_limit_per_company: 1 },
  execution: { channel: 'email', human_gate: true }
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

test('A6 buyer progression keeps waiting when automatic dependency refresh lacks seller evidence', () => {
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
  const orchestrator = createQianPulseSkillOrchestrator({ opportunityStore: store, clock: () => '2026-08-29T02:10:00Z' });
  const result = orchestrator.runBuyerProgression({
    opportunityId: opportunity.id,
    event: { event_id: 'evt1', event_type: 'BUYER_MESSAGE', content: 'We need 20 tons. What is your delivery lead time?', evidence_ref: 'ev_reply' },
    sellerContext: { delivery: '20 days' }
  });
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.opportunity.id, opportunity.id);
  assert.equal(result.opportunity.status, 'WAITING_EVIDENCE');
  assert.ok(result.envelope.domain_result.dependency_refresh.required.includes('qianpulse.a4.supply_match'));
  assert.ok(result.dependency_refresh.refreshed_capabilities.includes('qianpulse.a3.purchase_timing'));
  assert.ok(result.opportunity.evidence_ids.includes('ev_reply'));
  assert.equal(result.opportunity.fields.quantity, '20 tons');
});

test('A6 automatically refreshes A3 and A4 then resumes the same buyer message', () => {
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
  const orchestrator = createQianPulseSkillOrchestrator({ opportunityStore: store, clock: () => '2026-08-29T02:20:00Z' });
  const result = orchestrator.runBuyerProgression({
    opportunityId: opportunity.id,
    event: { event_id: 'evt2', event_type: 'BUYER_MESSAGE', content: 'What is your delivery lead time?', evidence_ref: 'ev_delivery' },
    sellerContext: { delivery: '20 days', evidence_refs: ['seller_delivery_policy'] }
  });
  assert.equal(result.run_status, 'DONE');
  assert.deepEqual(result.dependency_refresh.refreshed_capabilities.sort(), [
    'qianpulse.a3.purchase_timing',
    'qianpulse.a4.supply_match',
    'qianpulse.a8.deal_action'
  ].sort());
  assert.equal(result.envelope.domain_result.dependency_refresh.required.length, 0);
  assert.match(result.envelope.domain_result.reply_draft.content, /Lead time: 20 days/);
  assert.equal(result.opportunity.stage, 'REPLIED');
});

test('A6 extracts buyer changes, refreshes A3 A4 A5 and persists the new Opportunity facts', () => {
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
  const orchestrator = createQianPulseSkillOrchestrator({ opportunityStore: store, clock: () => '2026-08-29T02:30:00Z' });
  const result = orchestrator.runBuyerProgression({
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
      evidence_refs: ['seller_capacity', 'seller_delivery', 'seller_market_access']
    }
  });

  assert.equal(result.run_status, 'DONE');
  assert.deepEqual(result.dependency_refresh.refreshed_capabilities.sort(), [
    'qianpulse.a3.purchase_timing',
    'qianpulse.a4.supply_match',
    'qianpulse.a5.trade_risk',
    'qianpulse.a8.deal_action'
  ].sort());
  assert.equal(result.opportunity.fields.quantity, '20 tons');
  assert.equal(result.opportunity.fields.destination, 'Germany');
  assert.equal(result.opportunity.fields.delivery_date, 'October 2026');
  assert.equal(result.opportunity.a6.pending_structured_extraction.length, 0);
  assert.equal(result.envelope.domain_result.dependency_refresh.required.length, 0);
  assert.match(result.envelope.domain_result.reply_draft.content, /Lead time: 20 days/);
});
