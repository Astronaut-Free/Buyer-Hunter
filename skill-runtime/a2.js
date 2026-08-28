import { CAPABILITY_STATUS, hasSuppression, isA5Blocked, makeCapabilityEnvelope, normalizeEvidenceRefs } from './guards.js';

export const A2_CAPABILITY_ID = 'qianpulse.a2.proactive_buyer_development';
export const A2_VERSION = '1.0.0';

function array(value) {
  return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : [];
}

export function normalizeA2Target(input = {}) {
  const target = input.target || {};
  const profile = input.buyer_profile || input.buyerProfile || {};
  return {
    countries: array(target.countries || target.country),
    product_keywords: array(target.product_keywords || target.productKeywords),
    hs_codes: array(target.hs_codes || target.hsCodes),
    industries: array(target.industries),
    buyer_company_types: array(profile.company_types || profile.companyTypes),
    decision_maker_roles: array(profile.buyer_roles || profile.buyerRoles),
    exclusions: [...array(input.constraints?.exclude_companies), ...array(input.constraints?.exclude_domains)]
  };
}

export function validateA2Target(targetDefinition = {}) {
  const missing = [];
  if (!targetDefinition.countries?.length) missing.push('target.countries');
  if (!targetDefinition.product_keywords?.length) missing.push('target.product_keywords');
  if (!targetDefinition.buyer_company_types?.length) missing.push('buyer_profile.company_types');
  return missing;
}

export function evaluateBuyerFit(candidate = {}) {
  const companyEvidence = normalizeEvidenceRefs(candidate.evidence_refs, candidate.source_refs);
  const productEvidence = normalizeEvidenceRefs(candidate.product_evidence, candidate.product_relevance?.evidence_refs);
  const tradeEvidence = normalizeEvidenceRefs(candidate.import_evidence, candidate.trade_evidence);
  const marketEvidence = normalizeEvidenceRefs(candidate.market_evidence);
  const relevant = candidate.sells_or_uses_product === true || candidate.product_relevance?.status === 'yes' || productEvidence.length > 0;
  const identified = Boolean(candidate.buyer_company_id || candidate.id || candidate.domain || candidate.legal_or_display_name || candidate.name);
  const evidenceRefs = normalizeEvidenceRefs(companyEvidence, productEvidence, tradeEvidence, marketEvidence);
  const confidence = identified && relevant && evidenceRefs.length >= 2 ? 'high' : identified && relevant && evidenceRefs.length ? 'medium' : 'low';
  return {
    buyer_company_id: candidate.buyer_company_id || candidate.id || null,
    product_relevance: relevant ? 'yes' : candidate.sells_or_uses_product === false ? 'no' : 'unknown',
    buyer_type: candidate.buyer_type || 'unknown',
    why_fit: candidate.why_fit || '',
    why_now: candidate.why_now || '',
    confidence,
    evidence_refs: evidenceRefs
  };
}

export function evaluateOutreachReadiness({ buyerCompany, buyerFit, contact, a5Result, suppression } = {}) {
  if (hasSuppression(suppression)) return { status: 'BLOCKED', reason: '命中 suppression / unsubscribe / manual stop' };
  if (isA5Blocked(a5Result)) return { status: 'BLOCKED', reason: 'A5 返回明确交易阻断' };
  if (!buyerCompany) return { status: 'MORE_EVIDENCE', reason: '缺少 Buyer Company' };
  if (!buyerFit || buyerFit.product_relevance !== 'yes' || !buyerFit.evidence_refs?.length) return { status: 'MORE_EVIDENCE', reason: 'Buyer Fit 缺少产品相关性或证据' };
  if (!contact || !contact.buyer_company_id) return { status: 'MORE_EVIDENCE', reason: '缺少与 Buyer Company 绑定的联系人' };
  if (!contact.work_email) return { status: 'MORE_EVIDENCE', reason: '缺少可用企业邮箱' };
  return { status: 'READY', reason: 'Buyer Company、Buyer Fit、联系人与风险条件已满足一期外联 Gate' };
}

export function decidePreReplyFollowup({ hasReply = false, deliveryState = 'DELIVERED', suppression = {}, sendCount = 0, maxSendCount = 3, timeAllowed = false, newSignal = false, buyerFitChanged = false } = {}) {
  if (hasReply) return { status: 'HANDOFF_A6' };
  if (hasSuppression(suppression) || ['HARD_BOUNCE', 'BOUNCED'].includes(deliveryState)) return { status: 'STOP' };
  if (sendCount >= maxSendCount) return { status: 'STOP' };
  if (newSignal || buyerFitChanged) return { status: 'REFRESH_RESEARCH' };
  if (timeAllowed) return { status: 'FOLLOW_UP' };
  return { status: 'WAIT' };
}

export function runA2Skill(context = {}) {
  const input = context.input || context;
  const targetDefinition = normalizeA2Target(input);
  const missingTarget = validateA2Target(targetDefinition);
  if (missingTarget.length) {
    return makeCapabilityEnvelope({
      capabilityId: A2_CAPABILITY_ID,
      capabilityVersion: A2_VERSION,
      runStatus: CAPABILITY_STATUS.MORE_EVIDENCE,
      missingEvidence: missingTarget,
      domainResult: {
        target_definition: targetDefinition,
        outreach_readiness: { status: 'MORE_EVIDENCE', reason: '目标市场定义不完整' },
        followup: { status: 'WAIT' },
        human_review_required: false
      }
    });
  }

  const buyerCompany = context.buyer_company || input.buyer_company || null;
  const buyerFit = buyerCompany ? evaluateBuyerFit(context.buyer_fit || input.buyer_fit || buyerCompany) : null;
  const contact = context.contact || input.contact || null;
  const readiness = evaluateOutreachReadiness({
    buyerCompany,
    buyerFit,
    contact,
    a5Result: context.a5_result || input.a5_result,
    suppression: context.suppression || input.suppression
  });
  const followup = decidePreReplyFollowup(context.followup_state || input.followup_state || {});
  const evidenceRefs = normalizeEvidenceRefs(buyerFit?.evidence_refs, buyerCompany?.evidence_refs, contact?.source_refs);
  const runStatus = readiness.status === 'BLOCKED'
    ? CAPABILITY_STATUS.BLOCKED
    : readiness.status === 'MORE_EVIDENCE'
      ? CAPABILITY_STATUS.MORE_EVIDENCE
      : CAPABILITY_STATUS.DONE;
  const handoff = followup.status === 'HANDOFF_A6'
    ? { next_skill: 'qianpulse-a6-opportunity-progression', reason: 'BUYER_REPLIED' }
    : null;

  return makeCapabilityEnvelope({
    capabilityId: A2_CAPABILITY_ID,
    capabilityVersion: A2_VERSION,
    runStatus,
    evidenceRefs,
    humanReviewRequired: readiness.status === 'READY',
    domainResult: {
      target_definition: targetDefinition,
      buyer_company: buyerCompany,
      buyer_fit: buyerFit,
      contact,
      contact_reason: contact?.role_reason || null,
      outreach_readiness: readiness,
      outreach: context.outreach || input.outreach || null,
      followup,
      handoff,
      human_review_required: readiness.status === 'READY'
    }
  });
}
