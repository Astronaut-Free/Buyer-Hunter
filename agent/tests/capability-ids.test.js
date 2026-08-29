import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A2_CAPABILITY_ID,
  A3_CAPABILITY_ID,
  A4_CAPABILITY_ID,
  A5_CAPABILITY_ID,
  A6_CAPABILITY_ID,
  CAPABILITY_SLOT_BY_ID
} from '../skill-runtime/capability-ids.js';

test('capability IDs have one canonical source and expected slots', () => {
  assert.deepEqual(
    [A2_CAPABILITY_ID, A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID, A6_CAPABILITY_ID],
    [
      'qianpulse.a2.proactive_buyer_development',
      'qianpulse.a3.purchase_timing',
      'qianpulse.a4.supply_match',
      'qianpulse.a5.trade_risk',
      'qianpulse.a6.opportunity_progression'
    ]
  );
  assert.deepEqual(CAPABILITY_SLOT_BY_ID, {
    [A3_CAPABILITY_ID]: 'a3',
    [A4_CAPABILITY_ID]: 'a4',
    [A5_CAPABILITY_ID]: 'a5'
  });
});
