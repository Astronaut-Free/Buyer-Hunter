import test from 'node:test';
import assert from 'node:assert/strict';
import { runA6Skill } from '../skill-runtime/a6.js';

function run(content, skillResults = {}) {
  return runA6Skill({
    opportunity_id: 'opp1', latest_buyer_message: { content, evidence_ref: 'conversation:m1' },
    trigger_event: { event_type: 'BUYER_MESSAGE', evidence_ref: 'conversation:m1' },
    opportunity_state: { stage: 'QUALIFYING', fields: {} }, skill_results: skillResults
  });
}

test('A6-G01 unsubscribe stops contact without outbound brief', () => {
  const result = run('Please unsubscribe me.');
  assert.equal(result.domain_result.next_action.action, 'STOP_CONTACT');
  assert.equal(result.domain_result.communication_brief, null);
});

for (const [label, message] of [
  ['COMPLAINT', 'This is unacceptable. I want to complain.'],
  ['PAYMENT', 'Can you accept Net 90 payment terms?'],
  ['PRICE', 'Please send a formal quotation and price.']
]) {
  test(`A6 gate sends ${label} to HUMAN_TAKEOVER`, () => {
    const result = run(message);
    assert.equal(result.domain_result.next_action.action, 'HUMAN_TAKEOVER');
    assert.equal(result.domain_result.next_action.execution_mode, 'HUMAN');
    assert.equal(result.domain_result.communication_brief, null);
  });
}

test('A6-G05 A5 BLOCK prevents any external business action', () => {
  const result = run('What is your delivery lead time?', {
    a5: { run_status: 'BLOCKED', evidence_refs: ['risk:1'], domain_result: { status: 'BLOCKED', decision: 'BLOCKED' } }
  });
  assert.equal(result.run_status, 'BLOCKED');
  assert.equal(result.domain_result.decision_state, 'STOP');
  assert.equal(result.domain_result.communication_brief, null);
  assert.ok(result.evidence_refs.includes('risk:1'));
});

test('allowed outbound claims require evidence references', () => {
  const result = run('What is your delivery lead time?', {
    a4: { run_status: 'DONE', evidence_refs: [], domain_result: { verified_facts: { delivery: '20 days' } } }
  });
  assert.equal(result.domain_result.communication_brief, null);
  assert.equal(result.run_status, 'MORE_EVIDENCE');
});

test('sample creates only an approval task after policy, destination, and A5 checks', () => {
  const result = runA6Skill({
    opportunity_id: 'opp-sample', latest_buyer_message: { content: 'Please send a sample to Japan.', evidence_ref: 'conversation:sample' },
    trigger_event: { event_type: 'BUYER_MESSAGE', evidence_ref: 'conversation:sample' },
    opportunity_state: { stage: 'SOLUTION_FIT', fields: {} },
    seller_execution_policy: { sample_policy: { approved: true, policy_id: 'sample-policy-1' } },
    skill_results: { a5: { run_status: 'DONE', evidence_refs: ['risk:japan:1'], domain_result: { status: 'REVIEWED' } } }
  });
  assert.equal(result.domain_result.next_action.action, 'CREATE_SAMPLE_TASK');
  assert.equal(result.domain_result.next_action.execution_mode, 'APPROVAL');
  assert.equal(result.domain_result.communication_brief, null);
});
