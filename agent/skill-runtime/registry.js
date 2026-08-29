import { A2_CAPABILITY_ID, A2_VERSION } from './a2.js';
import { A3_CAPABILITY_ID, A3_VERSION } from './a3.js';
import { A4_CAPABILITY_ID, A4_VERSION } from './a4.js';
import { A5_CAPABILITY_ID, A5_VERSION } from './a5.js';
import { A6_CAPABILITY_ID, A6_VERSION } from './a6.js';
import { A8_CAPABILITY_ID, A8_VERSION } from './a8.js';

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
    capability_id: A3_CAPABILITY_ID,
    version: A3_VERSION,
    description: '刷新采购时机判断，基于最新买家时点信号与结构化采购窗口输出当前 timing evidence。',
    required_inputs: ['opportunity_id', 'latest_buyer_message', 'opportunity_state'],
    produced_outputs: ['purchase_window', 'timing_signal', 'readiness'],
    status_contract: ['DONE', 'MORE_EVIDENCE', 'BLOCKED', 'NOT_APPLICABLE', 'ERROR'],
    timeout_seconds: 30,
    enabled: true
  },
  {
    capability_id: A4_CAPABILITY_ID,
    version: A4_VERSION,
    description: '刷新供给匹配所需事实，对数量、规格、认证、交期相关变化执行证据完整性校验。',
    required_inputs: ['opportunity_id', 'changed_fields', 'seller_context'],
    produced_outputs: ['match_status', 'checked_fields', 'verified_facts'],
    status_contract: ['DONE', 'MORE_EVIDENCE', 'BLOCKED', 'NOT_APPLICABLE', 'ERROR'],
    timeout_seconds: 30,
    enabled: true
  },
  {
    capability_id: A5_CAPABILITY_ID,
    version: A5_VERSION,
    description: '刷新贸易风险判断，对目的地、认证、支付条件变化执行市场准入与卖家政策校验。',
    required_inputs: ['opportunity_id', 'changed_fields', 'seller_context'],
    produced_outputs: ['status', 'decision', 'destination', 'market_access', 'payment_policy'],
    status_contract: ['DONE', 'MORE_EVIDENCE', 'BLOCKED', 'NOT_APPLICABLE', 'ERROR'],
    timeout_seconds: 30,
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
  },
  {
    capability_id: A8_CAPABILITY_ID,
    version: A8_VERSION,
    description: 'Phase 8：Free 的商业判断（决策快照 + 风险 + 门禁）作为 deal-action 快照喂给 A6；A6 保有 next_action 唯一所有权。',
    required_inputs: ['opportunity_id', 'decision', 'risks', 'access_status'],
    produced_outputs: ['primary_action', 'secondary_action', 'action_reasoning', 'contact_strategy', 'follow_up', 'required_assets', 'human_approval_required'],
    status_contract: ['DONE', 'MORE_EVIDENCE', 'BLOCKED', 'NOT_APPLICABLE', 'ERROR'],
    timeout_seconds: 30,
    enabled: true
  }
]);

export function getQianPulseSkillMetadata(capabilityId) {
  return QIANPULSE_SKILL_REGISTRY.find(item => item.capability_id === capabilityId) || null;
}
