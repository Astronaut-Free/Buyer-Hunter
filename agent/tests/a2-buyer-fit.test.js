import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateA2BuyerFit } from '../skill-runtime/a2-buyer-fit.js';

const target = { countries: ['US'], buyer_company_types: ['IMPORTER'], excluded_company_types: ['MANUFACTURER'] };

test('buyer fit is evidence-quality weighted and never emits purchase intent', () => {
  const fit = evaluateA2BuyerFit({ legal_or_display_name: 'Buyer', country: 'US', domain: 'buyer.example', buyer_type: 'IMPORTER', sells_or_uses_product: true, product_evidence: ['ev_product'], trade_evidence: ['ev_trade'], evidence_refs: ['ev_company'], number_of_shipments: 1000 }, target);
  assert.equal(fit.product_relevance.value, 'DIRECT');
  assert.equal(fit.decision, 'FIT_QUALIFIED');
  assert.equal(fit.score_components.business_evidence, 16);
  assert.equal('intent_score' in fit, false);
  assert.equal('purchase_probability' in fit, false);
});

test('excluded buyer type cannot receive a high fit score', () => {
  const fit = evaluateA2BuyerFit({ name: 'Factory', country: 'US', domain: 'factory.example', buyer_type: 'MANUFACTURER', product_evidence: ['evp'], trade_evidence: ['evt'], evidence_refs: ['evc'], sells_or_uses_product: true }, target);
  assert.equal(fit.decision, 'FIT_REJECTED');
  assert.equal(fit.score_components.buyer_type_fit, 0);
});
