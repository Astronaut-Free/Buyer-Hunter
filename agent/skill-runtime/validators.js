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
  if (Array.isArray(result.candidates)) {
    if (!result.summary) errors.push('domain_result.summary required');
    if (!result.provider_trace) errors.push('domain_result.provider_trace required');
    if (!result.next_state) errors.push('domain_result.next_state required');
  } else {
    if (!result.outreach_readiness) errors.push('domain_result.outreach_readiness required');
    if (!result.followup) errors.push('domain_result.followup required');
  }
  return { valid: errors.length === 0, errors };
}

export function validateA6Envelope(envelope = {}) {
  const base = validateCapabilityEnvelope(envelope);
  const errors = [...base.errors];
  const result = envelope.domain_result || {};
  if (envelope.run_status !== 'BLOCKED') {
    for (const field of [
      'opportunity_id', 'buyer_reply', 'field_observations', 'affected_skills',
      'stage_transition', 'decision_state', 'next_action', 'evaluated_at', 'ruleset_version'
    ]) {
      if (result[field] === undefined || result[field] === null) errors.push(`domain_result.${field} required`);
    }
    if (!Array.isArray(result.field_observations?.updates)) errors.push('domain_result.field_observations.updates must be array');
    if (!Array.isArray(result.field_observations?.mentions)) errors.push('domain_result.field_observations.mentions must be array');
    if (!Array.isArray(result.affected_skills)) errors.push('domain_result.affected_skills must be array');
    if (!result.next_action?.action || !result.next_action?.execution_mode) errors.push('domain_result.next_action contract invalid');
  }
  return { valid: errors.length === 0, errors };
}
