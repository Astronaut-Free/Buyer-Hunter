import { QIANPULSE_SKILL_REGISTRY } from './skill-runtime/registry.js';
import { resolveQianPulseSkillCapabilities } from './skill-runtime/routing-policy.js';
import { validateCapabilityEnvelope } from './skill-runtime/validators.js';

export function mergeCapabilityRegistry(existing = []) {
  const merged = new Map();
  for (const item of existing || []) {
    if (item?.capability_id) merged.set(item.capability_id, { ...item });
  }
  for (const item of QIANPULSE_SKILL_REGISTRY) {
    const prior = merged.get(item.capability_id) || {};
    merged.set(item.capability_id, { ...prior, ...item, source: 'qianpulse-skill-runtime' });
  }
  return [...merged.values()];
}

export function resolveSkillCapabilitiesForEvent(event = {}) {
  const eventType = event.event_type || event.eventType || '';
  const hasBuyerReply = Boolean(event.has_buyer_reply || event.hasBuyerReply || eventType === 'BUYER_MESSAGE');
  return resolveQianPulseSkillCapabilities(eventType, { hasBuyerReply });
}

export async function invokeSkillThroughAdapter({ invoke, capabilityId, context }) {
  if (typeof invoke !== 'function') throw new Error('capability adapter invoke function required');
  const result = await invoke(capabilityId, context);
  const validation = validateCapabilityEnvelope(result);
  if (!validation.valid) {
    const error = new Error(`invalid capability envelope: ${validation.errors.join('; ')}`);
    error.code = 'INVALID_CAPABILITY_ENVELOPE';
    error.validation_errors = validation.errors;
    throw error;
  }
  return result;
}

export function buildA6ContextFromAgent({ opportunity, event, conversationContext = {}, sellerExecutionPolicy = {}, dependencyResults = {} } = {}) {
  if (!opportunity?.id) throw new Error('opportunity.id required');
  if (!event?.event_id) throw new Error('event.event_id required');
  return {
    opportunity_id: opportunity.id,
    trigger_event: {
      event_id: event.event_id,
      event_type: event.event_type,
      timestamp: event.timestamp,
      evidence_ref: event.evidence_ref || null,
      human_approved: Boolean(event.human_approved || event.payload?.human_approved)
    },
    latest_buyer_message: event.payload?.message || event.payload?.content || event.content || '',
    field_updates: event.payload?.field_updates || {},
    conversation_context: {
      ...conversationContext,
      latest_message: event.payload?.message || event.payload?.content || event.content || ''
    },
    opportunity_state: {
      status: opportunity.status || 'ACTIVE',
      stage: opportunity.stage || opportunity.status || 'CONTACTED',
      fields: opportunity.fields || {}
    },
    skill_results: {
      a3: dependencyResults.a3 || null,
      a4: dependencyResults.a4 || null,
      a5: dependencyResults.a5 || null
    },
    seller_execution_policy: sellerExecutionPolicy,
    evaluated_at: event.timestamp
  };
}

export function buildA2ContextFromAgent({ seller, target, buyerProfile, constraints, buyerCompany = null, buyerFit = null, contact = null, a5Result = null, suppression = null, followupState = null } = {}) {
  return {
    seller,
    target,
    buyer_profile: buyerProfile,
    constraints,
    execution: { channel: 'email', human_gate: true },
    buyer_company: buyerCompany,
    buyer_fit: buyerFit,
    contact,
    a5_result: a5Result,
    suppression,
    followup_state: followupState
  };
}
