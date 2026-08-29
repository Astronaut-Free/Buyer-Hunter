import test from 'node:test';
import assert from 'node:assert/strict';
import { observeA6Fields } from '../skill-runtime/a6/field-observation.js';

test('A6-F01 declarative quantity is an update', () => {
  const result = observeA6Fields({ content: 'We need 2 tons.', evidenceRef: 'conversation:m1' });
  assert.equal(result.updates[0].field, 'quantity');
  assert.equal(result.updates[0].after, '2 tons');
  assert.equal(result.updates[0].source, 'BUYER_MESSAGE');
});

test('A6-F02 capability question is a quantity mention', () => {
  const result = observeA6Fields({ content: 'Can you supply 2 tons?' });
  assert.equal(result.updates.length, 0);
  assert.equal(result.mentions[0].field, 'quantity');
});

test('A6-F03 MOQ question is a mention, never an update', () => {
  const result = observeA6Fields({ content: 'What is your MOQ?' });
  assert.deepEqual(result.updates, []);
  assert.equal(result.mentions[0].field, 'moq');
});

test('A6-F04 explicit structured input overrides text extraction', () => {
  const result = observeA6Fields({ content: 'We need 2 tons.', explicitUpdates: { quantity: '3 tons' }, previousFields: { quantity: '500 kg' } });
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].after, '3 tons');
  assert.equal(result.updates[0].source, 'EXPLICIT_STRUCTURED_INPUT');
});
