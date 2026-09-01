import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySmartleadWebhook, normalizeSmartleadWebhook, makeWebhookIdempotencyKey } from '../webhooks/smartlead.js';
import { executeApprovedSmartleadReply, createMemoryIdempotencyStore } from '../external-action-executor.js';

test('Smartlead signature verification uses HMAC SHA256 of raw body', () => {
  const rawBody = JSON.stringify({ id: 'evt1', type: 'email.reply' });
  const secret = 'secret';
  const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  assert.equal(verifySmartleadWebhook({ rawBody, headers: { 'X-Smartlead-Signature': signature }, signingSecret: secret }).valid, true);
});

test('Smartlead webhook normalizer prefers X-Request-Id for idempotency', () => {
  const event = normalizeSmartleadWebhook({ body: { id: 'body-id', type: 'email.reply', data: { lead_id: 1 } }, headers: { 'x-request-id': 'request-1' } });
  assert.equal(makeWebhookIdempotencyKey(event), 'smartlead:webhook:request-1');
});

test('approved reply executes once and replays cached result for duplicate key', async () => {
  let calls = 0;
  const smartlead = { async replyEmailThread(payload) { calls += 1; return { external_message_id: 'm1', ...payload }; } };
  const store = createMemoryIdempotencyStore();
  const args = { smartlead, approval: { status: 'APPROVED' }, campaignId: 1, leadId: 2, emailBody: 'Hello', replyMessageId: 'r1', idempotencyKey: 'send:1', idempotencyStore: store };
  const first = await executeApprovedSmartleadReply(args);
  const second = await executeApprovedSmartleadReply(args);
  assert.equal(first.executed, true);
  assert.equal(second.replayed, true);
  assert.equal(calls, 1);
});

test('unapproved reply waits', async () => {
  const smartlead = { async replyEmailThread() { throw new Error('should not call'); } };
  const result = await executeApprovedSmartleadReply({ smartlead, approval: { status: 'PENDING' }, campaignId: 1, leadId: 2, emailBody: 'Hello', replyMessageId: 'r1', idempotencyKey: 'send:2' });
  assert.equal(result.status, 'WAITING_APPROVAL');
});
