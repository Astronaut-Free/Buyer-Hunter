import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateA2ContactFit } from '../skill-runtime/a2-contact-fit.js';

test('contact must bind to the buyer company domain', () => {
  const result = evaluateA2ContactFit({ title: 'Procurement Manager', work_email: 'buyer@xyz.com', email_status: 'verified', source_refs: ['ev'] }, { buyer_company_id: 'b1', domain: 'abc.com' });
  assert.equal(result.status, 'MORE_EVIDENCE');
  assert.equal(result.reason, 'CONTACT_COMPANY_MISMATCH');
});

test('personal email is not automatically outreach ready', () => {
  const result = evaluateA2ContactFit({ title: 'Owner', work_email: 'buyer@gmail.com', email_status: 'verified', source_refs: ['ev'] }, { buyer_company_id: 'b1', domain: 'gmail.com' });
  assert.equal(result.status, 'MORE_EVIDENCE');
  assert.equal(result.reason, 'PERSONAL_EMAIL_REQUIRES_EXPLICIT_REVIEW');
});
