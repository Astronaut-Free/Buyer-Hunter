import { A2_CAPABILITY_ID, A2_VERSION } from './a2.js';
import { A6_CAPABILITY_ID, A6_VERSION } from './a6.js';

export const QIANPULSE_SKILL_REGISTRY = Object.freeze([
  {
    capability_id: A2_CAPABILITY_ID,
    version: A2_VERSION,
    description: '主动开发海外潜在买家：Buyer Company → Buyer Fit → Contact → Email-ready → pre-reply follow-up。',
    required_inputs: ['seller', 'target', 'buyer_profile', 'constraints', 'execution'],
    produced_outputs: ['target_definition', 'buyer_company', 'buyer_fit', 'contact', 'outreach_readiness', 'followup', 'handoff'],
    status_contract: ['DONE', 'MORE_EVIDENCE', 'BLOCKED', 'NOT_APPLICABLE', 'ERROR'],
    timeout_seconds: 120,
    enabled: true
  },
  {
    capability_id: A6_CAPABILITY_ID,
    version: A6_VERSION,
    description: '买家回复后的 Opportunity Progression：意图、变化、阶段、下一动作、Human Gate 与 Outcome。',
    required_inputs: ['opportunity_id', 'trigger_event', 'conversation_context', 'opportunity_state', 'seller_context'],
    produced_outputs: ['buyer_reply', 'stage', 'changed_business_fields', 'next_action', 'execution_mode', 'outcome'],
    status_contract: ['DONE', 'MORE_EVIDENCE', 'BLOCKED', 'NOT_APPLICABLE', 'ERROR'],
    timeout_seconds: 90,
    enabled: true
  }
]);

export function getQianPulseSkillMetadata(capabilityId) {
  return QIANPULSE_SKILL_REGISTRY.find(item => item.capability_id === capabilityId) || null;
}
