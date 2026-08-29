import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createMemoryOpportunityStore } from '../opportunity-store.js';
import { createQianPulseSkillOrchestrator } from '../qianpulse-skill-orchestrator.js';
import { createQianPulseRuntimeController } from '../qianpulse-runtime-controller.js';

const input = {
  seller: { seller_id: 'seller1', company_id: 'company1', product_id: 'p1', company_name: 'Guizhou Tea', product_name: 'Matcha' },
  target: { countries: ['US'], product_keywords: ['matcha'] },
  buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] },
  constraints: { max_candidates: 5, language: 'en', contact_limit_per_company: 1 },
  execution: { channel: 'email', human_gate: true, campaign_id: 7 }
};

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

function extractor(event) {
  return {
    external_lead_id: event.data.lead_id,
    source_message_id: event.data.message_id,
    campaign_id: event.data.campaign_id,
    content: event.data.reply_text,
    timestamp: event.created_at,
    evidence_ref: `smartlead:${event.data.message_id}`
  };
}

function signedHeaders(rawBody, requestId, secret) {
  const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return { 'x-request-id': requestId, 'x-smartlead-signature': signature };
}

test('A2 → Opportunity → Smartlead reply → A6 runs on one Opportunity', async () => {
  const store = createMemoryOpportunityStore();
  const orchestrator = createQianPulseSkillOrchestrator({
    opportunityStore: store,
    clock: () => '2026-08-29T02:30:00Z',
    providers: {
      trade_data: { async searchBuyers() { return { companies: [buyerCompany()] }; } },
      contact_data: { async findDecisionMakers() { return [{ name: 'Alex', work_email: 'alex@buyer.example', role_reason: 'Procurement Manager', source_refs: ['ev_contact'] }]; } }
    }
  });
  const controller = createQianPulseRuntimeController({ orchestrator, webhookSecret: 'secret', extractSmartleadReply: extractor });

  const proactive = await controller.runProactiveDevelopment({ input, maxReady: 1 });
  assert.equal(proactive.opportunities.length, 1);
  const opportunity = proactive.opportunities[0];
  controller.bindSmartleadLead({ opportunityId: opportunity.id, leadId: 99, campaignId: 7 });

  const body = { type: 'EMAIL_REPLY', created_at: '2026-08-29T02:31:00Z', data: { lead_id: 99, message_id: 'm-1', campaign_id: 7, reply_text: 'We need 20 tons. What is your delivery lead time?' } };
  const rawBody = JSON.stringify(body);
  const first = controller.ingestSmartleadWebhook({ rawBody, headers: signedHeaders(rawBody, 'req-e2e-1', 'secret'), sellerContext: { delivery: '20 days' } });
  assert.equal(first.status, 'PROCESSED');
  assert.equal(first.routed.event.opportunity_id, opportunity.id);
  assert.equal(first.progression.run_status, 'MORE_EVIDENCE');
  assert.equal(store.get(opportunity.id).status, 'WAITING_EVIDENCE');
  assert.ok(store.get(opportunity.id).evidence_ids.includes('smartlead:m-1'));

  const duplicate = controller.ingestSmartleadWebhook({ rawBody, headers: signedHeaders(rawBody, 'req-e2e-1', 'secret') });
  assert.equal(duplicate.status, 'DUPLICATE');
  assert.equal(store.list().length, 1);
});

test('Smartlead ingress rejects invalid signature before routing', () => {
  const store = createMemoryOpportunityStore();
  const orchestrator = createQianPulseSkillOrchestrator({ opportunityStore: store });
  const controller = createQianPulseRuntimeController({ orchestrator, webhookSecret: 'secret', extractSmartleadReply: extractor });
  const rawBody = JSON.stringify({ type: 'EMAIL_REPLY', data: { lead_id: 1, reply_text: 'Hello' } });
  const result = controller.ingestSmartleadWebhook({ rawBody, headers: { 'x-request-id': 'req-bad', 'x-smartlead-signature': 'sha256=bad' } });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.code, 'SIGNATURE_INVALID');
});
