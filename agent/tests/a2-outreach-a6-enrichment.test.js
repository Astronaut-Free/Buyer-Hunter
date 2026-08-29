import test from 'node:test';
import assert from 'node:assert/strict';
import { generateA2OutreachDraft } from '../skill-runtime/a2-outreach.js';
import { runA6Skill } from '../skill-runtime/a6.js';
import { composeReply } from '../services/reply-composer.js';

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

function a6Input(content, skillResults = {}) {
  return {
    opportunity_id: 'opp1',
    evaluated_at: '2026-08-29T00:00:00Z',
    trigger_event: { event_id: 'evt1', event_type: 'BUYER_MESSAGE', timestamp: '2026-08-29T00:00:00Z', evidence_ref: 'ev-msg' },
    conversation_context: { latest_message: { content, evidence_ref: 'ev-msg' } },
    opportunity_state: { status: 'ACTIVE', stage: 'QUALIFYING', fields: {} },
    skill_results: skillResults,
    seller_execution_policy: {},
    field_updates: {}
  };
}

test('A6 asks seller for evidence instead of inventing MOQ', () => {
  const result = runA6Skill(a6Input('What is your MOQ?'));
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.domain_result.next_action.action, 'REQUEST_MORE_EVIDENCE');
  assert.equal(result.domain_result.communication_brief, null);
});

test('Reply Composer drafts only from A6 verified MOQ communication brief', () => {
  const a4 = {
    capability_id: 'qianpulse.a4.supply_match', run_status: 'DONE', evidence_refs: ['seller:capacity:1'],
    domain_result: { verified_facts: { capacity_or_moq: '500 kg' } }
  };
  const result = runA6Skill(a6Input('What is your MOQ?', { a4 }));
  const draft = composeReply({ communicationBrief: result.domain_result.communication_brief });
  assert.match(draft.content, /500 kg/);
  assert.equal(draft.prohibited_claims_checked, true);
  assert.equal(result.domain_result.reply_draft, undefined);
});

test('A6 interested buyer gets one key qualification question', () => {
  const result = runA6Skill(a6Input('We are interested.'));
  const draft = composeReply({ communicationBrief: result.domain_result.communication_brief });
  assert.equal(result.domain_result.key_question.audience, 'BUYER');
  assert.match(draft.content, /purchase quantity/i);
});
