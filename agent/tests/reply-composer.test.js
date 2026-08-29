import test from 'node:test';
import assert from 'node:assert/strict';
import { composeReply } from '../services/reply-composer.js';

test('Reply Composer uses only allowed claims and does not invent a guarantee', () => {
  const draft = composeReply({
    communicationBrief: {
      objective: 'answer delivery question', language: 'en',
      allowed_claims: [{ fact: 'lead_time', value: '20 days', evidence_refs: ['seller:delivery-policy:1'] }],
      approved_assets: [], questions_to_ask: [], prohibited_claims: ['guaranteed delivery date']
    }
  });
  assert.match(draft.content, /Lead time: 20 days/);
  assert.doesNotMatch(draft.content, /guarantee|October 1/i);
  assert.deepEqual(draft.evidence_refs, ['seller:delivery-policy:1']);
});
