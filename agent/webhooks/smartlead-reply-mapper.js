const REPLY_EVENTS = new Set(['REPLIED', 'EMAIL_REPLIED', 'EMAIL.REPLIED', 'EMAIL_REPLY']);

function first(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '') ?? null;
}

function eventName(event = {}) {
  return String(event.event_type || event.raw?.event_type || event.raw?.event || event.raw?.type || '')
    .trim()
    .toUpperCase();
}

export function mapSmartleadReply(event = {}) {
  const name = eventName(event);
  if (!REPLY_EVENTS.has(name)) return { ignore: true, reason: 'NOT_EMAIL_REPLY' };

  const raw = event.raw || {};
  const data = event.data || raw.data || raw;
  const rawReply = raw.reply || {};
  const dataReply = data.reply || {};
  const rawLead = raw.lead || {};
  const dataLead = data.lead || {};

  const externalLeadId = first(
    raw.lead_id,
    data.lead_id,
    rawLead.id,
    dataLead.id
  );
  const content = first(
    rawReply.body,
    dataReply.body,
    raw.reply_body,
    data.reply_body,
    data.reply_text,
    raw.message,
    data.message
  );
  const sourceMessageId = first(
    rawReply.message_id,
    dataReply.message_id,
    raw.message_id,
    data.message_id
  );
  const campaignId = first(raw.campaign_id, data.campaign_id);
  const leadEmail = first(raw.lead_email, data.lead_email, rawLead.email, dataLead.email);
  const timestamp = first(
    rawReply.received_at,
    dataReply.received_at,
    raw.timestamp,
    data.timestamp,
    event.created_at
  );

  return {
    ignore: false,
    external_lead_id: externalLeadId,
    lead_email: leadEmail,
    source_message_id: sourceMessageId,
    campaign_id: campaignId,
    content,
    timestamp,
    evidence_ref: sourceMessageId ? `smartlead:reply:${sourceMessageId}` : null,
    transport: {
      provider: 'smartlead',
      campaign_id: campaignId,
      lead_id: externalLeadId,
      reply_message_id: sourceMessageId,
      reply_email_time: timestamp
    }
  };
}
