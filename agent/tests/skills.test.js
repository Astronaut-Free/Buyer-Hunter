import test from 'node:test';
import assert from 'node:assert/strict';
import { runA2Skill, evaluateOutreachReadiness, decidePreReplyFollowup } from '../skill-runtime/a2.js';
import { runA6Skill, classifyReplyIntent } from '../skill-runtime/a6.js';

const target = {
  seller: { seller_id: 's1', company_id: 'c1', product_id: 'p1' },
  target: { countries: ['US'], product_keywords: ['matcha'] },
  buyer_profile: { company_types: ['importer'], buyer_roles: ['procurement'] },
  constraints: { max_candidates: 20, language: 'en', contact_limit_per_company: 2 },
  execution: { channel: 'email', human_gate: true }
};

test('A2 requires buyer evidence before READY', () => {
  const result = runA2Skill(target);
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.domain_result.outreach_readiness.status, 'MORE_EVIDENCE');
});

test('A2 READY only after company, fit evidence and bound contact', () => {
  const readiness = evaluateOutreachReadiness({
    buyerCompany: { buyer_company_id: 'b1' },
    buyerFit: { product_relevance: 'yes', evidence_refs: ['ev1'] },
    contact: { buyer_company_id: 'b1', work_email: 'buyer@example.com' }
  });
  assert.equal(readiness.status, 'READY');
});

test('A2 hands off after reply', () => {
  assert.equal(decidePreReplyFollowup({ hasReply: true }).status, 'HANDOFF_A6');
});

test('A6 detects changed quantity and destination and invalidates only related skills', () => {
  const result = runA6Skill({
    opportunity_id: 'opp1',
    latest_buyer_message: { content: 'We need 20 tons, not 5 tons, and shipment should go to Dubai.' },
    opportunity_state: { stage: 'QUALIFYING', fields: { quantity: '5 tons', destination: 'Doha' } },
    field_updates: { quantity: '20 tons', destination: 'Dubai' },
    seller_context: {}
  });
  const fields = result.domain_result.changed_business_fields.map(item => item.field);
  assert.deepEqual(fields.sort(), ['destination', 'quantity']);
  assert.deepEqual(result.domain_result.invalidated_capabilities.sort(), ['qianpulse.a4.supply_match', 'qianpulse.a5.trade_risk']);
});

test('A6 formal price and payment discussion requires HUMAN', () => {
  const result = runA6Skill({
    opportunity_id: 'opp2',
    latest_buyer_message: { content: 'Please send your formal quotation and payment terms.' },
    opportunity_state: { stage: 'SOLUTION_FIT', fields: {} },
    seller_context: {}
  });
  assert.equal(result.domain_result.execution_mode, 'HUMAN');
  assert.equal(result.domain_result.next_action.action, 'HUMAN_TAKEOVER');
});

test('A6 unsubscribe stops contact', () => {
  const result = runA6Skill({
    opportunity_id: 'opp3',
    latest_buyer_message: { content: 'unsubscribe me' },
    opportunity_state: { stage: 'REPLIED', fields: {} },
    seller_context: {}
  });
  assert.equal(result.domain_result.next_action.action, 'STOP_CONTACT');
  assert.equal(result.domain_result.stage.after, 'STOPPED');
});

test('A6 sample request without policy asks for evidence', () => {
  const result = runA6Skill({
    opportunity_id: 'opp4',
    latest_buyer_message: { content: 'Can you send samples?' },
    opportunity_state: { stage: 'SOLUTION_FIT', fields: {} },
    seller_context: {}
  });
  assert.equal(result.domain_result.next_action.action, 'REQUEST_MORE_EVIDENCE');
  assert.equal(result.domain_result.execution_mode, 'APPROVAL');
});

test('A6 acknowledgement does not invent changed fields', () => {
  const result = runA6Skill({
    opportunity_id: 'opp5',
    latest_buyer_message: { content: 'Thanks, received.' },
    opportunity_state: { stage: 'QUALIFYING', fields: {} },
    seller_context: {}
  });
  assert.deepEqual(result.domain_result.changed_business_fields, []);
  assert.equal(result.domain_result.next_action.action, 'WAIT');
});

test('intent classifier keeps high-risk payment ahead of generic price', () => {
  const intent = classifyReplyIntent('Please send quotation and payment terms');
  assert.equal(intent.primary, 'PAYMENT_TERMS');
  assert.ok(intent.secondary.includes('PRICE_REQUEST'));
});
