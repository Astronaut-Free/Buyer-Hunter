import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryOpportunityStore } from '../opportunity-store.js';
import { createSmartleadWebhookRouter } from '../webhooks/smartlead-router.js';

const extractor = event => ({
  external_lead_id: event.data.lead_id,
  source_message_id: event.data.message_id,
  campaign_id: event.data.campaign_id,
  content: event.data.reply_text,
  timestamp: event.created_at
});

test('Smartlead router requires an explicit external lead → Opportunity binding', () => {
  const store = createMemoryOpportunityStore();
  const route = createSmartleadWebhookRouter({ opportunityStore: store, extractReply: extractor });
  const result = route({
    headers: { 'x-request-id': 'req-1' },
    body: { type: 'EMAIL_REPLY', data: { lead_id: 99, message_id: 'm1', campaign_id: 7, reply_text: 'Can you send the spec?' } }
  });
  assert.equal(result.status, 'NEEDS_CONTEXT');
  assert.equal(result.code, 'OPPORTUNITY_MAPPING_REQUIRED');
});

test('Smartlead router emits BUYER_MESSAGE only after mapping succeeds', () => {
  const store = createMemoryOpportunityStore();
  const opportunity = store.upsertSeed({ seed_key: 'a2:seller:buyer', seller: { id: 'seller' }, buyer: { id: 'buyer' }, status: 'ACTIVE' });
  store.bindExternalRef({ opportunityId: opportunity.id, provider: 'smartlead', kind: 'lead', externalId: 99, metadata: { campaign_id: 7 } });
  const route = createSmartleadWebhookRouter({ opportunityStore: store, extractReply: extractor });
  const result = route({
    headers: { 'x-request-id': 'req-2' },
    body: { type: 'EMAIL_REPLY', created_at: '2026-08-29T02:20:00Z', data: { lead_id: 99, message_id: 'm2', campaign_id: 7, reply_text: 'Can you send the spec?' } }
  });
  assert.equal(result.status, 'ROUTED');
  assert.equal(result.event.event_type, 'BUYER_MESSAGE');
  assert.equal(result.event.opportunity_id, opportunity.id);
  assert.equal(result.event.payload.message.content, 'Can you send the spec?');
  assert.equal(result.idempotency_key, 'smartlead:webhook:req-2');
});
