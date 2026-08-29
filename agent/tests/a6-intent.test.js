import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReplyIntent } from '../skill-runtime/a6/intent.js';

test('A6-I01 acknowledgement is not NEED_INFORMATION', () => {
  const result = classifyReplyIntent('Thanks, received.', { evidenceRef: 'conversation:m1' });
  assert.equal(result.primary, 'ACKNOWLEDGEMENT');
  assert.equal(result.confidence, 'HIGH');
  assert.deepEqual(result.evidence_spans, [{ text: 'Thanks, received.', evidence_ref: 'conversation:m1' }]);
});

test('A6-I02 unsubscribe is a high-confidence safety intent', () => {
  const result = classifyReplyIntent('Please unsubscribe me.');
  assert.equal(result.primary, 'UNSUBSCRIBE');
  assert.equal(result.confidence, 'HIGH');
});

test('A6-I03 payment and price are both retained', () => {
  const result = classifyReplyIntent('What are your payment terms and price?');
  assert.equal(result.primary, 'PAYMENT_TERMS');
  assert.ok(result.secondary.includes('PRICE_REQUEST'));
});

test('A6-I04 conflicting sample rejection and bulk interest becomes UNKNOWN', () => {
  const result = classifyReplyIntent("I'm not interested in samples, but we are interested in bulk purchase.");
  assert.equal(result.primary, 'UNKNOWN');
  assert.equal(result.confidence, 'LOW');
  assert.deepEqual(result.secondary.sort(), ['INTERESTED', 'NOT_INTERESTED']);
});
