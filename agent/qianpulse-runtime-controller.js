import { createMemoryIdempotencyStore } from './external-action-executor.js';
import { createSmartleadWebhookRouter } from './webhooks/smartlead-router.js';
import { verifySmartleadWebhook } from './webhooks/smartlead.js';

function parseRawBody(rawBody, body) {
  if (body && typeof body === 'object') return body;
  if (!rawBody) return {};
  return JSON.parse(String(rawBody));
}

export function createQianPulseRuntimeController({
  orchestrator,
  webhookSecret,
  extractSmartleadReply,
  webhookIdempotencyStore = createMemoryIdempotencyStore()
} = {}) {
  if (!orchestrator?.runProactiveDevelopment || !orchestrator?.runBuyerProgression) throw new Error('QianPulse orchestrator required');
  const opportunityStore = orchestrator.opportunityStore;
  const routeSmartleadWebhook = createSmartleadWebhookRouter({ opportunityStore, extractReply: extractSmartleadReply });

  async function runProactiveDevelopment(args = {}) {
    return orchestrator.runProactiveDevelopment(args);
  }

  function bindSmartleadLead({ opportunityId, leadId, campaignId, metadata = {} } = {}) {
    return opportunityStore.bindExternalRef({
      opportunityId,
      provider: 'smartlead',
      kind: 'lead',
      externalId: leadId,
      metadata: { campaign_id: campaignId || null, ...metadata }
    });
  }

  async function ingestSmartleadWebhook({ rawBody, body, headers = {}, sellerContext = {}, dependencyResults = {}, refreshedCapabilities = [] } = {}) {
    if (!webhookSecret) return { status: 'BLOCKED', code: 'SMARTLEAD_WEBHOOK_SECRET_REQUIRED' };
    const verification = verifySmartleadWebhook({ rawBody, headers, signingSecret: webhookSecret });
    if (!verification.valid) return { status: 'BLOCKED', code: verification.reason };

    let parsedBody;
    try {
      parsedBody = parseRawBody(rawBody, body);
    } catch {
      return { status: 'BLOCKED', code: 'INVALID_JSON' };
    }

    const routed = routeSmartleadWebhook({ body: parsedBody, headers });
    if (routed.status !== 'ROUTED') return routed;
    if (webhookIdempotencyStore.has(routed.idempotency_key)) {
      return { status: 'DUPLICATE', idempotency_key: routed.idempotency_key, result: webhookIdempotencyStore.get(routed.idempotency_key) };
    }

    const result = await orchestrator.runBuyerProgression({
      opportunityId: routed.opportunity.id,
      event: routed.event,
      sellerContext,
      dependencyResults,
      refreshedCapabilities
    });
    webhookIdempotencyStore.set(routed.idempotency_key, result);
    return { status: 'PROCESSED', idempotency_key: routed.idempotency_key, routed, progression: result };
  }

  return { runProactiveDevelopment, bindSmartleadLead, ingestSmartleadWebhook, opportunityStore };
}
