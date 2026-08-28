function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

export function applyA6DependencyGate(envelope = {}, { refreshedCapabilities = [] } = {}) {
  if (!envelope?.domain_result || envelope.run_status === 'BLOCKED' || envelope.run_status === 'ERROR') return envelope;
  const invalidated = unique(envelope.domain_result.invalidated_capabilities || []);
  if (!invalidated.length) return envelope;
  const refreshed = new Set(refreshedCapabilities || []);
  const missing = invalidated.filter(capabilityId => !refreshed.has(capabilityId));
  if (!missing.length) {
    return {
      ...envelope,
      domain_result: {
        ...envelope.domain_result,
        dependency_refresh: { required: [], completed: invalidated }
      }
    };
  }

  const currentAction = envelope.domain_result.next_action || {};
  const highRisk = envelope.domain_result.execution_mode === 'HUMAN' || currentAction.action === 'HUMAN_TAKEOVER';
  const nextAction = highRisk
    ? { ...currentAction, prerequisites: unique([...(currentAction.prerequisites || []), 'refresh_invalidated_capabilities']) }
    : {
        action: 'WAIT',
        reason: '业务字段发生变化，需先刷新受影响的专业能力结果',
        prerequisites: ['refresh_invalidated_capabilities']
      };

  return {
    ...envelope,
    run_status: 'MORE_EVIDENCE',
    missing_evidence: unique([...(envelope.missing_evidence || []), ...missing.map(id => `refresh:${id}`)]),
    human_review_required: highRisk ? true : false,
    domain_result: {
      ...envelope.domain_result,
      next_action: nextAction,
      execution_mode: highRisk ? 'HUMAN' : 'AUTO',
      reply_draft: null,
      human_review_required: highRisk ? true : false,
      dependency_refresh: { required: missing, completed: invalidated.filter(id => refreshed.has(id)) }
    }
  };
}
