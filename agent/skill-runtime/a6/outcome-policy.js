import { normalizeEvidenceRefs } from '../guards.js';

const WON_EVENTS = new Set(['ORDER_CONFIRMED', 'PO_RECEIVED', 'CONTRACT_CONFIRMED', 'MANUAL_WON']);

export function resolveA6Outcome({ intent, triggerEvent = {}, evaluatedAt } = {}) {
  const eventType = triggerEvent.event_type || 'BUYER_MESSAGE';
  const evidenceRefs = normalizeEvidenceRefs(triggerEvent.evidence_ref, intent?.evidence_spans?.map(item => item.evidence_ref));
  if (WON_EVENTS.has(eventType)) {
    if (eventType === 'MANUAL_WON' && !triggerEvent.human_approved) return null;
    if (!evidenceRefs.length) return null;
    return { type: 'WON', reason_code: eventType, evidence_refs: evidenceRefs, at: evaluatedAt };
  }
  if (eventType === 'MANUAL_LOST' && triggerEvent.human_approved && evidenceRefs.length) {
    return { type: 'LOST', reason_code: 'MANUAL_LOST', evidence_refs: evidenceRefs, at: evaluatedAt };
  }
  if (intent?.primary === 'NOT_INTERESTED' && intent.confidence === 'HIGH') {
    return { type: 'LOST', reason_code: 'BUYER_REJECTED', evidence_refs: evidenceRefs, at: evaluatedAt };
  }
  if (intent?.primary === 'UNSUBSCRIBE') {
    return { type: 'STOPPED', reason_code: 'BUYER_UNSUBSCRIBED', evidence_refs: evidenceRefs, at: evaluatedAt, suppression_signal: true };
  }
  if (eventType === 'COMPLIANCE_STOP' || (eventType === 'MANUAL_STOP' && triggerEvent.human_approved)) {
    return { type: 'STOPPED', reason_code: eventType, evidence_refs: evidenceRefs, at: evaluatedAt };
  }
  return null;
}

export { WON_EVENTS as A6_WON_EVENTS };
