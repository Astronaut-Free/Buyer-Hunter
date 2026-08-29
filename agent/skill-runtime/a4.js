import { A4_CAPABILITY_ID } from './capability-ids.js';

export { A4_CAPABILITY_ID };
export const A4_VERSION = '1.1.0';

export function normalizeA4Input(context = {}) {
  const input = context.input || context;
  return {
    ...input,
    demand: input.demand || {},
    seller_context: input.seller_context || {},
    changed_fields: input.changed_fields || [],
    evidence_refs: input.evidence_refs || []
  };
}

export function validateA4Input(input = {}) {
  const missing = [];
  if (!input.opportunity_id) missing.push('opportunity_id');
  if (!input.evaluated_at) missing.push('evaluated_at');
  return { valid: missing.length === 0, missing };
}
