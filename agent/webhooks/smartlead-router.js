import { makeWebhookIdempotencyKey, normalizeSmartleadWebhook } from './smartlead.js';

export function createSmartleadWebhookRouter({ opportunityStore, extractReply } = {}) {
  if (!opportunityStore?.resolveExternalRef) throw new Error('opportunityStore.resolveExternalRef required');
  if (typeof extractReply !== 'function') throw new Error('extractReply mapping function required');

  return function routeSmartleadWebhook({ body = {}, headers = {} } = {}) {
    const normalized = normalizeSmartleadWebhook({ body, headers });
    let idempotencyKey;
    try {
      idempotencyKey = makeWebhookIdempotencyKey(normalized);
    } catch (error) {
      return { status: 'BLOCKED', code: 'IDEMPOTENCY_KEY_REQUIRED', reason: error.message, normalized_event: normalized };
    }

    const mapped = extractReply(normalized);
    if (!mapped || mapped.ignore) {
      return { status: 'IGNORED', idempotency_key: idempotencyKey, normalized_event: normalized };
    }
    if (!mapped.external_lead_id) {
      return { status: 'BLOCKED', code: 'LEAD_MAPPING_REQUIRED', idempotency_key: idempotencyKey, normalized_event: normalized };
    }
    if (!mapped.content) {
      return { status: 'BLOCKED', code: 'MESSAGE_CONTENT_REQUIRED', idempotency_key: idempotencyKey, normalized_event: normalized };
    }

    const opportunity = opportunityStore.resolveExternalRef({
      provider: 'smartlead',
      kind: 'lead',
      externalId: mapped.external_lead_id
    });
    if (!opportunity) {
      return {
        status: 'NEEDS_CONTEXT',
        code: 'OPPORTUNITY_MAPPING_REQUIRED',
        idempotency_key: idempotencyKey,
        external_lead_id: mapped.external_lead_id,
        normalized_event: normalized
      };
    }

    return {
      status: 'ROUTED',
      idempotency_key: idempotencyKey,
      opportunity,
      event: {
        event_id: mapped.event_id || normalized.request_id,
        event_type: 'BUYER_MESSAGE',
        actor_role: 'BUYER',
        opportunity_id: opportunity.id,
        source: 'smartlead',
        timestamp: mapped.timestamp || normalized.created_at || new Date().toISOString(),
        evidence_ref: mapped.evidence_ref || null,
        payload: {
          message: {
            content: mapped.content,
            source_message_id: mapped.source_message_id || null,
            external_lead_id: String(mapped.external_lead_id),
            campaign_id: mapped.campaign_id || null,
            thread_id: mapped.thread_id || null
          },
          provider_event_type: normalized.event_type,
          raw_provider_event: normalized.raw
        }
      }
    };
  };
}
