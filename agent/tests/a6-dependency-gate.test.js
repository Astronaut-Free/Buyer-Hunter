import test from 'node:test';
import assert from 'node:assert/strict';
import { applyA6DependencyGate } from '../skill-runtime/a6-dependency-gate.js';

function envelope(overrides = {}) {
  return {
    capability_id: 'qianpulse.a6.opportunity_progression',
    capability_version: '1.1.0',
    run_status: 'DONE',
    changed_fields: ['quantity'], missing_evidence: [], evidence_refs: [], human_review_required: true, error: null,
    domain_result: {
      affected_skills: ['qianpulse.a4.supply_match'],
      next_action: {
        action: 'ANSWER_WITH_EVIDENCE', reason: 'reply', owner: 'AGENT', execution_mode: 'APPROVAL',
        prerequisites: [], success_condition: '', stop_condition: '', due_at: null
      },
      decision_state: 'PROCEED', communication_brief: { allowed_claims: [] },
      ...overrides
    }
  };
}

test('Agent gate waits when a dependency result has no matching input hash', () => {
  const result = applyA6DependencyGate(envelope(), { skillResults: {}, inputHashes: { 'qianpulse.a4.supply_match': 'hash-1' } });
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.domain_result.next_action.action, 'WAIT');
  assert.deepEqual(result.domain_result.dependency_refresh.required, ['qianpulse.a4.supply_match']);
  assert.equal(result.domain_result.communication_brief, null);
});

test('Agent gate proceeds only with a fresh hash-matched dependency result', () => {
  const result = applyA6DependencyGate(envelope(), {
    skillResults: { a4: { run_status: 'DONE', input_hash: 'hash-1' } },
    inputHashes: { 'qianpulse.a4.supply_match': 'hash-1' }
  });
  assert.equal(result.run_status, 'DONE');
  assert.equal(result.domain_result.next_action.action, 'ANSWER_WITH_EVIDENCE');
  assert.deepEqual(result.domain_result.dependency_refresh.required, []);
});

test('high-risk HUMAN takeover is preserved while refresh is stale', () => {
  const highRisk = envelope({
    next_action: {
      action: 'HUMAN_TAKEOVER', reason: 'payment terms', owner: 'INTERNAL', execution_mode: 'HUMAN',
      prerequisites: [], success_condition: '', stop_condition: '', due_at: null
    }
  });
  const result = applyA6DependencyGate(highRisk, { skillResults: {}, inputHashes: { 'qianpulse.a4.supply_match': 'hash-1' } });
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.domain_result.next_action.action, 'HUMAN_TAKEOVER');
  assert.equal(result.domain_result.next_action.execution_mode, 'HUMAN');
  assert.equal(result.human_review_required, true);
});
