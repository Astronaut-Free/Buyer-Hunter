import { CAPABILITY_STATUS, makeCapabilityEnvelope, normalizeEvidenceRefs } from './guards.js';

export const A8_CAPABILITY_ID = 'qianpulse.a8.deal_action';
export const A8_VERSION = '1.0.0';

function has(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

// Free's commercial judgment -> A6 input (Phase 8). Mirrors the Python
// authority (scripts/capability_cli.py run_a8) branch for branch. Bounds from
// .agents/skills/buyer-hunter-deal-action/SKILL.md: never bypass BLOCK, no
// auto-send/quote/commit — contact_strategy is guidance only.
export function runA8DealAction(context = {}) {
  const input = context.input || context;
  const opportunityId = input.opportunity_id;
  if (!opportunityId) {
    return makeCapabilityEnvelope({
      capabilityId: A8_CAPABILITY_ID,
      capabilityVersion: A8_VERSION,
      runStatus: CAPABILITY_STATUS.BLOCKED,
      missingEvidence: ['opportunity_id'],
      humanReviewRequired: true,
      domainResult: { code: 'NEEDS_CONTEXT', status: 'BLOCKED' }
    });
  }

  const decision = input.decision || {};
  const decisionStatus = decision.decision_status || null;
  const gaps = Array.isArray(decision.gaps) ? decision.gaps : [];
  const risks = Array.isArray(input.risks) ? input.risks : [];
  const accessStatus = input.access_status || decision.access_status || null;
  const stage = input.stage || decision.stage || null;
  const evidenceRefs = normalizeEvidenceRefs(
    input.latest_buyer_message?.evidence_ref,
    input.latest_buyer_message?.evidence_refs,
    input.evidence_refs
  );

  if (accessStatus === 'BLOCK' || decisionStatus === 'BLOCKED') {
    return makeCapabilityEnvelope({
      capabilityId: A8_CAPABILITY_ID,
      capabilityVersion: A8_VERSION,
      runStatus: CAPABILITY_STATUS.BLOCKED,
      evidenceRefs,
      humanReviewRequired: true,
      domainResult: {
        status: 'BLOCKED',
        decision: 'HALT',
        primary_action: { type: 'HALT', reason: '市场准入或风险门禁为 BLOCK，停止对外推进' },
        secondary_action: null,
        action_reasoning: 'A5 门禁 BLOCK，deal action 不得绕过',
        contact_strategy: null,
        follow_up: { owner: 'INTERNAL', stop_condition: 'BLOCK 解除并经人工复核' },
        required_assets: [],
        human_approval_required: true
      }
    });
  }

  if (!decisionStatus) {
    // No Free snapshot exists (A2-only opportunities) — nothing to judge, and
    // the A6 cycle must not stall on it. NOT_APPLICABLE counts as refreshed.
    return makeCapabilityEnvelope({
      capabilityId: A8_CAPABILITY_ID,
      capabilityVersion: A8_VERSION,
      runStatus: CAPABILITY_STATUS.NOT_APPLICABLE,
      evidenceRefs,
      humanReviewRequired: false,
      domainResult: { status: 'NOT_APPLICABLE', decision: 'NO_SNAPSHOT' }
    });
  }

  const mapping = {
    PURSUE_NOW: {
      primary_action: { type: 'OUTREACH', reason: '机会分与门禁支持立即推进，按决策简报触达' },
      secondary_action: null,
      action_reasoning: 'PURSUE_NOW：最高优先级机会，公开渠道触达并进入 A6 推进链',
      contact_strategy: { preferred: 'public_channel_first', note: '仅使用公开渠道；私联需人工授权' },
      follow_up: { owner: 'A6', success_condition: '买家首次回复', stop_condition: '买家明确拒绝或门禁升级' },
      required_assets: ['决策简报', '证据链接'],
      human_approval_required: true
    },
    VERIFY_FIRST: {
      primary_action: { type: 'VERIFY_GAPS', reason: gaps.length ? `先补齐缺口：${gaps.slice(0, 3).join('；')}` : '决策要求先核验再推进' },
      secondary_action: { type: 'PREPARE_OUTREACH', reason: '核验通过后即可触达' },
      action_reasoning: 'VERIFY_FIRST：证据门槛未满，先核验后推进',
      contact_strategy: { preferred: 'public_channel_first', note: '核验完成前不触达' },
      follow_up: { owner: 'INTERNAL', success_condition: '缺口补齐并复核', stop_condition: '核验失败或门禁升级' },
      required_assets: ['待核验清单', '证据链接'],
      human_approval_required: true
    },
    WATCH: {
      primary_action: { type: 'SCHEDULE_REVIEW', reason: '时机未到，安排复查而非推进' },
      secondary_action: null,
      action_reasoning: 'WATCH：当前不追，按购买窗口安排复查',
      contact_strategy: null,
      follow_up: { owner: 'A6', success_condition: '窗口信号更新', stop_condition: '决策降级为 PASS' },
      required_assets: [],
      human_approval_required: false
    },
    PASS: {
      primary_action: { type: 'NO_ACTION', reason: '决策判定为 PASS，不投入销售时间' },
      secondary_action: null,
      action_reasoning: 'PASS：不追',
      contact_strategy: null,
      follow_up: null,
      required_assets: [],
      human_approval_required: false
    }
  };
  if (!mapping[decisionStatus]) {
    return makeCapabilityEnvelope({
      capabilityId: A8_CAPABILITY_ID,
      capabilityVersion: A8_VERSION,
      runStatus: CAPABILITY_STATUS.MORE_EVIDENCE,
      evidenceRefs,
      missingEvidence: ['decision_snapshot'],
      humanReviewRequired: true,
      domainResult: { status: 'NEEDS_EVIDENCE', decision: 'REVIEW_REQUIRED' }
    });
  }
  const action = mapping[decisionStatus];

  return makeCapabilityEnvelope({
    capabilityId: A8_CAPABILITY_ID,
    capabilityVersion: A8_VERSION,
    runStatus: CAPABILITY_STATUS.DONE,
    evidenceRefs,
    humanReviewRequired: action.human_approval_required,
    domainResult: {
      status: 'DONE',
      decision: action.primary_action.type,
      decision_snapshot: {
        decision_status: decisionStatus,
        opportunity_score: decision.opportunity_score ?? null,
        component_scores: decision.component_scores || null
      },
      risk_count: risks.length,
      stage: stage || null,
      ...action
    }
  });
}
