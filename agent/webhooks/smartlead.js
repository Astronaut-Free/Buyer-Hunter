import { createHmac, timingSafeEqual } from 'node:crypto';

function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const key = Object.keys(headers).find(item => item.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key] ?? '') : '';
}

export function verifySmartleadWebhook({ rawBody, headers, signingSecret } = {}) {
  if (!signingSecret) return { valid: false, reason: 'SMARTLEAD_WEBHOOK_SECRET_REQUIRED' };
  const signature = header(headers, 'x-smartlead-signature');
  if (!signature) return { valid: false, reason: 'SIGNATURE_MISSING' };
  const expected = `sha256=${createHmac('sha256', signingSecret).update(String(rawBody ?? '')).digest('hex')}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { valid: false, reason: 'SIGNATURE_INVALID' };
  return timingSafeEqual(a, b) ? { valid: true } : { valid: false, reason: 'SIGNATURE_INVALID' };
}

export function normalizeSmartleadWebhook({ body = {}, headers = {} } = {}) {
  return {
    provider: 'smartlead',
    request_id: header(headers, 'x-request-id') || body.id || null,
    webhook_level: header(headers, 'x-webhook-level') || body.meta?.level || null,
    event_type: body.type || body.event_type || body.event || null,
    created_at: body.created_at || body.timestamp || null,
    data: body.data || body,
    raw: body
  };
}

export function makeWebhookIdempotencyKey(event = {}) {
  const id = event.request_id || event.raw?.id;
  if (!id) throw new Error('Smartlead webhook requires X-Request-Id or body.id for idempotency');
  return `smartlead:webhook:${id}`;
}
