import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveA6Outcome } from '../skill-runtime/a6/outcome-policy.js';

test('INTERESTED never becomes WON', () => {
  assert.equal(resolveA6Outcome({ intent: { primary: 'INTERESTED' }, triggerEvent: { event_type: 'BUYER_MESSAGE' } }), null);
});

test('NOT_NOW never becomes LOST', () => {
  assert.equal(resolveA6Outcome({ intent: { primary: 'NOT_NOW' }, triggerEvent: { event_type: 'BUYER_MESSAGE' } }), null);
});

test('PO_RECEIVED requires and preserves evidence', () => {
  const result = resolveA6Outcome({
    intent: { primary: 'ACKNOWLEDGEMENT' },
    triggerEvent: { event_type: 'PO_RECEIVED', evidence_ref: 'order:po-1' },
    evaluatedAt: '2026-08-29T00:00:00Z'
  });
  assert.equal(result.type, 'WON');
  assert.deepEqual(result.evidence_refs, ['order:po-1']);
});

test('unsubscribe creates STOPPED with suppression signal', () => {
  const result = resolveA6Outcome({ intent: { primary: 'UNSUBSCRIBE', evidence_spans: [] }, triggerEvent: {}, evaluatedAt: '2026-08-29T00:00:00Z' });
  assert.equal(result.type, 'STOPPED');
  assert.equal(result.suppression_signal, true);
});
