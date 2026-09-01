export const A6_VERSION = '1.1.0';
export const A6_RULESET_VERSION = 'a6-opportunity-progression-v1.1.0';

export const A6_CONFIDENCE = Object.freeze(['HIGH', 'MEDIUM', 'LOW']);
export const A6_INTENTS = Object.freeze([
  'ACKNOWLEDGEMENT', 'UNSUBSCRIBE', 'COMPLAINT', 'PAYMENT_TERMS', 'PRICE_REQUEST',
  'SAMPLE_REQUEST', 'MOQ_SPEC_REQUEST', 'DELIVERY_REQUEST', 'CERTIFICATION_REQUEST',
  'WRONG_PERSON', 'REFERRAL', 'NOT_NOW', 'NOT_INTERESTED', 'OUT_OF_OFFICE',
  'NEED_INFORMATION', 'INTERESTED', 'UNKNOWN'
]);
export const A6_STAGES = Object.freeze([
  'CONTACTED', 'REPLIED', 'QUALIFYING', 'NEEDS_INFORMATION', 'SOLUTION_FIT',
  'QUOTE_OR_SAMPLE', 'COMMERCIAL_DISCUSSION', 'NURTURE', 'WON', 'LOST', 'STOPPED'
]);
export const A6_TERMINAL_STAGES = Object.freeze(['WON', 'LOST', 'STOPPED']);
export const A6_ACTIONS = Object.freeze([
  'WAIT', 'STOP_CONTACT', 'HUMAN_TAKEOVER', 'CREATE_SAMPLE_TASK',
  'REQUEST_MORE_EVIDENCE', 'REQUEST_REFERRAL', 'ENTER_NURTURE', 'MARK_LOST',
  'SEND_MATERIAL', 'ANSWER_WITH_EVIDENCE', 'ASK_KEY_QUESTION', 'REQUEST_APPROVAL'
]);
export const A6_DECISION_STATES = Object.freeze(['PROCEED', 'VERIFY', 'WAIT', 'STOP', 'HUMAN']);
export const A6_EXECUTION_MODES = Object.freeze(['AUTO', 'APPROVAL', 'HUMAN']);
export const A6_OUTCOMES = Object.freeze(['WON', 'LOST', 'STOPPED']);

function latestMessage(input = {}, context = {}) {
  const raw = input.conversation_context?.latest_message
    || input.latest_buyer_message
    || context.latest_buyer_message
    || context.content
    || '';
  if (typeof raw === 'string') return { content: raw, evidence_ref: input.trigger_event?.evidence_ref || null };
  return {
    ...(raw || {}),
    content: raw?.content || '',
    evidence_ref: raw?.evidence_ref || input.trigger_event?.evidence_ref || null
  };
}

export function normalizeA6Input(context = {}) {
  const input = context.input || context;
  const message = latestMessage(input, context);
  const evaluatedAt = input.evaluated_at
    || input.trigger_event?.timestamp
    || context.evaluated_at
    || new Date().toISOString();
  return {
    opportunity_id: input.opportunity_id || context.opportunity_id || null,
    evaluated_at: evaluatedAt,
    pass: input.pass || context.pass || 'FINAL',
    trigger_event: {
      event_id: input.trigger_event?.event_id || null,
      event_type: input.trigger_event?.event_type || 'BUYER_MESSAGE',
      timestamp: input.trigger_event?.timestamp || evaluatedAt,
      evidence_ref: input.trigger_event?.evidence_ref || message.evidence_ref || null,
      human_approved: Boolean(input.trigger_event?.human_approved || input.human_approved)
    },
    conversation_context: {
      ...(input.conversation_context || {}),
      latest_message: message
    },
    opportunity_state: {
      status: input.opportunity_state?.status || 'ACTIVE',
      stage: input.opportunity_state?.stage || context.current_stage || 'CONTACTED',
      fields: input.opportunity_state?.fields || {}
    },
    skill_results: {
      a3: input.skill_results?.a3 || input.a3_result || context.a3_result || null,
      a4: input.skill_results?.a4 || input.a4_result || context.a4_result || null,
      a5: input.skill_results?.a5 || input.a5_result || context.a5_result || null
    },
    seller_execution_policy: input.seller_execution_policy || context.seller_execution_policy || {
      sample_policy: null,
      approved_materials: [],
      approved_policies: []
    },
    field_updates: input.field_updates || context.field_updates || {}
  };
}

export function makeNextAction({
  action,
  reason,
  owner = 'AGENT',
  executionMode = 'AUTO',
  prerequisites = [],
  successCondition = '',
  stopCondition = '',
  dueAt = null
}) {
  return {
    action,
    reason,
    owner,
    execution_mode: executionMode,
    prerequisites: [...new Set(prerequisites.filter(Boolean))],
    success_condition: successCondition,
    stop_condition: stopCondition,
    due_at: dueAt
  };
}
