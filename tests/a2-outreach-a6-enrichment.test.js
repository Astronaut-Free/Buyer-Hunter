import test from 'node:test';
import assert from 'node:assert/strict';
import { generateA2OutreachDraft } from '../skill-runtime/a2-outreach.js';
import { enrichA6Envelope } from '../skill-runtime/a6-enrichment.js';

test('A2 outreach requires buyer evidence and why_fit', () => {
  const result = generateA2OutreachDraft({ seller: { company_name: 'Guizhou Tea', product_name: 'Matcha' }, buyerCompany: { legal_or_display_name: 'Buyer Inc' }, buyerFit: {}, contact: {} });
  assert.equal(result.status, 'MORE_EVIDENCE');
  assert.equal(result.draft, null);
});

test('A2 outreach generates a low-friction evidence-grounded email', () => {
  const result = generateA2OutreachDraft({
    seller: { company_name: 'Guizhou Tea', product_name: 'Matcha' },
    buyerCompany: { legal_or_display_name: 'Buyer Inc', evidence_refs: ['ev-company'] },
    buyerFit: { why_fit: 'your ingredient distribution portfolio', evidence_refs: ['ev-fit'] },
    contact: { name: 'Alex', source_refs: ['ev-contact'] },
    language: 'en'
  });
  assert.equal(result.status, 'READY');
  assert.match(result.draft.content, /Would it be useful/);
  assert.equal(result.draft.prohibited_claims_checked, true);
});

function baseEnvelope(intent, action) {
  return {
    capability_id: 'qianpulse.a6.opportunity_progression',
    capability_version: '1.0.0',
    run_status: 'DONE',
    changed_fields: [],
    missing_evidence: [],
    evidence_refs: ['ev-msg'],
    human_review_required: true,
    domain_result: {
      buyer_reply: { intent: { primary: intent, secondary: [] } },
      next_action: { action, reason: 'test', prerequisites: [] },
      execution_mode: 'APPROVAL',
      reply_draft: null,
      human_review_required: true
    }
  };
}

test('A6 asks seller for evidence instead of inventing MOQ', () => {
  const result = enrichA6Envelope(baseEnvelope('MOQ_SPEC_REQUEST', 'ANSWER_WITH_EVIDENCE'), { sellerContext: {}, opportunityState: {} });
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.domain_result.next_action.action, 'REQUEST_MORE_EVIDENCE');
  assert.equal(result.domain_result.key_question.audience, 'SELLER');
});

test('A6 can draft verified MOQ answer when seller fact exists', () => {
  const result = enrichA6Envelope(baseEnvelope('MOQ_SPEC_REQUEST', 'ANSWER_WITH_EVIDENCE'), { sellerContext: { moq: '500 kg' }, opportunityState: {} });
  assert.match(result.domain_result.reply_draft.content, /500 kg/);
  assert.equal(result.domain_result.reply_draft.prohibited_claims_checked, true);
});

test('A6 interested buyer gets one key qualification question', () => {
  const result = enrichA6Envelope(baseEnvelope('INTERESTED', 'ASK_KEY_QUESTION'), { sellerContext: {}, opportunityState: {} });
  assert.equal(result.domain_result.key_question.audience, 'BUYER');
  assert.match(result.domain_result.reply_draft.content, /purchase quantity/i);
});
