import test from 'node:test';
import assert from 'node:assert/strict';
import { extractA6FieldUpdates } from '../skill-runtime/a6-field-extractor.js';

test('extracts quantity destination and delivery date from one buyer sentence', () => {
  const result = extractA6FieldUpdates('We need 20 tons delivered to Germany by October 2026.');
  assert.equal(result.updates.quantity, '20 tons');
  assert.equal(result.updates.destination, 'Germany');
  assert.equal(result.updates.delivery_date, 'October 2026');
});

test('explicit structured updates override extracted text values', () => {
  const result = extractA6FieldUpdates('Please ship 10 tons to Germany by October 2026.', {
    quantity: '12 tons',
    destination: 'France'
  });
  assert.equal(result.extracted.quantity, '10 tons');
  assert.equal(result.updates.quantity, '12 tons');
  assert.equal(result.updates.destination, 'France');
});

test('does not invent destination from unrelated prose', () => {
  const result = extractA6FieldUpdates('Thanks, we are reviewing this internally.');
  assert.deepEqual(result.updates, {});
});
