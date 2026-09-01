import { mapSmartleadReply } from './smartlead-reply-mapper.js';

const DELIVERY_EVENTS = new Map([
  ['SENT', 'SENT'], ['EMAIL_SENT', 'SENT'], ['EMAIL.SENT', 'SENT'],
  ['DELIVERED', 'DELIVERED'], ['EMAIL_DELIVERED', 'DELIVERED'], ['EMAIL.DELIVERED', 'DELIVERED'],
  ['BOUNCED', 'HARD_BOUNCE'], ['HARD_BOUNCE', 'HARD_BOUNCE'], ['EMAIL_BOUNCED', 'HARD_BOUNCE'],
  ['UNSUBSCRIBE', 'UNSUBSCRIBE'], ['UNSUBSCRIBED', 'UNSUBSCRIBE'], ['EMAIL_UNSUBSCRIBED', 'UNSUBSCRIBE']
]);

function first(...values) { return values.find(value => value !== undefined && value !== null && String(value).trim() !== '') ?? null; }

export function mapSmartleadEvent(event = {}) {
  const reply = mapSmartleadReply(event);
  if (!reply.ignore) return { ...reply, event_kind: 'REPLY', lifecycle_event: 'EMAIL_REPLIED' };
  const raw = event.raw || {};
  const data = event.data || raw.data || raw;
  const rawLead = raw.lead || {};
  const dataLead = data.lead || {};
  const name = String(event.event_type || raw.event_type || raw.event || raw.type || '').trim().toUpperCase();
  const lifecycleEvent = DELIVERY_EVENTS.get(name);
  if (!lifecycleEvent) return { ignore: true, reason: 'UNSUPPORTED_EMAIL_EVENT' };
  return {
    ignore: false,
    event_kind: 'LIFECYCLE',
    lifecycle_event: lifecycleEvent,
    external_lead_id: first(raw.lead_id, data.lead_id, rawLead.id, dataLead.id),
    lead_email: first(raw.lead_email, data.lead_email, rawLead.email, dataLead.email),
    provider_event_id: first(raw.event_id, data.event_id, raw.id, event.request_id),
    message_id: first(raw.message_id, data.message_id),
    campaign_id: first(raw.campaign_id, data.campaign_id),
    timestamp: first(raw.timestamp, data.timestamp, event.created_at)
  };
}
