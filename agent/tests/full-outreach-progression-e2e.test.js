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
    buyer_company_id: 'buyer-company-1',
    legal_or_display_name: 'US Ingredient Importer',
    country: 'US',
    domain: 'buyer.example',
    sells_or_uses_product: true,
    buyer_type: 'importer',
    why_fit: 'imports relevant tea ingredients',
    number_of_shipments: 20,
    evidence_refs: ['ev_company'],
    product_evidence: ['ev_product'],
    trade_evidence: ['ev_trade']
  };
}

test('A2 approval → Smartlead queue → signed buyer reply → A6 approval → Smartlead reply runs on one Opportunity', async () => {
  const state = { opportunities: {}, users: {}, sessions: {} };
  let counter = 0;
  const sentReplies = [];
  const smartlead = {
    async getCampaignSequences() {
      return { data: [{ seq_number: 1, subject: '{{qianpulse_subject}}', email_body: '{{qianpulse_body}}' }] };
    },
    async addLeadsToCampaign({ leads }) {
      assert.equal(leads[0].custom_fields.qianpulse_opportunity_id.startsWith('opp_a2_'), true);
      assert.match(leads[0].custom_fields.qianpulse_body, /Matcha/i);
      return { lead_ids: [789] };
    },
    async getLeadByEmail() {
      return { id: 789 };
    },
    async replyEmailThread(input) {
      sentReplies.push(input);
      return { ok: true, message_id: 'sent-reply-1' };
    }
  };

  const runtime = createLiveA2A6Runtime({
    getState: () => state,
    now: () => '2026-08-29T03:00:00Z',
    id: prefix => `${prefix}-${++counter}`,
    authorizeOpportunity: (actor, opportunity) =>
      actor?.role === 'INTERNAL' ||
      (actor?.role === 'SELLER' && opportunity.seller?.id === actor.id) ||
      (actor?.role === 'BUYER' && opportunity.buyer?.id === actor.id),
    providers: {
      trade_data: { async searchBuyers() { return { companies: [buyerCompany()] }; } },
      contact_data: { async findDecisionMakers() { return [{ buyer_company_id: 'buyer-company-1', name: 'Alex Buyer', work_email: 'alex@buyer.example', role_reason: 'Procurement Manager', source_refs: ['ev_contact'] }]; } }
    }
  });

  const seller = { id: 'seller-1', role: 'SELLER', profile: { company_name: 'Guizhou Tea' } };
  const a2 = await runtime.runProactive({
    event_type: 'SELLER_PROACTIVE_DEVELOPMENT',
    idempotency_key: 'full-loop-a2',
    campaign_id: 123,
    max_ready: 1,
    input: {
      seller: {
        product_id: 'p1',
        company_name: 'Guizhou Tea',
        product_name: 'Matcha',
        seller_context: { moq: '500 kg' }
      },
      target: { countries: ['US'], product_keywords: ['matcha'] },
      buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] },
      constraints: { max_candidates: 5, language: 'en', contact_limit_per_company: 1 },
      execution: { channel: 'email', human_gate: true }
    }
  }, seller);

  assert.equal(a2.status, 201);
  assert.equal(a2.body.outreach_approvals.length, 1);
  const opportunity = a2.body.opportunities[0];
  assert.equal(opportunity.seller_context.moq, '500 kg');
  const firstApproval = a2.body.outreach_approvals[0];

  const firstOutreach = createA2FirstOutreachExecutor({
    getState: () => state,
    smartlead,
    opportunityStore: runtime.opportunityStore,
    now: () => '2026-08-29T03:01:00Z'
  });
  const approve = createApprovalLiveExecutor({
    getState: () => state,
    smartlead,
    a2OutreachExecutor: firstOutreach,
    now: () => '2026-08-29T03:01:00Z'
  });
  const internal = { id: 'internal-1', role: 'INTERNAL' };
  const queued = await approve({ approvalId: firstApproval.approval_id, user: internal, status: 'APPROVED' });

  assert.equal(queued.status, 200);
  assert.equal(queued.body.execution.status, 'QUEUED_IN_SMARTLEAD');
  assert.equal(runtime.opportunityStore.resolveExternalRef({ provider: 'smartlead', kind: 'lead', externalId: 789 }).id, opportunity.id);

  const webhook = createSmartleadLiveWebhookHandler({ liveRuntime: runtime, signingSecret: 'webhook-secret' });
  const webhookBody = {
    event: 'EMAIL_REPLIED',
    timestamp: '2026-08-29T03:10:00Z',
    campaign_id: 123,
    lead_id: 789,
    reply: {
      body: 'What is your MOQ?',
      message_id: 'buyer-reply-1',
      received_at: '2026-08-29T03:10:00Z'
    },
    lead: { email: 'alex@buyer.example' }
  };
  const rawBody = JSON.stringify(webhookBody);
  const inbound = webhook({ rawBody, headers: sign(rawBody, 'req-full-loop-1') });

  assert.equal(inbound.status, 202);
  assert.equal(inbound.body.status, 'PROCESSED');
  assert.equal(inbound.body.opportunity_id, opportunity.id);
  assert.ok(inbound.body.approval);
  assert.match(inbound.body.approval.payload.draft.content, /MOQ: 500 kg/);

  const replied = await approve({
    approvalId: inbound.body.approval.approval_id,
    user: internal,
    status: 'APPROVED'
  });

  assert.equal(replied.status, 200);
  assert.equal(replied.body.execution.status, 'SENT');
  assert.equal(sentReplies.length, 1);
  assert.equal(sentReplies[0].campaignId, 123);
  assert.equal(sentReplies[0].leadId, 789);
  assert.equal(sentReplies[0].replyMessageId, 'buyer-reply-1');
  assert.match(sentReplies[0].emailBody, /MOQ: 500 kg/);
  assert.equal(runtime.opportunityStore.get(opportunity.id).a6.buyer_reply.intent.primary, 'MOQ_SPEC_REQUEST');
});
