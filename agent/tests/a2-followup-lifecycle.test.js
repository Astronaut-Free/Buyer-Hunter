import test from 'node:test';
import assert from 'node:assert/strict';
import { applyA2EmailEvent, decideA2Followup } from '../skill-runtime/a2-state-machine.js';

test('delivery lifecycle stops on bounce and hands replies to A6', () => {
  const opportunity = { a2: { followup: { send_count: 0, max_send_count: 3 } } };
  applyA2EmailEvent(opportunity, { event_type: 'SENT' }, '2026-08-29T00:00:00Z');
  assert.equal(opportunity.a2.outreach_state, 'SENT');
  assert.equal(opportunity.a2.followup.send_count, 1);
  applyA2EmailEvent(opportunity, { event_type: 'DELIVERED' });
  assert.equal(opportunity.a2.lifecycle_status, 'WAITING_REPLY');
  applyA2EmailEvent(opportunity, { event_type: 'EMAIL_REPLIED' });
  assert.equal(opportunity.a2.lifecycle_status, 'HANDED_OFF_A6');
  assert.equal(decideA2Followup({ hasReply: true, timeAllowed: true }).status, 'HANDOFF_A6');
});

test('max outreach and hard bounce stop follow-up', () => {
  assert.equal(decideA2Followup({ sendCount: 3, maxSendCount: 3, timeAllowed: true }).status, 'STOP');
  assert.equal(decideA2Followup({ deliveryState: 'BOUNCED', timeAllowed: true }).status, 'STOP');
});
