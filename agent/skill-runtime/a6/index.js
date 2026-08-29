import { A6_CAPABILITY_ID } from '../capability-ids.js';
import { CAPABILITY_STATUS, makeCapabilityEnvelope, normalizeEvidenceRefs } from '../guards.js';
import { resolveAffectedSkills } from './affected-skills.js';
import { A6_RULESET_VERSION, A6_VERSION, normalizeA6Input } from './contract.js';
import { observeA6Fields } from './field-observation.js';
import { classifyReplyIntent } from './intent.js';
import { resolveA6Outcome } from './outcome-policy.js';
import { buildA6Progression } from './progression-policy.js';
import { transitionStage } from './stage-machine.js';

export function runA6Skill(context = {}) {
  const input = normalizeA6Input(context);
  if (!input.opportunity_id) {
    return makeCapabilityEnvelope({
      capabilityId: A6_CAPABILITY_ID,
      capabilityVersion: A6_VERSION,
      runStatus: CAPABILITY_STATUS.BLOCKED,
      missingEvidence: ['opportunity_id'],
      humanReviewRequired: true,
      domainResult: { code: 'NEEDS_CONTEXT', human_review_required: true }
    });
  }

  const latest = input.conversation_context.latest_message;
  const intent = classifyReplyIntent(latest.content, { evidenceRef: latest.evidence_ref });
  const fieldObservations = observeA6Fields({
    content: latest.content,
    explicitUpdates: input.field_updates,
    previousFields: input.opportunity_state.fields,
    evidenceRef: latest.evidence_ref
  });
  const affectedSkills = resolveAffectedSkills(fieldObservations);
  const candidateOutcome = resolveA6Outcome({ intent, triggerEvent: input.trigger_event, evaluatedAt: input.evaluated_at });
  const stageTransition = transitionStage({
    currentStage: input.opportunity_state.stage,
    intent,
    outcome: candidateOutcome,
    triggerEvent: input.trigger_event
  });
  const outcome = candidateOutcome && stageTransition.after === candidateOutcome.type ? candidateOutcome : null;
  const projectedOpportunityState = {
    ...input.opportunity_state,
    fields: {
      ...input.opportunity_state.fields,
      ...Object.fromEntries(fieldObservations.updates.map(item => [item.field, item.after]))
    }
  };
  const progression = buildA6Progression({
    intent,
    opportunityState: projectedOpportunityState,
    skillResults: input.skill_results,
    sellerExecutionPolicy: input.seller_execution_policy,
    outcome
  });
  const evidenceRefs = normalizeEvidenceRefs(
    latest.evidence_ref,
    intent.evidence_spans.map(item => item.evidence_ref),
    Object.values(input.skill_results).map(result => result?.evidence_refs),
    outcome?.evidence_refs
  );
  const humanReviewRequired = progression.next_action.execution_mode !== 'AUTO';

  return makeCapabilityEnvelope({
    capabilityId: A6_CAPABILITY_ID,
    capabilityVersion: A6_VERSION,
    runStatus: progression.run_status,
    changedFields: fieldObservations.updates.map(item => item.field),
    missingEvidence: progression.missing_evidence,
    evidenceRefs,
    humanReviewRequired,
    domainResult: {
      opportunity_id: input.opportunity_id,
      pass: input.pass,
      buyer_reply: { intent, questions: [], objections: [] },
      field_observations: fieldObservations,
      affected_skills: affectedSkills,
      stage_transition: stageTransition,
      decision_state: progression.decision_state,
      next_action: progression.next_action,
      key_question: progression.key_question,
      communication_brief: progression.communication_brief,
      follow_up: progression.follow_up,
      outcome,
      decision_evidence: { evidence_refs: evidenceRefs },
      evaluated_at: input.evaluated_at,
      ruleset_version: A6_RULESET_VERSION,
      human_review_required: humanReviewRequired
    }
  });
}

export { A6_CAPABILITY_ID, A6_VERSION };
export * from './affected-skills.js';
export * from './contract.js';
export * from './field-observation.js';
export * from './intent.js';
export * from './outcome-policy.js';
export * from './progression-policy.js';
export * from './stage-machine.js';
