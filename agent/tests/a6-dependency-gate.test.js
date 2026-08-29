import test from 'node:test';
import assert from 'node:assert/strict';
import { applyA6DependencyGate } from '../skill-runtime/a6-dependency-gate.js';

function envelope(overrides = {}) {
  return {
    capability_id: 'qianpulse.a6.opportunity_progression',
    capability_version: '1.0.0',
    run_status: 'DONE',
    changed_fields: ['quantity'],
    missing_evidence: [],
    evidence_refs: [],
    human_review_required: true,
    error: null,
    domain_result: {
      invalidated_capabilities: ['qianpulse.a4.supply_match'],
      next_action: { action: 'ANSWER_WITH_EVIDENCE', reason: 'reply', prerequisites: ['refresh_invalidated_capabilities'] },
      execution_mode: 'APPROVAL',
      reply_draft: { content: 'draft' },
      human_review_required: true,
      ...overrides
    }
  };
}

test('A6 waits before normal external action when dependencies are stale', () => {
  const result = applyA6DependencyGate(envelope());
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.domain_result.next_action.action, 'WAIT');
  assert.deepEqual(result.domain_result.dependency_refresh.required, ['qianpulse.a4.supply_match']);
  assert.equal(result.domain_result.reply_draft, null);
});

test('A6 proceeds after all invalidated dependencies refreshed', () => {
  const result = applyA6DependencyGate(envelope(), { refreshedCapabilities: ['qianpulse.a4.supply_match'] });
  assert.equal(result.run_status, 'DONE');
  assert.equal(result.domain_result.next_action.action, 'ANSWER_WITH_EVIDENCE');
  assert.deepEqual(result.domain_result.dependency_refresh.required, []);
});

test('high-risk HUMAN takeover is preserved while dependency refresh runs', () => {
  const result = applyA6DependencyGate(envelope({ next_action: { action: 'HUMAN_TAKEOVER', reason: 'payment terms', prerequisites: [] }, execution_mode: 'HUMAN' }));
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.domain_result.next_action.action, 'HUMAN_TAKEOVER');
  assert.equal(result.domain_result.execution_mode, 'HUMAN');
  assert.equal(result.human_review_required, true);
});
