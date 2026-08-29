import test from 'node:test';
import assert from 'node:assert/strict';
import { runA8DealAction, A8_CAPABILITY_ID } from '../skill-runtime/a8.js';
import { runA6Skill, selectA6NextAction, routeA6ChangedFields } from '../skill-runtime/a6.js';

const base = () => ({
  opportunity_id: 'opp-1',
  decision: { decision_status: 'PURSUE_NOW', opportunity_score: 82, component_scores: { timing: 80, seller_fit: 90 }, gaps: [] },
  risks: [{ code: 'IDENTITY_UNKNOWN', severity: 'MEDIUM' }],
  access_status: 'CONDITIONAL',
  stage: 'QUALIFYING'
});

test('a8 maps decision states to deal actions', () => {
  const pursue = runA8DealAction(base());
  assert.equal(pursue.run_status, 'DONE');
  assert.equal(pursue.domain_result.primary_action.type, 'OUTREACH');
  assert.equal(pursue.human_review_required, true);

  const verify = runA8DealAction({
    ...base(),
    decision: { decision_status: 'VERIFY_FIRST', gaps: ['规格待确认'] }
  });
  assert.equal(verify.domain_result.primary_action.type, 'VERIFY_GAPS');
  assert.ok(verify.domain_result.primary_action.reason.includes('规格待确认'));

  const watch = runA8DealAction({ ...base(), decision: { decision_status: 'WATCH' } });
  assert.equal(watch.domain_result.primary_action.type, 'SCHEDULE_REVIEW');
  assert.equal(watch.human_review_required, false);

  const pass = runA8DealAction({ ...base(), decision: { decision_status: 'PASS' } });
  assert.equal(pass.domain_result.primary_action.type, 'NO_ACTION');
});

test('a8 never bypasses BLOCK and is NOT_APPLICABLE without a snapshot', () => {
  const blocked = runA8DealAction({ ...base(), access_status: 'BLOCK' });
  assert.equal(blocked.run_status, 'BLOCKED');
  assert.equal(blocked.domain_result.primary_action.type, 'HALT');
  assert.equal(blocked.human_review_required, true);

  const missing = runA8DealAction({ ...base(), decision: {} });
  assert.equal(missing.run_status, 'NOT_APPLICABLE');
  assert.equal(missing.domain_result.decision, 'NO_SNAPSHOT');
});

test('routeA6ChangedFields invalidates a8 alongside the mapped capabilities', () => {
  const routed = routeA6ChangedFields([{ field: 'destination' }]);
  assert.ok(routed.includes('qianpulse.a5.trade_risk'));
  assert.ok(routed.includes('qianpulse.a8.deal_action'));
  assert.deepEqual(routeA6ChangedFields([]), []);
});

test('selectA6NextAction adopts a8 HALT / SCHEDULE_REVIEW but keeps ownership otherwise', () => {
  const halt = selectA6NextAction({
    intent: { primary: 'INTERESTED' },
    a8Result: { domain_result: { primary_action: { type: 'HALT', reason: '门禁 BLOCK' } } }
  });
  assert.equal(halt.action, 'WAIT');
  assert.equal(halt.execution_mode, 'HUMAN');
  assert.equal(halt.human_review_required, true);

  const schedule = selectA6NextAction({
    intent: { primary: 'INTERESTED' },
    a8Result: { domain_result: { primary_action: { type: 'SCHEDULE_REVIEW', reason: 'WATCH 时机未到' } } }
  });
  assert.equal(schedule.action, 'WAIT');

  const outreach = selectA6NextAction({
    intent: { primary: 'INTERESTED' },
    a8Result: { domain_result: { primary_action: { type: 'OUTREACH', reason: '可推进' } } }
  });
  assert.equal(outreach.action, 'ASK_KEY_QUESTION'); // A6 owns the action vocabulary
});

test('A6 run consumes a8_result through the envelope contract', () => {
  const env = runA6Skill({
    opportunity_id: 'opp-1',
    latest_buyer_message: { content: 'What is your MOQ?' },
    field_updates: { quantity: '500 kg' },
    opportunity_state: { stage: 'QUALIFYING', fields: {} },
    seller_context: {},
    a8_result: runA8DealAction({ ...base(), access_status: 'BLOCK' })
  });
  assert.equal(env.capability_id, 'qianpulse.a6.opportunity_progression');
  assert.equal(env.run_status, 'DONE'); // a8 HALT shapes next_action; only A5 BLOCKED flips the run status
  assert.equal(env.domain_result.next_action.action, 'WAIT');
});
