import { createHash } from 'node:crypto';
import { A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID } from '../skill-runtime/capability-ids.js';
import { runA3PurchaseTiming } from '../skill-runtime/a3.js';
import { runA4SupplyMatch } from '../skill-runtime/a4.js';
import { runA5TradeRisk } from '../skill-runtime/a5.js';

export const DEFAULT_SKILL_RUNNERS = Object.freeze({
  [A3_CAPABILITY_ID]: runA3PurchaseTiming,
  [A4_CAPABILITY_ID]: runA4SupplyMatch,
  [A5_CAPABILITY_ID]: runA5TradeRisk
});

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

export function hashSkillInput(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function resultKey(capabilityId) {
  if (capabilityId === A3_CAPABILITY_ID) return 'a3';
  if (capabilityId === A4_CAPABILITY_ID) return 'a4';
  if (capabilityId === A5_CAPABILITY_ID) return 'a5';
  return null;
}

export function buildAffectedSkillInput({ capabilityId, opportunity, event, sellerContext = {}, fieldObservations = {} } = {}) {
  const rawMessage = event?.payload?.message || event?.payload?.content || event?.content || '';
  const latestBuyerMessage = typeof rawMessage === 'string'
    ? { content: rawMessage, evidence_ref: event?.evidence_ref || null }
    : { ...rawMessage, evidence_ref: rawMessage?.evidence_ref || event?.evidence_ref || null };
  const fieldUpdates = Object.fromEntries((fieldObservations.updates || []).map(item => [item.field, item.after]));
  const changedFields = [...new Set([
    ...(fieldObservations.updates || []),
    ...(fieldObservations.mentions || [])
  ].map(item => item.field))];
  return {
    capability_id: capabilityId,
    opportunity_id: opportunity?.id,
    latest_buyer_message: latestBuyerMessage,
    field_updates: fieldUpdates,
    changed_fields: changedFields,
    opportunity_state: {
      status: opportunity?.status || 'ACTIVE',
      stage: opportunity?.stage || 'CONTACTED',
      fields: {
        ...(opportunity?.fields || {}),
        product: opportunity?.fields?.product
          || opportunity?.product?.name
          || opportunity?.product?.id
          || sellerContext.product
          || sellerContext.category_code
          || null
      }
    },
    seller_context: sellerContext
  };
}

export function isSkillResultFresh(result, inputHash) {
  return Boolean(result && inputHash && result.input_hash === inputHash && result.run_status !== 'ERROR');
}

export function runAffectedSkills({
  capabilities = [],
  opportunity,
  event,
  sellerContext = {},
  fieldObservations = {},
  skillResults = {},
  runners = DEFAULT_SKILL_RUNNERS,
  generatedAt = () => new Date().toISOString()
} = {}) {
  const executions = [];
  const mergedResults = { ...(skillResults || {}) };
  const inputHashes = {};
  const refreshedCapabilities = [];
  const missingEvidence = [];

  for (const capabilityId of [...new Set(capabilities || [])]) {
    const key = resultKey(capabilityId);
    const skillInput = buildAffectedSkillInput({ capabilityId, opportunity, event, sellerContext, fieldObservations });
    const inputHash = hashSkillInput(skillInput);
    inputHashes[capabilityId] = inputHash;
    const existing = key ? mergedResults[key] : null;
    if (isSkillResultFresh(existing, inputHash)) {
      refreshedCapabilities.push(capabilityId);
      continue;
    }

    const runner = runners?.[capabilityId];
    if (typeof runner !== 'function') {
      const result = {
        capability_id: capabilityId,
        capability_version: '1.0.0',
        run_status: 'ERROR',
        changed_fields: [], missing_evidence: [], evidence_refs: [], human_review_required: true,
        domain_result: {},
        generated_at: generatedAt(), input_hash: inputHash,
        error: { code: 'DEPENDENCY_RUNNER_MISSING', message: `No runner for ${capabilityId}` }
      };
      executions.push(result);
      if (key) mergedResults[key] = result;
      continue;
    }

    let result;
    try {
      result = runner(skillInput);
      result = { ...result, generated_at: generatedAt(), input_hash: inputHash };
    } catch (error) {
      result = {
        capability_id: capabilityId,
        capability_version: '1.0.0',
        run_status: 'ERROR',
        changed_fields: [], missing_evidence: [], evidence_refs: [], human_review_required: true,
        domain_result: {}, generated_at: generatedAt(), input_hash: inputHash,
        error: { code: error.code || 'DEPENDENCY_RUNTIME_ERROR', message: error.message }
      };
    }
    executions.push(result);
    if (key) mergedResults[key] = result;
    if (result.run_status !== 'ERROR') refreshedCapabilities.push(capabilityId);
    if (result.run_status === 'MORE_EVIDENCE') {
      missingEvidence.push(...(result.missing_evidence || []).map(item => `${capabilityId}:${item}`));
    }
  }

  return {
    executions,
    skill_results: mergedResults,
    input_hashes: inputHashes,
    refreshed_capabilities: refreshedCapabilities,
    missing_evidence: [...new Set(missingEvidence)]
  };
}

export function applySkillDependencyGate(envelope = {}, { skillResults = {}, inputHashes = {} } = {}) {
  if (!envelope?.domain_result || ['BLOCKED', 'ERROR'].includes(envelope.run_status)) return envelope;
  const affected = envelope.domain_result.affected_skills || [];
  const errors = [];
  const stale = [];
  const completed = [];
  for (const capabilityId of affected) {
    const key = resultKey(capabilityId);
    const result = key ? skillResults[key] : null;
    if (result?.run_status === 'ERROR') errors.push(result);
    else if (isSkillResultFresh(result, inputHashes[capabilityId])) completed.push(capabilityId);
    else stale.push(capabilityId);
  }
  if (errors.length) {
    return {
      ...envelope,
      run_status: 'ERROR',
      error: { code: 'DEPENDENCY_RUNTIME_ERROR', message: errors.map(item => item.error?.message || item.capability_id).join('; ') },
      human_review_required: true,
      domain_result: { ...envelope.domain_result, communication_brief: null, dependency_refresh: { required: [], completed, stale, errors: errors.map(item => item.capability_id) } }
    };
  }
  if (!stale.length) {
    return { ...envelope, domain_result: { ...envelope.domain_result, dependency_refresh: { required: [], completed, stale: [] } } };
  }
  const currentAction = envelope.domain_result.next_action || {};
  const highRisk = currentAction.execution_mode === 'HUMAN' || currentAction.action === 'HUMAN_TAKEOVER';
  return {
    ...envelope,
    run_status: 'MORE_EVIDENCE',
    missing_evidence: [...new Set([...(envelope.missing_evidence || []), ...stale.map(id => `refresh:${id}`)])],
    domain_result: {
      ...envelope.domain_result,
      communication_brief: null,
      next_action: highRisk ? {
        ...currentAction,
        prerequisites: [...new Set([...(currentAction.prerequisites || []), 'refresh_affected_skills'])]
      } : {
        action: 'WAIT', reason: '受影响的专业能力结果尚未按当前输入刷新', owner: 'AGENT', execution_mode: 'AUTO',
        prerequisites: ['refresh_affected_skills'], success_condition: 'all affected skills are fresh', stop_condition: 'dependency error', due_at: null
      },
      decision_state: highRisk ? 'HUMAN' : 'VERIFY',
      dependency_refresh: { required: stale, completed, stale }
    }
  };
}

export { resultKey as affectedSkillResultKey };
