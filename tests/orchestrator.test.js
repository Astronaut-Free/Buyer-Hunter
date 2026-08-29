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

test('A6 buyer progression updates the same Opportunity and waits for dependency refresh when required', async () => {
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
    sellerContext: { delivery: '20 days' },
    refreshedCapabilities: []
  });
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.opportunity.id, opportunity.id);
  assert.equal(result.opportunity.status, 'WAITING_EVIDENCE');
  assert.ok(result.envelope.domain_result.dependency_refresh.required.includes('qianpulse.a4.supply_match'));
  assert.ok(result.opportunity.evidence_ids.includes('ev_reply'));
});
