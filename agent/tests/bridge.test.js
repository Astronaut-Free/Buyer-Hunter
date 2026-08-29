import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCapabilityRegistry, resolveSkillCapabilitiesForEvent, buildA6ContextFromAgent, invokeSkillThroughAdapter } from '../agent-skill-bridge.js';
import { A2_CAPABILITY_ID, A6_CAPABILITY_ID } from '../skill-runtime/index.js';

test('registry merge retains legacy capabilities and adds A2/A6', () => {
  const merged = mergeCapabilityRegistry([{ capability_id: 'supply.match', version: '1.0.0' }]);
  assert.ok(merged.some(item => item.capability_id === 'supply.match'));
  assert.ok(merged.some(item => item.capability_id === A2_CAPABILITY_ID));
  assert.ok(merged.some(item => item.capability_id === A6_CAPABILITY_ID));
});

test('buyer message routes into A6', () => {
  assert.deepEqual(resolveSkillCapabilitiesForEvent({ event_type: 'BUYER_MESSAGE' }), [A6_CAPABILITY_ID]);
});

test('proactive development event routes into A2', () => {
  assert.deepEqual(resolveSkillCapabilitiesForEvent({ event_type: 'SELLER_PROACTIVE_DEVELOPMENT' }), [A2_CAPABILITY_ID]);
});

test('A6 bridge reuses Opportunity and Event state', () => {
  const context = buildA6ContextFromAgent({
    opportunity: { id: 'opp1', status: 'QUALIFYING', fields: { quantity: '5 tons' } },
    event: { event_id: 'evt1', event_type: 'BUYER_MESSAGE', timestamp: '2026-08-29T00:00:00Z', payload: { message: 'Need 20 tons', field_updates: { quantity: '20 tons' } } }
  });
  assert.equal(context.opportunity_id, 'opp1');
  assert.equal(context.latest_buyer_message, 'Need 20 tons');
  assert.equal(context.opportunity_state.fields.quantity, '5 tons');
  assert.equal(context.field_updates.quantity, '20 tons');
});

test('bridge rejects invalid capability envelope', async () => {
  await assert.rejects(() => invokeSkillThroughAdapter({ invoke: async () => ({ run_status: 'DONE' }), capabilityId: A6_CAPABILITY_ID, context: {} }), /invalid capability envelope/);
});
