import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSmartleadWebhook } from '../webhooks/smartlead.js';
import { mapSmartleadReply } from '../webhooks/smartlead-reply-mapper.js';

test('maps SmartLead EMAIL_REPLIED payload with nested lead and reply', () => {
  const normalized = normalizeSmartleadWebhook({
    headers: { 'x-request-id': 'req-doc-1' },
    body: {
      event: 'EMAIL_REPLIED',
      timestamp: '2024-01-15T11:00:00Z',
      campaign_id: 123,
      lead_id: 789,
      reply: {
        body: "Thanks for reaching out. I'm interested...",
        received_at: '2024-01-15T11:00:00Z',
        message_id: 'reply-abc123'
      },
      lead: { email: 'lead@example.com', first_name: 'Jane' }
    }
  });
  const mapped = mapSmartleadReply(normalized);
  assert.equal(mapped.external_lead_id, 789);
  assert.equal(mapped.campaign_id, 123);
  assert.equal(mapped.source_message_id, 'reply-abc123');
  assert.match(mapped.content, /interested/);
  assert.equal(mapped.transport.reply_email_time, '2024-01-15T11:00:00Z');
});

test('maps SmartLead event_type payload with nested lead object and reply_body', () => {
  const normalized = normalizeSmartleadWebhook({
    headers: { 'x-request-id': 'req-doc-2' },
    body: {
      event_type: 'EMAIL_REPLIED',
      timestamp: '2025-01-15T14:32:00Z',
      campaign_id: 12345,
      lead: { id: 67890, email: 'alex@acmecorp.com' },
      message_id: 'abc123',
      reply_body: 'Please send the specification.'
    }
  });
  const mapped = mapSmartleadReply(normalized);
  assert.equal(mapped.external_lead_id, 67890);
  assert.equal(mapped.campaign_id, 12345);
  assert.equal(mapped.source_message_id, 'abc123');
  assert.equal(mapped.content, 'Please send the specification.');
});

test('legacy REPLIED payload without lead id fails closed at mapping boundary', () => {
  const normalized = normalizeSmartleadWebhook({
    headers: { 'x-request-id': 'req-doc-3' },
    body: {
      event_type: 'REPLIED',
      campaign_id: 123,
      lead_email: 'john@example.com',
      message: 'Thanks for reaching out...',
      timestamp: '2025-11-26T10:30:00Z'
    }
  });
  const mapped = mapSmartleadReply(normalized);
  assert.equal(mapped.ignore, false);
  assert.equal(mapped.external_lead_id, null);
  assert.equal(mapped.lead_email, 'john@example.com');
});

test('non-reply events are ignored', () => {
  const normalized = normalizeSmartleadWebhook({ body: { event: 'EMAIL_OPENED', lead_id: 1 } });
  assert.deepEqual(mapSmartleadReply(normalized), { ignore: true, reason: 'NOT_EMAIL_REPLY' });
});
