import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2BatchPipeline } from '../skill-runtime/a2-batch.js';

test('one Apollo error yields PARTIAL and preserves other candidates', async () => {
  const input = { seller: { seller_id: 's', company_id: 'co', company_name: 'Seller', product_id: 'p', product_name: 'Matcha' }, target: { countries: ['US'], product_keywords: ['matcha'] }, buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement'] }, constraints: { max_candidates: 3, language: 'en', contact_limit_per_company: 1 }, execution: { channel: 'email', human_gate: true, campaign_id: 1 }, dependencies: { a4: { run_status: 'DONE' }, a5: { run_status: 'DONE' } } };
  const companies = ['one', 'two', 'three'].map(id => ({ id, legal_or_display_name: id, country: 'US', domain: `${id}.example`, buyer_type: 'IMPORTER', sells_or_uses_product: true, product_evidence: [`evp-${id}`], trade_evidence: [`evt-${id}`], evidence_refs: [`evc-${id}`] }));
  const result = await createA2BatchPipeline()({ input, providers: { trade_data: { async searchBuyers() { return { companies }; } }, contact_data: { async findDecisionMakers({ domain }) { if (domain === 'two.example') throw new Error('Apollo down'); return [{ title: 'Procurement', work_email: `p@${domain}`, email_status: 'verified', source_refs: [`contact-${domain}`] }]; } } } });
  assert.equal(result.batch_status, 'PARTIAL');
  assert.equal(result.candidates.length, 3);
  assert.equal(result.summary.errors, 1);
  assert.equal(result.summary.ready, 2);
});
