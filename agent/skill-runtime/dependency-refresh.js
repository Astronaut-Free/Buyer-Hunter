import { runA3PurchaseTiming, A3_CAPABILITY_ID } from './a3.js';
import { runA4SupplyMatch, A4_CAPABILITY_ID } from './a4.js';
import { runA5TradeRisk, A5_CAPABILITY_ID } from './a5.js';
import { runA8DealAction, A8_CAPABILITY_ID } from './a8.js';

const DEFAULT_RUNNERS = Object.freeze({
  [A3_CAPABILITY_ID]: runA3PurchaseTiming,
  [A4_CAPABILITY_ID]: runA4SupplyMatch,
  [A5_CAPABILITY_ID]: runA5TradeRisk,
  [A8_CAPABILITY_ID]: runA8DealAction
});

function resultKey(capabilityId) {
  if (capabilityId === A3_CAPABILITY_ID) return 'a3';
  if (capabilityId === A4_CAPABILITY_ID) return 'a4';
  if (capabilityId === A5_CAPABILITY_ID) return 'a5';
  if (capabilityId === A8_CAPABILITY_ID) return 'a8';
  return null;
}

export function runInvalidatedDependencies({
  capabilities = [],
  opportunity,
  event,
  sellerContext = {},
  dependencyResults = {},
  runners = DEFAULT_RUNNERS
} = {}) {
  const executions = [];
  const mergedResults = { ...(dependencyResults || {}) };
  const refreshedCapabilities = [];
  const missingEvidence = [];

  for (const capabilityId of [...new Set(capabilities || [])]) {
    const runner = runners?.[capabilityId];
    if (typeof runner !== 'function') {
      executions.push({ capability_id: capabilityId, run_status: 'MORE_EVIDENCE', missing_evidence: ['dependency_runner'] });
      missingEvidence.push(`runner:${capabilityId}`);
      continue;
    }

    const rawMessage = event?.payload?.message || event?.payload?.content || event?.content || '';
    const latestBuyerMessage = typeof rawMessage === 'string'
      ? { content: rawMessage, evidence_ref: event?.evidence_ref || null }
      : {
          ...rawMessage,
          evidence_ref: rawMessage?.evidence_ref || event?.evidence_ref || null,
          evidence_refs: rawMessage?.evidence_refs || event?.evidence_refs || []
        };
    const changedFields = event?.changed_fields || event?.payload?.changed_fields || [];
    const normalizedChangedFields = changedFields.map(item => typeof item === 'string' ? item : item?.field).filter(Boolean);
    const runnerContext = {
      opportunity_id: opportunity?.id,
      latest_buyer_message: latestBuyerMessage,
      field_updates: event?.payload?.field_updates || {},
      changed_fields: normalizedChangedFields,
      opportunity_state: {
        stage: opportunity?.stage || 'CONTACTED',
        fields: opportunity?.fields || {}
      },
      seller_context: sellerContext
    };
    // Phase 8: a8 needs Free's decision snapshot, carried on the bridged row.
    if (capabilityId === A8_CAPABILITY_ID) {
      runnerContext.decision = {
        decision_status: opportunity?.decision || opportunity?.decision_status || null,
        opportunity_score: opportunity?.opportunity_score ?? null,
        component_scores: opportunity?.component_scores || null,
        gaps: opportunity?.gaps || []
      };
      runnerContext.risks = opportunity?.risks || [];
      runnerContext.access_status = opportunity?.access_status || null;
      runnerContext.stage = opportunity?.stage || 'CONTACTED';
    }
    const result = runner(runnerContext);

    executions.push(result);
    const key = resultKey(capabilityId);
    if (key) mergedResults[key] = result;
    if (['DONE', 'NOT_APPLICABLE', 'BLOCKED'].includes(result?.run_status)) refreshedCapabilities.push(capabilityId);
    if (result?.run_status === 'MORE_EVIDENCE') missingEvidence.push(...(result.missing_evidence || []).map(item => `${capabilityId}:${item}`));
  }

  return {
    executions,
    dependency_results: mergedResults,
    refreshed_capabilities: [...new Set(refreshedCapabilities)],
    missing_evidence: [...new Set(missingEvidence)]
  };
}

export { DEFAULT_RUNNERS as DEFAULT_DEPENDENCY_RUNNERS };
