import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2ProviderPipeline } from '../skill-runtime/a2-pipeline.js';

test('A2 provider pipeline discovers company then contact and reaches READY', async () => {
  const calls = [];
  const pipeline = createA2ProviderPipeline();
  const result = await pipeline({
    input: {
      seller: { seller_id: 's1', company_id: 'c1', product_id: 'p1', company_name: 'Guizhou Tea', product_name: 'Matcha' },
      target: { countries: ['US'], product_keywords: ['matcha'] },
      buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] },
      constraints: { max_candidates: 20, language: 'en', contact_limit_per_company: 2 },
      execution: { channel: 'email', human_gate: true, campaign_id: 12 },
      dependencies: { a4: { run_status: 'DONE' }, a5: { run_status: 'DONE' } }
    },
    providers: {
      trade_data: { async searchBuyers() { calls.push('trade'); return { companies: [{ buyer_company_id: 'c1', legal_or_display_name: 'Buyer One', domain: 'buyer.example', sells_or_uses_product: true, product_evidence: ['ev_product'], trade_evidence: ['ev_trade'], evidence_refs: ['ev_company'] }] }; } },
      contact_data: { async findDecisionMakers() { calls.push('contact'); return [{ work_email: 'p@buyer.example', title: 'Procurement Manager', source_refs: ['ev_contact'] }]; } }
    }
  });
  assert.deepEqual(calls, ['trade', 'contact']);
  assert.equal(result.domain_result.outreach_readiness.status, 'READY');
  assert.equal(result.domain_result.provider_trace.selected_company_id, 'c1');
});

test('A2 provider pipeline stops at company evidence when domain is absent', async () => {
  const pipeline = createA2ProviderPipeline();
  const result = await pipeline({
    input: {
      seller: { seller_id: 's1', company_id: 'c1', product_id: 'p1', company_name: 'Guizhou Tea', product_name: 'Matcha' },
      target: { countries: ['US'], product_keywords: ['matcha'] },
      buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement'] },
      constraints: { max_candidates: 20, language: 'en', contact_limit_per_company: 2 },
      execution: { channel: 'email', human_gate: true, campaign_id: 12 },
      dependencies: { a4: { run_status: 'DONE' }, a5: { run_status: 'DONE' } }
    },
    providers: { trade_data: { async searchBuyers() { return { companies: [{ buyer_company_id: 'c1', sells_or_uses_product: true, product_evidence: ['ev_product'], evidence_refs: ['ev_company'] }] }; } } }
  });
  assert.equal(result.run_status, 'MORE_EVIDENCE');
});
