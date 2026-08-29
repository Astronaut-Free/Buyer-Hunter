import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandboxTradeProvider, createSandboxContactProvider } from '../providers/sandbox.js';
import { createA2BatchPipeline } from '../skill-runtime/a2-batch.js';
import { evaluateBuyerFit } from '../skill-runtime/a2.js';

const A2_INPUT = {
  seller: { seller_id: 's1', company_id: 'c1', product_id: 'p1', company_name: '贵州黔茶产业有限公司', product_name: '贵州抹茶粉 · 饮品级' },
  target: { countries: ['US'], product_keywords: ['matcha'] },
  buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] },
  constraints: { max_candidates: 10, language: 'en', contact_limit_per_company: 1 },
  execution: { channel: 'email', human_gate: true },
};

test('trade provider returns Trademo-shaped companies filtered by country + keyword', async () => {
  const provider = createSandboxTradeProvider();
  const out = await provider.searchBuyers({ countries: ['US'], product_keywords: ['matcha'], hs_codes: [], page_size: 20 });
  assert.equal(out.provider, 'sandbox');
  assert.ok(out.companies.length >= 5, `expected >=5 US matcha buyers, got ${out.companies.length}`);
  for (const c of out.companies) {
    assert.equal(c.country, 'US');
    assert.equal(c.data_mode, 'SANDBOX');
    assert.equal(c.sells_or_uses_product, true);
    for (const field of ['buyer_company_id', 'legal_or_display_name', 'domain', 'why_fit']) {
      assert.ok(c[field], `${field} missing`);
    }
    assert.ok(c.evidence_refs.length + c.product_evidence.length + c.trade_evidence.length >= 2);
  }
  // sorted by shipments desc
  const shipments = out.companies.map(c => c.number_of_shipments);
  assert.deepEqual(shipments, [...shipments].sort((a, b) => b - a));
});

test('every discovered company scores high buyer-fit (drives outreach readiness)', async () => {
  const provider = createSandboxTradeProvider();
  const { companies } = await provider.searchBuyers({ countries: ['US'], product_keywords: ['matcha'] });
  for (const company of companies) {
    const fit = evaluateBuyerFit(company);
    assert.equal(fit.product_relevance, 'yes');
    assert.equal(fit.confidence, 'high');
  }
});

test('country filter accepts ISO, English and Chinese aliases', async () => {
  const provider = createSandboxTradeProvider();
  const byIso = await provider.searchBuyers({ countries: ['JP'], product_keywords: ['matcha'] });
  const byEn = await provider.searchBuyers({ countries: ['Japan'], product_keywords: ['matcha'] });
  const byZh = await provider.searchBuyers({ countries: ['日本'], product_keywords: ['matcha'] });
  assert.ok(byIso.companies.length > 0);
  assert.deepEqual(byEn.companies.map(c => c.buyer_company_id), byIso.companies.map(c => c.buyer_company_id));
  assert.deepEqual(byZh.companies.map(c => c.buyer_company_id), byIso.companies.map(c => c.buyer_company_id));
});

test('contact provider returns an Apollo-shaped decision maker on the company domain', async () => {
  const contacts = createSandboxContactProvider();
  const list = await contacts.findDecisionMakers({ domain: 'pacificleaf.example', titles: ['Procurement Manager'], limit: 1 });
  assert.equal(list.length, 1);
  const c = list[0];
  assert.equal(c.buyer_company_id, 'sbx-us-01');
  assert.match(c.work_email, /@pacificleaf\.example$/);
  assert.equal(c.email_status, 'verified');
  assert.equal(c.data_mode, 'SANDBOX');
  assert.ok(c.source_refs.length > 0);
});

test('contact lookup is deterministic and empty for unknown domains', async () => {
  const contacts = createSandboxContactProvider();
  const a = await contacts.findDecisionMakers({ domain: 'yokohamafoods.example', limit: 2 });
  const b = await contacts.findDecisionMakers({ domain: 'https://www.yokohamafoods.example/about', limit: 2 });
  assert.deepEqual(a, b);
  assert.deepEqual(await contacts.findDecisionMakers({ domain: 'nope.example' }), []);
  await assert.rejects(() => contacts.findDecisionMakers({}), /domain required/);
});

test('A2 batch pipeline reaches READY outreach drafts using only sandbox providers', async () => {
  const runA2Batch = createA2BatchPipeline();
  const result = await runA2Batch({
    input: A2_INPUT,
    providers: { trade_data: createSandboxTradeProvider(), contact_data: createSandboxContactProvider() },
    maxReady: 3,
  });
  assert.equal(result.status, 'DONE');
  assert.ok(result.summary.ready >= 1, `expected >=1 ready, got ${result.summary.ready}`);
  const ready = result.opportunity_candidates.filter(c => c.readiness === 'READY');
  assert.ok(ready.length >= 1);
  const draft = ready[0].envelope.domain_result.outreach;
  assert.ok(draft, 'outreach draft missing');
  assert.ok(draft.subject && draft.content);
  assert.equal(draft.prohibited_claims_checked, true);
  assert.ok(draft.evidence_refs.length > 0);
});
