import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityAdapter } from '../capability-adapter.js';
import { A2_CAPABILITY_ID, A6_CAPABILITY_ID } from '../skill-runtime/index.js';

test('capability adapter dispatches A2', async () => {
  const invoke = createCapabilityAdapter();
  const result = await invoke(A2_CAPABILITY_ID, {
    target: { countries: ['US'], product_keywords: ['matcha'] },
    buyer_profile: { company_types: ['importer'], buyer_roles: ['procurement'] },
    constraints: { max_candidates: 20, language: 'en', contact_limit_per_company: 2 },
    execution: { channel: 'email', human_gate: true },
    seller: { seller_id: 's1', company_id: 'c1', product_id: 'p1' }
  });
  assert.equal(result.capability_id, A2_CAPABILITY_ID);
  assert.ok(Array.isArray(result.domain_result.candidates));
  assert.ok(result.domain_result.summary);
});

test('capability adapter dispatches A6', async () => {
  const invoke = createCapabilityAdapter();
  const result = await invoke(A6_CAPABILITY_ID, {
    opportunity_id: 'opp1',
    latest_buyer_message: { content: 'unsubscribe me' },
    opportunity_state: { stage: 'REPLIED', fields: {} },
    seller_context: {}
  });
  assert.equal(result.capability_id, A6_CAPABILITY_ID);
  assert.equal(result.domain_result.next_action.action, 'STOP_CONTACT');
});
