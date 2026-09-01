export const CAPABILITY_STATUS = Object.freeze({
  DONE: 'DONE',
  MORE_EVIDENCE: 'MORE_EVIDENCE',
  BLOCKED: 'BLOCKED',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  ERROR: 'ERROR'
});

export function hasSuppression(value = {}) {
  return Boolean(
    value.suppressed ||
    value.unsubscribe ||
    value.unsubscribed ||
    value.manual_stop ||
    value.status === 'SUPPRESSED' ||
    value.status === 'UNSUBSCRIBED'
  );
}

export function isA5Blocked(a5Result = null) {
  if (!a5Result) return false;
  if (a5Result.run_status === 'BLOCKED') return true;
  const domain = a5Result.domain_result || a5Result;
  return domain.status === 'BLOCKED' || domain.decision === 'BLOCKED' || domain.blocked === true;
}

export function normalizeEvidenceRefs(...groups) {
  return [...new Set(groups.flat(Infinity).filter(Boolean).map(String))];
}

export function makeCapabilityEnvelope({
  capabilityId,
  capabilityVersion = '1.0.0',
  runStatus = CAPABILITY_STATUS.DONE,
  changedFields = [],
  missingEvidence = [],
  evidenceRefs = [],
  humanReviewRequired = false,
  domainResult = {},
  error = null
}) {
  return {
    capability_id: capabilityId,
    capability_version: capabilityVersion,
    run_status: runStatus,
    changed_fields: changedFields,
    missing_evidence: missingEvidence,
    evidence_refs: normalizeEvidenceRefs(evidenceRefs),
    human_review_required: Boolean(humanReviewRequired),
    domain_result: domainResult,
    error
  };
}
