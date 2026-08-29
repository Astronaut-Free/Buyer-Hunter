import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2BatchPipeline } from '../skill-runtime/a2-batch.js';
import { createOpportunitySeeds } from '../opportunity-seeder.js';

const input = {
  seller: { seller_id: 'seller1', company_id: 'company1', product_id: 'p1', company_name: 'Guizhou Tea', product_name: 'Matcha' },
  target: { countries: ['US'], product_keywords: ['matcha'] },
  buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] },
  constraints: { max_candidates: 10, language: 'en', contact_limit_per_company: 1 },
  execution: { channel: 'email', human_gate: true }
};

function company(id, shipments) {
  return {
    buyer_company_id: id,
    legal_or_display_name: `Buyer ${id}`,
    country: 'US',
    domain: `${id}.example`,
    sells_or_uses_product: true,
    buyer_type: 'importer',
    why_fit: 'relevant ingredient importing activity',
    number_of_shipments: shipments,
    evidence_refs: [`ev_company_${id}`],
    product_evidence: [`ev_product_${id}`],
    trade_evidence: [`ev_trade_${id}`]
  };
}

test('A2 batch controls contact enrichment and ready candidate count', async () => {
  let contactCalls = 0;
  const pipeline = createA2BatchPipeline();
  const result = await pipeline({
    input,
    maxReady: 2,
    maxContactedCompanies: 2,
    providers: {
      trade_data: { async searchBuyers() { return { companies: [company('c1', 20), company('c2', 10), company('c3', 5)] }; } },
      contact_data: { async findDecisionMakers({ domain }) { contactCalls += 1; return [{ name: 'Buyer', work_email: `procurement@${domain}`, role_reason: 'Procurement Manager', source_refs: [`ev_contact_${domain}`] }]; } }
    }
  });
  assert.equal(result.status, 'DONE');
  assert.equal(result.summary.ready, 2);
  assert.equal(result.summary.contacted_companies, 2);
  assert.equal(contactCalls, 2);
  assert.equal(result.opportunity_candidates.length, 2);
});

test('READY A2 batch candidates become Opportunity seeds with evidence and approval-ready outreach', async () => {
  const pipeline = createA2BatchPipeline();
  const result = await pipeline({
    input,
    maxReady: 1,
    providers: {
      trade_data: { async searchBuyers() { return { companies: [company('c1', 20)] }; } },
      contact_data: { async findDecisionMakers({ domain }) { return [{ name: 'Alex', work_email: `alex@${domain}`, role_reason: 'Procurement Manager', source_refs: ['ev_contact'] }]; } }
    }
  });
  const seeds = createOpportunitySeeds({ batchResult: result, seller: input.seller, createdAt: '2026-08-29T00:00:00Z' });
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].source, 'A2_PROACTIVE_BUYER_DEVELOPMENT');
  assert.equal(seeds[0].status, 'READY_FOR_OUTREACH_APPROVAL');
  assert.ok(seeds[0].evidence_ids.length >= 3);
  assert.match(seeds[0].a2.outreach.content, /Would it be useful/);
});
