import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A2_CAPABILITY_ID,
  A3_CAPABILITY_ID,
  A4_CAPABILITY_ID,
  A5_CAPABILITY_ID,
  A6_CAPABILITY_ID,
  runA2Skill,
  runA6Skill
} from '../skill-runtime/index.js';
import { getQianPulseSkillMetadata, QIANPULSE_SKILL_REGISTRY } from '../skill-runtime/registry.js';
import { resolveQianPulseSkillCapabilities } from '../skill-runtime/routing-policy.js';
import { validateA2Envelope, validateA6Envelope } from '../skill-runtime/validators.js';

test('skill registry exposes enabled A2 through A6 runtime metadata', () => {
  const ids = [A2_CAPABILITY_ID, A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID, A6_CAPABILITY_ID];
  assert.equal(QIANPULSE_SKILL_REGISTRY.length, 5);
  for (const capabilityId of ids) {
    const metadata = getQianPulseSkillMetadata(capabilityId);
    assert.ok(metadata, `missing metadata for ${capabilityId}`);
    assert.equal(metadata.enabled, true);
    assert.equal(metadata.version, '1.1.0');
    assert.ok(metadata.description);
    assert.ok(Array.isArray(metadata.required_inputs));
    assert.ok(Array.isArray(metadata.produced_outputs));
  }
});

test('buyer message routes to A6', () => {
  assert.deepEqual(resolveQianPulseSkillCapabilities('BUYER_MESSAGE'), [A6_CAPABILITY_ID]);
});

test('explicit refresh events route to A3 A4 and A5', () => {
  assert.deepEqual(resolveQianPulseSkillCapabilities('PURCHASE_TIMING_REFRESH'), [A3_CAPABILITY_ID]);
  assert.deepEqual(resolveQianPulseSkillCapabilities('SUPPLY_MATCH_REFRESH'), [A4_CAPABILITY_ID]);
  assert.deepEqual(resolveQianPulseSkillCapabilities('TRADE_RISK_REFRESH'), [A5_CAPABILITY_ID]);
});

test('pre-reply followup switches to A6 after reply', () => {
  assert.deepEqual(resolveQianPulseSkillCapabilities('PRE_REPLY_FOLLOWUP_DUE', { hasBuyerReply: true }), [A6_CAPABILITY_ID]);
});

test('A2 and A6 envelopes pass deterministic validation', () => {
  const a2 = runA2Skill({
    seller: { seller_id: 's1', company_id: 'c1', product_id: 'p1' },
    target: { countries: ['US'], product_keywords: ['matcha'] },
    buyer_profile: { company_types: ['importer'], buyer_roles: ['procurement'] },
    constraints: { max_candidates: 20, language: 'en', contact_limit_per_company: 2 },
    execution: { channel: 'email', human_gate: true }
  });
  const a6 = runA6Skill({ opportunity_id: 'opp1', latest_buyer_message: { content: 'Thanks' }, opportunity_state: { stage: 'QUALIFYING', fields: {} }, seller_context: {} });
  assert.equal(validateA2Envelope(a2).valid, true);
  assert.equal(validateA6Envelope(a6).valid, true);
});
