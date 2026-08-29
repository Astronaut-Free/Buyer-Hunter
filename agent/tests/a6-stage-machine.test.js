import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionStage } from '../skill-runtime/a6/stage-machine.js';

const delivery = { primary: 'DELIVERY_REQUEST' };

test('A6-S01 CONTACTED buyer reply moves to REPLIED', () => {
  assert.deepEqual(transitionStage({ currentStage: 'CONTACTED', intent: delivery }), {
    before: 'CONTACTED', after: 'REPLIED', transition_applied: true, reason: 'INTENT_DELIVERY_REQUEST'
  });
});

test('A6-S02 commercial discussion cannot regress on a delivery question', () => {
  const result = transitionStage({ currentStage: 'COMMERCIAL_DISCUSSION', intent: delivery });
  assert.equal(result.after, 'COMMERCIAL_DISCUSSION');
  assert.equal(result.transition_applied, false);
  assert.equal(result.reason, 'ILLEGAL_STAGE_REGRESSION');
});

test('A6-S03 WON ignores ordinary buyer messages', () => {
  const result = transitionStage({ currentStage: 'WON', intent: delivery, triggerEvent: { event_type: 'BUYER_MESSAGE' } });
  assert.equal(result.after, 'WON');
  assert.equal(result.reason, 'TERMINAL_STATE_LOCKED');
});

test('A6-S04 LOST cannot resume without human approval', () => {
  const result = transitionStage({ currentStage: 'LOST', intent: delivery, triggerEvent: { event_type: 'MANUAL_RESUME', human_approved: false } });
  assert.equal(result.after, 'LOST');
});

test('A6-S05 LOST can resume with human approval', () => {
  const result = transitionStage({ currentStage: 'LOST', intent: delivery, triggerEvent: { event_type: 'MANUAL_RESUME', human_approved: true } });
  assert.equal(result.after, 'REPLIED');
  assert.equal(result.transition_applied, true);
});
