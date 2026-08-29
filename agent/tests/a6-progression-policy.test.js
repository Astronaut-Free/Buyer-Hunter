import test from 'node:test';
import assert from 'node:assert/strict';
import { buildA6Progression } from '../skill-runtime/a6/progression-policy.js';

const state = { stage: 'QUALIFYING', fields: {} };

test('A4 NEED_MORE_DATA produces VERIFY and seller evidence request', () => {
  const result = buildA6Progression({
    intent: { primary: 'DELIVERY_REQUEST', secondary: [] }, opportunityState: state,
    skillResults: { a4: { run_status: 'MORE_EVIDENCE', missing_evidence: ['delivery'] } }
  });
  assert.equal(result.decision_state, 'VERIFY');
  assert.equal(result.next_action.action, 'REQUEST_MORE_EVIDENCE');
  assert.equal(result.run_status, 'MORE_EVIDENCE');
});

test('unknown intent requires human judgment and no communication brief', () => {
  const result = buildA6Progression({ intent: { primary: 'UNKNOWN', secondary: [] }, opportunityState: state });
  assert.equal(result.decision_state, 'HUMAN');
  assert.equal(result.next_action.action, 'REQUEST_APPROVAL');
  assert.equal(result.communication_brief, null);
});

test('A3 UNKNOWN cannot become a timing claim', () => {
  const result = buildA6Progression({
    intent: { primary: 'DELIVERY_REQUEST', secondary: [] }, opportunityState: state,
    skillResults: {
      a3: { run_status: 'MORE_EVIDENCE', domain_result: { window_status: 'UNKNOWN' } },
      a4: { run_status: 'DONE', evidence_refs: ['seller:delivery:1'], domain_result: { verified_facts: { delivery: '20 days' } } }
    }
  });
  assert.equal(result.decision_state, 'VERIFY');
  assert.equal(result.next_action.action, 'ASK_KEY_QUESTION');
  assert.equal(result.communication_brief.allowed_claims.length, 0);
});

test('NOT_NOW enters nurture without inventing a follow-up date', () => {
  const result = buildA6Progression({ intent: { primary: 'NOT_NOW', secondary: [] }, opportunityState: state });
  assert.equal(result.next_action.action, 'ENTER_NURTURE');
  assert.equal(result.follow_up.due_at, null);
  assert.ok(result.next_action.prerequisites.includes('follow_up_time'));
});
