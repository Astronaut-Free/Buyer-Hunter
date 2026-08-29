import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpportunitySeeds } from '../opportunity-seeder.js';

function batch(productId, countries = ['US']) {
  const company = { buyer_company_id: 'b1', buyer_company_key: 'buyer_stable', legal_or_display_name: 'Buyer', domain: 'buyer.example' };
  const envelope = { evidence_refs: ['ev1'], domain_result: { target_definition: { countries }, buyer_company: company, buyer_fit: { decision: 'FIT_QUALIFIED', evidence_refs: ['ev1'] }, contact: { contact_id: 'c1', work_email: 'p@buyer.example' }, outreach: { subject: 'Hi', content: 'Body' }, outreach_readiness: { status: 'READY' } } };
  return { target_definition: { countries }, opportunity_candidates: [{ readiness: 'READY', buyer_fit: envelope.domain_result.buyer_fit, buyer_company_key: 'buyer_stable', rank_score: 80, envelope }], productId };
}

test('A2 seed keys are seller × product × market × buyer scoped', () => {
  const seller = { seller_id: 's1', company_name: 'Seller' };
  const matcha = createOpportunitySeeds({ batchResult: batch('matcha'), seller, product: { id: 'matcha', name: 'Matcha' } });
  const chili = createOpportunitySeeds({ batchResult: batch('chili'), seller, product: { id: 'chili', name: 'Chili' } });
  assert.notEqual(matcha[0].seed_key, chili[0].seed_key);
  const markets = createOpportunitySeeds({ batchResult: batch('matcha', ['JP', 'US']), seller, product: { id: 'matcha', name: 'Matcha' } });
  assert.equal(new Set(markets.map(item => item.development_context_id)).size, 2);
});
