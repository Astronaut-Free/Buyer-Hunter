import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createMemoryOpportunityStore } from '../opportunity-store.js';
import { createQianPulseSkillOrchestrator } from '../qianpulse-skill-orchestrator.js';
import { createSmartleadLiveWebhookHandler } from '../server/smartlead-live-webhook.js';

function headers(rawBody, requestId, secret = 'secret') {
  return {
    'x-request-id': requestId,
    'x-smartlead-signature': `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  };
}

function fixture() {
  const store = createMemoryOpportunityStore();
  const opportunity = store.upsertSeed({
    seed_key: 'a2:seller:buyer-company-1',
    seller: { id: 'seller' },
    buyer: { id: 'buyer-company-1', name: 'Buyer' },
    status: 'ACTIVE',
    stage: 'CONTACTED',
    fields: {}
  });
  store.bindExternalRef({ opportunityId: opportunity.id, provider: 'smartlead', kind: 'lead', externalId: 789, metadata: { campaign_id: 123 } });
  const orchestrator = createQianPulseSkillOrchestrator({ opportunityStore: store });
  const calls = [];
  const liveRuntime = {
    opportunityStore: store,
    async runBuyerMessage(payload, user) {
      calls.push({ payload, user });
      const progression = await orchestrator.runBuyerProgression({
        opportunityId: payload.opportunity_id,
        event: {
          event_id: 'evt-webhook',
          event_type: 'BUYER_MESSAGE',
          content: payload.message,
          evidence_ref: payload.evidence_ref,
          timestamp: payload.timestamp
        },
        sellerContext: { materials: ['catalog.pdf'] }
      });
      return {
        status: 201,
        body: {
          run: { run_id: 'run-webhook', status: progression.run_status },
          approval: null,
          envelope: progression.envelope
        }
      };
    }
  };
  return { store, opportunity, calls, handler: createSmartleadLiveWebhookHandler({ liveRuntime, signingSecret: 'secret' }) };
}

test('signed documented Smartlead EMAIL_REPLIED payload routes to mapped Opportunity', async () => {
  const { opportunity, calls, handler } = fixture();
  const body = {
    event: 'EMAIL_REPLIED',
    timestamp: '2024-01-15T11:00:00Z',
    campaign_id: 123,
    lead_id: 789,
    reply: { body: 'Please send more information.', message_id: 'reply-1', received_at: '2024-01-15T11:00:00Z' },
    lead: { email: 'buyer@example.com' }
  };
  const rawBody = JSON.stringify(body);
  const result = await handler({ rawBody, headers: headers(rawBody, 'req-live-1') });

  assert.equal(result.status, 202);
  assert.equal(result.body.status, 'PROCESSED');
  assert.equal(result.body.opportunity_id, opportunity.id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].user.role, 'BUYER');
  assert.equal(calls[0].user.id, 'buyer-company-1');
  assert.equal(calls[0].payload.idempotency_key, 'smartlead:webhook:req-live-1');
  assert.equal(calls[0].payload.source_message_id, 'reply-1');
});

test('Smartlead live webhook rejects invalid signature before business routing', async () => {
  const { calls, handler } = fixture();
  const rawBody = JSON.stringify({ event: 'EMAIL_REPLIED', lead_id: 789, reply: { body: 'Hello' } });
  const result = await handler({ rawBody, headers: { 'x-request-id': 'req-live-bad', 'x-smartlead-signature': 'sha256=bad' } });
  assert.equal(result.status, 401);
  assert.equal(result.body.code, 'SIGNATURE_INVALID');
  assert.equal(calls.length, 0);
});

test('Smartlead live webhook fails closed when lead id is absent', async () => {
  const { calls, handler } = fixture();
  const body = { event_type: 'REPLIED', campaign_id: 123, lead_email: 'buyer@example.com', message: 'Interested', timestamp: '2025-11-26T10:30:00Z' };
  const rawBody = JSON.stringify(body);
  const result = await handler({ rawBody, headers: headers(rawBody, 'req-live-legacy') });
  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'LEAD_MAPPING_REQUIRED');
  assert.equal(calls.length, 0);
});

