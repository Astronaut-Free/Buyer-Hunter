import test from 'node:test';
import assert from 'node:assert/strict';
import { runA6Skill } from '../skill-runtime/a6.js';

for (const stage of ['WON', 'LOST', 'STOPPED']) {
  test(`${stage} is terminal for an ordinary buyer message`, () => {
    const result = runA6Skill({
      opportunity_id: `opp-${stage}`, latest_buyer_message: { content: 'What is your lead time?', evidence_ref: 'ev1' },
      trigger_event: { event_type: 'BUYER_MESSAGE', evidence_ref: 'ev1' }, opportunity_state: { stage, fields: {} }
    });
    assert.equal(result.domain_result.stage_transition.after, stage);
    assert.equal(result.domain_result.stage_transition.reason, 'TERMINAL_STATE_LOCKED');
  });
}
