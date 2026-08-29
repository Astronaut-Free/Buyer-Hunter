import { A5_CAPABILITY_ID } from './capability-ids.js';

export { A5_CAPABILITY_ID };
export const A5_VERSION = '1.1.0';

export function normalizeA5Input(context = {}) {
  const input = context.input || context;
  return {
    ...input,
    product: input.product || {},
    seller_sku: input.seller_sku || {},
    seller_policy: input.seller_policy || input.seller_context || {},
    regulatory_evidence: input.regulatory_evidence || [],
    evidence_refs: input.evidence_refs || []
  };
}

export function validateA5Input(input = {}) {
  const missing = [];
  if (!input.opportunity_id) missing.push('opportunity_id');
  if (!input.evaluated_at) missing.push('evaluated_at');
  return { valid: missing.length === 0, missing };
}
