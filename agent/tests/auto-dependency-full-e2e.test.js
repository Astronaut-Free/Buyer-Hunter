import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createLiveA2A6Runtime } from '../server/a2a6-live-runtime.js';
import { createSmartleadLiveWebhookHandler } from '../server/smartlead-live-webhook.js';
import { createA2FirstOutreachExecutor } from '../server/a2-first-outreach-executor.js';
import { createApprovalLiveExecutor } from '../server/approval-live-executor.js';

function sign(rawBody, requestId, secret = 'webhook-secret') {
  return {
    'x-request-id': requestId,
    'x-smartlead-signature': `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  };
}

function buyerCompany() {
  return {
    buyer_company_id: 'buyer-company-delivery',
    legal_or_display_name: 'US Beverage Importer',
    country: 'US',
    domain: 'delivery-buyer.example',
    sells_or_uses_product: true,
    buyer_type: 'importer',
    why_fit: 'imports tea ingredients for beverage production',
    number_of_shipments: 18,
    evidence_refs: ['ev_company_delivery'],
    product_evidence: ['ev_product_delivery'],
    trade_evidence: ['ev_trade_delivery']
  };
}

test('A2 → Smartlead → delivery reply → automatic A3/A4 refresh → A6 approval → Smartlead reply closes one Opportunity loop', async () => {
  const state = { opportunities: {}, users: {}, sessions: {} };
  let counter = 0;
  const sentReplies = [];
  const smartlead = {
    async getCampaignSequences() {
      return { data: [{ seq_number: 1, subject: '{{qianpulse_subject}}', email_body: '{{qianpulse_body}}' }] };
    },
    async addLeadsToCampaign() {
      return { lead_ids: [987] };
    },
    async getLeadByEmail() {
      return { id: 987 };
    },
    async replyEmailThread(input) {
      sentReplies.push(input);
      return { ok: true, message_id: 'sent-delivery-reply-1' };
    }
  };

  const runtime = createLiveA2A6Runtime({
    getState: () => state,
    now: () => '2026-08-29T03:30:00Z',
    id: prefix => `${prefix}-${++counter}`,
    authorizeOpportunity: (actor, opportunity) =>
      actor?.role === 'INTERNAL' ||
      (actor?.role === 'SELLER' && opportunity.seller?.id === actor.id) ||
      (actor?.role === 'BUYER' && opportunity.buyer?.id === actor.id),
    providers: {
      trade_data: { async searchBuyers() { return { companies: [buyerCompany()] }; } },
      contact_data: { async findDecisionMakers() { return [{ buyer_company_id: 'buyer-company-delivery', name: 'Taylor Buyer', work_email: 'taylor@delivery-buyer.example', role_reason: 'Procurement Manager', source_refs: ['ev_contact_delivery'] }]; } }
    }
  });

  const seller = { id: 'seller-delivery', role: 'SELLER', profile: { company_name: 'Guizhou Tea' } };
  const a2 = await runtime.runProactive({
    event_type: 'SELLER_PROACTIVE_DEVELOPMENT',
    idempotency_key: 'delivery-loop-a2',
    campaign_id: 456,
    max_ready: 1,
    input: {
      seller: {
        product_id: 'p-delivery',
        company_name: 'Guizhou Tea',
        product_name: 'Matcha',
        seller_context: {
          delivery: '20 days',
          evidence_refs: ['seller-delivery-policy']
        }
      },
      target: { countries: ['US'], product_keywords: ['matcha'] },
      buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] },
      constraints: { max_candidates: 5, language: 'en', contact_limit_per_company: 1 },
      execution: { channel: 'email', human_gate: true }
    }
  }, seller);

  assert.equal(a2.status, 201);
  const opportunity = a2.body.opportunities[0];
  assert.equal(opportunity.seller_context.delivery, '20 days');
  const firstApproval = a2.body.outreach_approvals[0];
  const firstOutreach = createA2FirstOutreachExecutor({
    getState: () => state,
    smartlead,
    opportunityStore: runtime.opportunityStore,
    now: () => '2026-08-29T03:31:00Z'
  });
  const approve = createApprovalLiveExecutor({
    getState: () => state,
    smartlead,
    a2OutreachExecutor: firstOutreach,
    now: () => '2026-08-29T03:31:00Z'
  });
  const internal = { id: 'internal-1', role: 'INTERNAL' };
  const queued = await approve({ approvalId: firstApproval.approval_id, user: internal, status: 'APPROVED' });
  assert.equal(queued.body.execution.status, 'QUEUED_IN_SMARTLEAD');

  const webhook = createSmartleadLiveWebhookHandler({ liveRuntime: runtime, signingSecret: 'webhook-secret' });
  const webhookBody = {
    event: 'EMAIL_REPLIED',
    timestamp: '2026-08-29T03:40:00Z',
    campaign_id: 456,
    lead_id: 987,
    reply: {
      body: 'What is your delivery lead time?',
      message_id: 'buyer-delivery-reply-1',
      received_at: '2026-08-29T03:40:00Z'
    },
    lead: { email: 'taylor@delivery-buyer.example' }
  };
  const rawBody = JSON.stringify(webhookBody);
  const inbound = webhook({ rawBody, headers: sign(rawBody, 'req-delivery-loop-1') });

  assert.equal(inbound.status, 202);
  assert.ok(inbound.body.approval);
  assert.match(inbound.body.approval.payload.draft.content, /Lead time: 20 days/);
  const progressed = runtime.opportunityStore.get(opportunity.id);
  assert.equal(progressed.stage, 'REPLIED');
  assert.equal(progressed.status, 'ACTIVE');
  assert.deepEqual(progressed.a6.dependency_refresh.required, []);
  assert.deepEqual(progressed.a6.dependency_refresh.attempted.sort(), [
    'qianpulse.a3.purchase_timing',
    'qianpulse.a4.supply_match',
    'qianpulse.a8.deal_action'
  ].sort());
  assert.equal(progressed.a6.dependency_refresh.executions.every(item => ['DONE', 'NOT_APPLICABLE'].includes(item.run_status)), true);

  const replied = await approve({ approvalId: inbound.body.approval.approval_id, user: internal, status: 'APPROVED' });
  assert.equal(replied.status, 200);
  assert.equal(replied.body.execution.status, 'SENT');
  assert.equal(sentReplies.length, 1);
  assert.match(sentReplies[0].emailBody, /Lead time: 20 days/);
  assert.equal(runtime.opportunityStore.get(opportunity.id).id, opportunity.id);
});
