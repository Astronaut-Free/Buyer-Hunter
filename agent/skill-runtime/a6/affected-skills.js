import { A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID } from '../capability-ids.js';

const FIELD_CAPABILITIES = Object.freeze({
  quantity: [A4_CAPABILITY_ID],
  specification: [A4_CAPABILITY_ID],
  destination: [A5_CAPABILITY_ID],
  certification: [A4_CAPABILITY_ID, A5_CAPABILITY_ID],
  delivery_date: [A3_CAPABILITY_ID, A4_CAPABILITY_ID],
  payment_terms: [A5_CAPABILITY_ID],
  buyer_company: [A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID]
});

export function resolveAffectedSkills(fieldObservations = {}) {
  const fields = [
    ...(fieldObservations.updates || []),
    ...(fieldObservations.mentions || [])
  ].map(item => item.field);
  const affected = new Set(fields.flatMap(field => FIELD_CAPABILITIES[field] || []));
  return [A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID].filter(capabilityId => affected.has(capabilityId));
}

export { FIELD_CAPABILITIES as A6_AFFECTED_SKILL_POLICY };
