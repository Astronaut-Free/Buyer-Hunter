import { CAPABILITY_STATUS, makeCapabilityEnvelope, normalizeEvidenceRefs } from './guards.js';
import { A3_CAPABILITY_ID } from './capability-ids.js';

export { A3_CAPABILITY_ID };
export const A3_VERSION = '1.0.0';

function value(...items) {
  return items.find(item => item !== undefined && item !== null && String(item).trim() !== '');
}

export function runA3PurchaseTiming(context = {}) {
  const input = context.input || context;
  const opportunityId = input.opportunity_id;
  if (!opportunityId) {
    return makeCapabilityEnvelope({
      capabilityId: A3_CAPABILITY_ID,
      capabilityVersion: A3_VERSION,
      runStatus: CAPABILITY_STATUS.BLOCKED,
      missingEvidence: ['opportunity_id'],
      humanReviewRequired: true,
      domainResult: { code: 'NEEDS_CONTEXT' }
    });
  }

  const message = input.latest_buyer_message?.content || input.latest_buyer_message || '';
  const fields = input.opportunity_state?.fields || {};
  const updates = input.field_updates || {};
  const purchaseWindow = value(
    updates.purchase_window,
    updates.delivery_date,
    fields.purchase_window,
    fields.delivery_date,
    input.seller_context?.purchase_window
  );
  const hasTimingSignal = Boolean(purchaseWindow) || /delivery|lead time|deadline|quarter|month|交期|到货|月份|季度/i.test(String(message));
  const evidenceRefs = normalizeEvidenceRefs(
    input.latest_buyer_message?.evidence_ref,
    input.latest_buyer_message?.evidence_refs,
    input.evidence_refs
  );

  if (!hasTimingSignal) {
    return makeCapabilityEnvelope({
      capabilityId: A3_CAPABILITY_ID,
      capabilityVersion: A3_VERSION,
      runStatus: CAPABILITY_STATUS.MORE_EVIDENCE,
      missingEvidence: ['purchase_timing_signal'],
      evidenceRefs,
      domainResult: {
        purchase_window: null,
        timing_signal: 'UNKNOWN',
        readiness: 'NEEDS_EVIDENCE'
      }
    });
  }

  return makeCapabilityEnvelope({
    capabilityId: A3_CAPABILITY_ID,
    capabilityVersion: A3_VERSION,
    runStatus: CAPABILITY_STATUS.DONE,
    evidenceRefs,
    domainResult: {
      purchase_window: purchaseWindow || null,
      timing_signal: purchaseWindow ? 'EXPLICIT_WINDOW' : 'BUYER_TIMING_QUERY',
      readiness: purchaseWindow ? 'TIMING_KNOWN' : 'TIMING_INTEREST_CONFIRMED',
      source: purchaseWindow ? 'structured_context' : 'latest_buyer_message'
    }
  });
}
