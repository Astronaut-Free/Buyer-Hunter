import test from 'node:test';
import assert from 'node:assert/strict';
import { runA6Skill } from '../skill-runtime/a6.js';
import { validateA6Envelope } from '../skill-runtime/validators.js';

test('canonical A6 output passes the v1.1 contract without reply_draft', () => {
  const result = runA6Skill({
    opportunity_id: 'opp1', evaluated_at: '2026-08-29T00:00:00Z',
    trigger_event: { event_id: 'evt1', event_type: 'BUYER_MESSAGE', timestamp: '2026-08-29T00:00:00Z', evidence_ref: 'conversation:m1' },
    conversation_context: { latest_message: { content: 'Thanks, received.', evidence_ref: 'conversation:m1' } },
    opportunity_state: { status: 'ACTIVE', stage: 'QUALIFYING', fields: {} },
    skill_results: { a3: null, a4: null, a5: null }, seller_execution_policy: {}, field_updates: {}
  });
  assert.deepEqual(validateA6Envelope(result), { valid: true, errors: [] });
  assert.equal(result.domain_result.ruleset_version, 'a6-opportunity-progression-v1.1.0');
  assert.equal(Object.hasOwn(result.domain_result, 'reply_draft'), false);
});

test('A6 validator rejects a missing stage transition', () => {
  const result = runA6Skill({ opportunity_id: 'opp1', latest_buyer_message: 'Thanks' });
  delete result.domain_result.stage_transition;
  assert.equal(validateA6Envelope(result).valid, false);
});
