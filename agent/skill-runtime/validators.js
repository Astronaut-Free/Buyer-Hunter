const VALID_STATUS = new Set(['DONE', 'MORE_EVIDENCE', 'BLOCKED', 'NOT_APPLICABLE', 'ERROR']);

export function validateCapabilityEnvelope(envelope = {}) {
  const errors = [];
  if (!envelope.capability_id) errors.push('capability_id required');
  if (!envelope.capability_version) errors.push('capability_version required');
  if (!VALID_STATUS.has(envelope.run_status)) errors.push('run_status invalid');
  if (!Array.isArray(envelope.changed_fields)) errors.push('changed_fields must be array');
  if (!Array.isArray(envelope.missing_evidence)) errors.push('missing_evidence must be array');
  if (!Array.isArray(envelope.evidence_refs)) errors.push('evidence_refs must be array');
  if (typeof envelope.human_review_required !== 'boolean') errors.push('human_review_required must be boolean');
  if (!envelope.domain_result || typeof envelope.domain_result !== 'object') errors.push('domain_result required');
  return { valid: errors.length === 0, errors };
}

export function validateA2Envelope(envelope = {}) {
  const base = validateCapabilityEnvelope(envelope);
  const errors = [...base.errors];
  const result = envelope.domain_result || {};
  if (!result.target_definition) errors.push('domain_result.target_definition required');
  if (!result.outreach_readiness) errors.push('domain_result.outreach_readiness required');
  if (!result.followup) errors.push('domain_result.followup required');
  return { valid: errors.length === 0, errors };
}

export function validateA3Envelope(envelope = {}) {
  const base = validateCapabilityEnvelope(envelope);
  const errors = [...base.errors];
  const result = envelope.domain_result || {};
  if (!['OPEN', 'MONITOR', 'CLOSED', 'UNKNOWN'].includes(result.window_status)) errors.push('domain_result.window_status invalid');
  if (!result.evaluated_at) errors.push('domain_result.evaluated_at required');
  if (!result.ruleset_version) errors.push('domain_result.ruleset_version required');
  return { valid: errors.length === 0, errors };
}

export function validateA4Envelope(envelope = {}) {
  const base = validateCapabilityEnvelope(envelope);
  const errors = [...base.errors];
  const result = envelope.domain_result || {};
  if (!['FIT', 'CONDITIONAL_FIT', 'NOT_FIT', 'NEED_MORE_DATA'].includes(result.recommendation)) errors.push('domain_result.recommendation invalid');
  if (!Number.isInteger(result.eligible_sku_count)) errors.push('domain_result.eligible_sku_count must be integer');
  if (!Array.isArray(result.eligible_skus)) errors.push('domain_result.eligible_skus must be array');
  if (!result.evaluated_at) errors.push('domain_result.evaluated_at required');
  return { valid: errors.length === 0, errors };
}

export function validateA5Envelope(envelope = {}) {
  const base = validateCapabilityEnvelope(envelope);
  const errors = [...base.errors];
  const result = envelope.domain_result || {};
  if (!['PASS', 'CONDITIONAL', 'BLOCK', 'UNKNOWN'].includes(result.access_status)) errors.push('domain_result.access_status invalid');
  if (!Array.isArray(result.risk_items)) errors.push('domain_result.risk_items must be array');
  if (!result.evaluated_at) errors.push('domain_result.evaluated_at required');
  return { valid: errors.length === 0, errors };
}

export function validateA6Envelope(envelope = {}) {
  const base = validateCapabilityEnvelope(envelope);
  const errors = [...base.errors];
  const result = envelope.domain_result || {};
  if (envelope.run_status !== 'BLOCKED' && !result.opportunity_id) errors.push('domain_result.opportunity_id required');
  if (envelope.run_status !== 'BLOCKED' && !result.stage) errors.push('domain_result.stage required');
  if (envelope.run_status !== 'BLOCKED' && !result.next_action) errors.push('domain_result.next_action required');
  return { valid: errors.length === 0, errors };
}
