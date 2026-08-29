export const A2_LIFECYCLES = Object.freeze([
  'TARGET_DEFINED', 'DISCOVERING', 'RESEARCHING', 'FIT_QUALIFIED', 'CONTACT_ENRICHING',
  'READY_FOR_APPROVAL', 'WAITING_APPROVAL', 'QUEUED', 'SENT', 'WAITING_REPLY',
  'FOLLOWUP_DUE', 'FOLLOWUP_QUEUED', 'STOPPED', 'HANDED_OFF_A6'
]);

export const A2_OUTREACH_STATES = Object.freeze([
  'DRAFT', 'APPROVAL_PENDING', 'APPROVED', 'QUEUED', 'SENT', 'DELIVERED',
  'BOUNCED', 'REPLIED', 'UNSUBSCRIBED', 'FAILED'
]);

export function decideA2Followup({ hasReply = false, deliveryState = 'DELIVERED', suppression = {}, sendCount = 0, maxSendCount = 3, timeAllowed = false, newSignal = false, buyerFitChanged = false } = {}) {
  if (hasReply || deliveryState === 'REPLIED') return { status: 'HANDOFF_A6' };
  if (suppression?.suppressed || suppression?.active || ['HARD_BOUNCE', 'BOUNCED', 'UNSUBSCRIBED'].includes(deliveryState)) return { status: 'STOP' };
  if (sendCount >= maxSendCount) return { status: 'STOP' };
  if (newSignal || buyerFitChanged) return { status: 'REFRESH_RESEARCH' };
  if (timeAllowed && ['SENT', 'DELIVERED'].includes(deliveryState)) return { status: 'FOLLOW_UP' };
  return { status: 'WAIT' };
}

export function applyA2EmailEvent(opportunity, event = {}, at = new Date().toISOString()) {
  const type = String(event.event_type || event.type || '').toUpperCase().replace(/[.\s-]+/g, '_');
  opportunity.a2 ||= {};
  opportunity.a2.followup ||= { send_count: 0, outreach_round: 1, max_send_count: 3 };
  const state = { SENT: ['SENT', 'SENT'], EMAIL_SENT: ['SENT', 'SENT'], DELIVERED: ['DELIVERED', 'WAITING_REPLY'], EMAIL_DELIVERED: ['DELIVERED', 'WAITING_REPLY'], HARD_BOUNCE: ['BOUNCED', 'STOPPED'], BOUNCED: ['BOUNCED', 'STOPPED'], UNSUBSCRIBE: ['UNSUBSCRIBED', 'STOPPED'], UNSUBSCRIBED: ['UNSUBSCRIBED', 'STOPPED'], REPLIED: ['REPLIED', 'HANDED_OFF_A6'], EMAIL_REPLIED: ['REPLIED', 'HANDED_OFF_A6'] }[type];
  if (!state) return { applied: false, opportunity };
  opportunity.a2.outreach_state = state[0];
  opportunity.a2.lifecycle_status = state[1];
  if (state[0] === 'SENT') {
    opportunity.a2.followup.send_count = Number(opportunity.a2.followup.send_count || 0) + 1;
    opportunity.a2.followup.last_sent_at = at;
  }
  if (state[1] === 'STOPPED' || state[1] === 'HANDED_OFF_A6') opportunity.a2.followup.next_eligible_at = null;
  opportunity.updated_at = at;
  return { applied: true, opportunity, suppression_reason: ['BOUNCED', 'UNSUBSCRIBED'].includes(state[0]) ? (state[0] === 'BOUNCED' ? 'HARD_BOUNCE' : 'UNSUBSCRIBE') : null };
}
