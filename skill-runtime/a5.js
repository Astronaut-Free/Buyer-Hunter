import { CAPABILITY_STATUS, makeCapabilityEnvelope, normalizeEvidenceRefs } from './guards.js';

export const A5_CAPABILITY_ID = 'qianpulse.a5.trade_risk';
export const A5_VERSION = '1.0.0';

function has(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function list(value) {
  if (!has(value)) return [];
  return Array.isArray(value) ? value.map(String) : String(value).split(',').map(item => item.trim()).filter(Boolean);
}

export function runA5TradeRisk(context = {}) {
  const input = context.input || context;
  const opportunityId = input.opportunity_id;
  if (!opportunityId) {
    return makeCapabilityEnvelope({
      capabilityId: A5_CAPABILITY_ID,
      capabilityVersion: A5_VERSION,
      runStatus: CAPABILITY_STATUS.BLOCKED,
      missingEvidence: ['opportunity_id'],
      humanReviewRequired: true,
      domainResult: { code: 'NEEDS_CONTEXT', status: 'BLOCKED' }
    });
  }

  const seller = input.seller_context || {};
  const fields = { ...(input.opportunity_state?.fields || {}), ...(input.field_updates || {}) };
  const changedFields = input.changed_fields || [];
  const destination = fields.destination || input.destination || null;
  const allowedMarkets = list(seller.allowed_markets || seller.allowedMarkets);
  const blockedMarkets = list(seller.blocked_markets || seller.blockedMarkets);
  const marketAccess = seller.market_access || seller.marketAccess || seller.trade_risk || null;
  const paymentPolicy = seller.payment_policy || seller.paymentPolicy || seller.allowed_payment_terms || null;
  const evidenceRefs = normalizeEvidenceRefs(
    input.latest_buyer_message?.evidence_ref,
    input.latest_buyer_message?.evidence_refs,
    seller.evidence_refs,
    input.evidence_refs
  );

  if (destination && blockedMarkets.some(item => item.toLowerCase() === String(destination).toLowerCase())) {
    return makeCapabilityEnvelope({
      capabilityId: A5_CAPABILITY_ID,
      capabilityVersion: A5_VERSION,
      runStatus: CAPABILITY_STATUS.BLOCKED,
      changedFields,
      evidenceRefs,
      humanReviewRequired: true,
      domainResult: {
        status: 'BLOCKED',
        decision: 'BLOCKED',
        reason: 'destination explicitly blocked by seller trade policy',
        destination
      }
    });
  }

  const needsDestinationReview = changedFields.includes('destination') || changedFields.includes('certification');
  const needsPaymentReview = changedFields.includes('payment_terms');
  const missing = [];
  if (needsDestinationReview && !has(marketAccess) && !(destination && allowedMarkets.length)) missing.push('market_access_or_trade_risk');
  if (needsPaymentReview && !has(paymentPolicy)) missing.push('payment_policy');

  if (missing.length) {
    return makeCapabilityEnvelope({
      capabilityId: A5_CAPABILITY_ID,
      capabilityVersion: A5_VERSION,
      runStatus: CAPABILITY_STATUS.MORE_EVIDENCE,
      changedFields,
      missingEvidence: missing,
      evidenceRefs,
      humanReviewRequired: true,
      domainResult: {
        status: 'NEEDS_EVIDENCE',
        decision: 'REVIEW_REQUIRED',
        destination
      }
    });
  }

  const destinationAllowed = destination && allowedMarkets.length
    ? allowedMarkets.some(item => item.toLowerCase() === String(destination).toLowerCase())
    : null;

  return makeCapabilityEnvelope({
    capabilityId: A5_CAPABILITY_ID,
    capabilityVersion: A5_VERSION,
    runStatus: CAPABILITY_STATUS.DONE,
    changedFields,
    evidenceRefs,
    humanReviewRequired: false,
    domainResult: {
      status: 'REVIEWED',
      decision: 'ALLOW_WITH_EXISTING_POLICY',
      destination,
      destination_allowed: destinationAllowed,
      market_access: marketAccess,
      payment_policy: paymentPolicy || null
    }
  });
}
