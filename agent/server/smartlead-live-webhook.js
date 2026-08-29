import { verifySmartleadWebhook, normalizeSmartleadWebhook, makeWebhookIdempotencyKey } from '../webhooks/smartlead.js';
import { mapSmartleadReply } from '../webhooks/smartlead-reply-mapper.js';

function parseBody(rawBody, body) {
  if (body && typeof body === 'object') return body;
  if (!rawBody) return {};
  return JSON.parse(String(rawBody));
}

export function createSmartleadLiveWebhookHandler({
  liveRuntime,
  signingSecret,
  replyMapper = mapSmartleadReply
} = {}) {
  if (!liveRuntime?.opportunityStore || !liveRuntime?.runBuyerMessage) throw new Error('liveRuntime required');

  return async function handleSmartleadWebhook({ rawBody, body, headers = {} } = {}) {
    const verification = verifySmartleadWebhook({ rawBody, headers, signingSecret });
    if (!verification.valid) return { status: 401, body: { code: verification.reason } };

    let parsed;
    try {
      parsed = parseBody(rawBody, body);
    } catch {
      return { status: 400, body: { code: 'INVALID_JSON' } };
    }

    const normalized = normalizeSmartleadWebhook({ body: parsed, headers });
    let idempotencyKey;
    try {
      idempotencyKey = makeWebhookIdempotencyKey(normalized);
    } catch (error) {
      return { status: 400, body: { code: 'IDEMPOTENCY_KEY_REQUIRED', error: error.message } };
    }

    const mapped = replyMapper(normalized);
    if (mapped?.ignore) return { status: 200, body: { status: 'IGNORED', reason: mapped.reason, idempotency_key: idempotencyKey } };
    if (!mapped?.external_lead_id) {
      return {
        status: 422,
        body: {
          code: 'LEAD_MAPPING_REQUIRED',
          idempotency_key: idempotencyKey,
          lead_email: mapped?.lead_email || null
        }
      };
    }
    if (!mapped?.content) return { status: 422, body: { code: 'MESSAGE_CONTENT_REQUIRED', idempotency_key: idempotencyKey } };

    const opportunity = liveRuntime.opportunityStore.resolveExternalRef({
      provider: 'smartlead',
      kind: 'lead',
      externalId: mapped.external_lead_id
    });
    if (!opportunity) {
      return {
        status: 422,
        body: {
          code: 'OPPORTUNITY_MAPPING_REQUIRED',
          idempotency_key: idempotencyKey,
          external_lead_id: String(mapped.external_lead_id)
        }
      };
    }

    const buyerActor = {
      id: opportunity.buyer?.id || mapped.lead_email || `smartlead-lead-${mapped.external_lead_id}`,
      role: 'BUYER'
    };
    const result = await liveRuntime.runBuyerMessage({
      opportunity_id: opportunity.id,
      idempotency_key: idempotencyKey,
      message: mapped.content,
      source_message_id: mapped.source_message_id,
      evidence_ref: mapped.evidence_ref || `smartlead:request:${normalized.request_id}`,
      timestamp: mapped.timestamp || normalized.created_at,
      source: 'smartlead',
      seller_context: opportunity.seller_context || {},
      seller_execution_policy: opportunity.seller_execution_policy || {},
      transport: mapped.transport || null,
      provider_event_type: normalized.event_type
    }, buyerActor);

    if (result.status >= 500) return result;
    if (result.status >= 400) return result;
    return {
      status: result.status === 200 ? 200 : 202,
      body: {
        status: result.status === 200 ? 'DUPLICATE' : 'PROCESSED',
        idempotency_key: idempotencyKey,
        opportunity_id: opportunity.id,
        run: result.body.run,
        approval: result.body.approval || null
      }
    };
  };
}
