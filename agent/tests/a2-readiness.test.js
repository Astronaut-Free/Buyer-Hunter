import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOutreachReadiness } from '../skill-runtime/a2.js';

const base = { buyerCompany: { buyer_company_id: 'b1' }, buyerFit: { decision: 'FIT_QUALIFIED', evidence_refs: ['ev'] }, contact: { work_email: 'p@b.example' }, contactFit: { status: 'READY' }, seller: { company_name: 'Seller', product_id: 'p1' }, a4Result: { run_status: 'DONE' }, a5Result: { run_status: 'DONE' }, execution: { human_gate: true, campaign_id: 12 } };

test('missing campaign cannot become READY', () => {
  const result = evaluateOutreachReadiness({ ...base, execution: { human_gate: true } });
  assert.equal(result.status, 'MORE_EVIDENCE');
  assert.equal(result.reason, 'TRANSPORT_CAMPAIGN_REQUIRED');
});

test('A5 BLOCKED forbids outreach', () => {
  const result = evaluateOutreachReadiness({ ...base, a5Result: { run_status: 'BLOCKED' } });
  assert.equal(result.status, 'BLOCKED');
});

test('human gate cannot be disabled', () => {
  const result = evaluateOutreachReadiness({ ...base, execution: { human_gate: false, campaign_id: 12 } });
  assert.equal(result.status, 'BLOCKED');
});
