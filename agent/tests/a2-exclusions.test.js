import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2BatchPipeline } from '../skill-runtime/a2-batch.js';

const input = { seller: { seller_id: 's1', company_id: 'co1', company_name: 'Seller', product_id: 'p1', product_name: 'Matcha' }, target: { countries: ['US'], product_keywords: ['matcha'] }, buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement'] }, constraints: { max_candidates: 10, language: 'en', contact_limit_per_company: 1, exclude_domains: ['https://www.abc.com/a'] }, execution: { channel: 'email', human_gate: true, campaign_id: 1 }, dependencies: { a4: { run_status: 'DONE' }, a5: { run_status: 'DONE' } } };

test('excluded domains are normalized and filtered before Apollo', async () => {
  let apolloCalls = 0;
  const result = await createA2BatchPipeline()({ input, providers: { trade_data: { async searchBuyers() { return { companies: [{ id: 'x', legal_or_display_name: 'ABC Foods Inc.', country: 'US', domain: 'www.abc.com', buyer_type: 'IMPORTER', product_evidence: ['evp'], trade_evidence: ['evt'], evidence_refs: ['evc'], sells_or_uses_product: true }] }; } }, contact_data: { async findDecisionMakers() { apolloCalls += 1; return []; } } } });
  assert.equal(result.summary.excluded, 1);
  assert.equal(apolloCalls, 0);
});
