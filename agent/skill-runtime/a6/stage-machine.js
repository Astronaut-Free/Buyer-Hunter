import { A6_STAGES, A6_TERMINAL_STAGES } from './contract.js';

export const ALLOWED_TRANSITIONS = Object.freeze({
  CONTACTED: ['REPLIED', 'NURTURE', 'LOST', 'STOPPED'],
  REPLIED: ['QUALIFYING', 'NEEDS_INFORMATION', 'NURTURE', 'LOST', 'STOPPED'],
  QUALIFYING: ['NEEDS_INFORMATION', 'SOLUTION_FIT', 'QUOTE_OR_SAMPLE', 'COMMERCIAL_DISCUSSION', 'NURTURE', 'LOST', 'STOPPED'],
  NEEDS_INFORMATION: ['QUALIFYING', 'SOLUTION_FIT', 'NURTURE', 'LOST', 'STOPPED'],
  SOLUTION_FIT: ['QUOTE_OR_SAMPLE', 'COMMERCIAL_DISCUSSION', 'NURTURE', 'LOST', 'STOPPED'],
  QUOTE_OR_SAMPLE: ['COMMERCIAL_DISCUSSION', 'WON', 'NURTURE', 'LOST', 'STOPPED'],
  COMMERCIAL_DISCUSSION: ['WON', 'NURTURE', 'LOST', 'STOPPED'],
  NURTURE: ['REPLIED', 'QUALIFYING', 'LOST', 'STOPPED'],
  WON: [],
  LOST: [],
  STOPPED: []
});

const STAGE_RANK = Object.freeze(Object.fromEntries(A6_STAGES.map((stage, index) => [stage, index])));

function desiredStage(currentStage, intent, outcome) {
  if (outcome?.type) return outcome.type;
  const primary = intent?.primary || 'UNKNOWN';
  if (primary === 'NOT_NOW' || primary === 'OUT_OF_OFFICE') return 'NURTURE';
  if (['PRICE_REQUEST', 'PAYMENT_TERMS'].includes(primary)) return 'COMMERCIAL_DISCUSSION';
  if (primary === 'SAMPLE_REQUEST') return 'QUOTE_OR_SAMPLE';
  if (primary === 'ACKNOWLEDGEMENT' || primary === 'UNKNOWN' || primary === 'COMPLAINT') return currentStage;
  if (currentStage === 'CONTACTED') return 'REPLIED';
  if (currentStage === 'REPLIED' && [
    'MOQ_SPEC_REQUEST', 'DELIVERY_REQUEST', 'CERTIFICATION_REQUEST', 'NEED_INFORMATION', 'INTERESTED'
  ].includes(primary)) return 'QUALIFYING';
  if (['MOQ_SPEC_REQUEST', 'DELIVERY_REQUEST', 'CERTIFICATION_REQUEST', 'NEED_INFORMATION'].includes(primary)) return 'QUALIFYING';
  return currentStage;
}

export function transitionStage({ currentStage = 'CONTACTED', intent, outcome, triggerEvent = {} } = {}) {
  const before = A6_STAGES.includes(currentStage) ? currentStage : 'CONTACTED';
  if (A6_TERMINAL_STAGES.includes(before)) {
    if (triggerEvent.event_type === 'MANUAL_RESUME' && triggerEvent.human_approved) {
      return { before, after: 'REPLIED', transition_applied: true, reason: 'MANUAL_RESUME_APPROVED' };
    }
    return { before, after: before, transition_applied: false, reason: 'TERMINAL_STATE_LOCKED' };
  }

  const desired = desiredStage(before, intent, outcome);
  if (desired === before) return { before, after: before, transition_applied: false, reason: 'NO_STAGE_CHANGE' };
  if ((ALLOWED_TRANSITIONS[before] || []).includes(desired)) {
    return { before, after: desired, transition_applied: true, reason: outcome ? `OUTCOME_${outcome.type}` : `INTENT_${intent?.primary || 'UNKNOWN'}` };
  }
  return {
    before,
    after: before,
    transition_applied: false,
    reason: STAGE_RANK[desired] < STAGE_RANK[before] ? 'ILLEGAL_STAGE_REGRESSION' : 'ILLEGAL_STAGE_TRANSITION'
  };
}
