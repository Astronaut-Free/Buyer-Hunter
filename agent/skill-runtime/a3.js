import { A3_CAPABILITY_ID } from './capability-ids.js';

export { A3_CAPABILITY_ID };
export const A3_VERSION = '1.1.0';

export function normalizeA3Input(context = {}) {
  const input = context.input || context;
  return {
    ...input,
    latest_buyer_message: typeof input.latest_buyer_message === 'string'
      ? { content: input.latest_buyer_message, evidence_refs: [] }
      : (input.latest_buyer_message || { content: '', evidence_refs: [] }),
    opportunity_state: input.opportunity_state || { fields: {} },
    field_updates: input.field_updates || {},
    evidence_refs: input.evidence_refs || []
  };
}

export function validateA3Input(input = {}) {
  const missing = [];
  if (!input.opportunity_id) missing.push('opportunity_id');
  if (!input.evaluated_at) missing.push('evaluated_at');
  return { valid: missing.length === 0, missing };
}
