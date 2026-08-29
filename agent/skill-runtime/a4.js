import { CAPABILITY_STATUS, makeCapabilityEnvelope, normalizeEvidenceRefs } from './guards.js';

export const A4_CAPABILITY_ID = 'qianpulse.a4.supply_match';
export const A4_VERSION = '1.0.0';

function has(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function requiredFacts(changedFields = []) {
  const required = [];
  const fields = new Set(changedFields || []);
  if (fields.has('quantity')) required.push('capacity_or_moq');
  if (fields.has('specification')) required.push('specification');
  if (fields.has('certification')) required.push('certifications');
  if (fields.has('delivery_date')) required.push('delivery');
  return required;
}

export function runA4SupplyMatch(context = {}) {
  const input = context.input || context;
  const opportunityId = input.opportunity_id;
  if (!opportunityId) {
    return makeCapabilityEnvelope({
      capabilityId: A4_CAPABILITY_ID,
      capabilityVersion: A4_VERSION,
      runStatus: CAPABILITY_STATUS.BLOCKED,
      missingEvidence: ['opportunity_id'],
      humanReviewRequired: true,
      domainResult: { code: 'NEEDS_CONTEXT' }
    });
  }

  const seller = input.seller_context || {};
  const changedFields = input.changed_fields || [];
  const requirements = requiredFacts(changedFields);
  const facts = {
    capacity_or_moq: seller.capacity || seller.monthly_capacity || seller.moq || null,
    specification: seller.specification || seller.specifications || null,
    certifications: seller.certifications || seller.certification || null,
    delivery: seller.delivery || seller.lead_time || seller.leadTime || null
  };
  const missing = requirements.filter(key => !has(facts[key]));
  const evidenceRefs = normalizeEvidenceRefs(
    input.latest_buyer_message?.evidence_ref,
    input.latest_buyer_message?.evidence_refs,
    seller.evidence_refs,
    input.evidence_refs
  );

  if (missing.length) {
    return makeCapabilityEnvelope({
      capabilityId: A4_CAPABILITY_ID,
      capabilityVersion: A4_VERSION,
      runStatus: CAPABILITY_STATUS.MORE_EVIDENCE,
      changedFields,
      missingEvidence: missing,
      evidenceRefs,
      humanReviewRequired: true,
      domainResult: {
        match_status: 'NEEDS_EVIDENCE',
        checked_fields: requirements,
        verified_facts: Object.fromEntries(Object.entries(facts).filter(([, item]) => has(item)))
      }
    });
  }

  return makeCapabilityEnvelope({
    capabilityId: A4_CAPABILITY_ID,
    capabilityVersion: A4_VERSION,
    runStatus: CAPABILITY_STATUS.DONE,
    changedFields,
    evidenceRefs,
    domainResult: {
      match_status: requirements.length ? 'VERIFIED_FOR_CHANGED_FIELDS' : 'NO_REFRESH_FACT_REQUIRED',
      checked_fields: requirements,
      verified_facts: Object.fromEntries(Object.entries(facts).filter(([, item]) => has(item)))
    }
  });
}
