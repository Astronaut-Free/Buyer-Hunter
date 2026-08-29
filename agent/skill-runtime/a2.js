import { CAPABILITY_STATUS, hasSuppression, isA5Blocked, makeCapabilityEnvelope, normalizeEvidenceRefs } from './guards.js';
import { A2_CAPABILITY_ID } from './capability-ids.js';
import { evaluateA2BuyerFit } from './a2-buyer-fit.js';
import { evaluateA2ContactFit } from './a2-contact-fit.js';
import { bindBuyerCompanyIdentity } from './a2-company-identity.js';
import { decideA2Followup } from './a2-state-machine.js';

export { A2_CAPABILITY_ID };
export const A2_VERSION = '1.1.0';

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
    industries: array(target.industries || profile.industries),
    buyer_company_types: array(profile.company_types || profile.companyTypes),
    decision_maker_roles: array(profile.buyer_roles || profile.buyerRoles),
    preferred_business_models: array(profile.preferred_business_models),
    excluded_company_types: array(profile.excluded_company_types),
    exclude_companies: array(input.constraints?.exclude_companies),
    exclude_domains: array(input.constraints?.exclude_domains),
    exclude_existing_customers: input.constraints?.exclude_existing_customers !== false,
    market_scope: target.market_scope || null,
    product_context: target.product_context || input.product_context || {
      product_id: input.seller?.product_id || null,
      product_name: input.seller?.product_name || array(target.product_keywords)[0] || null,
      category: null, specifications: null, certifications: null, price_position: null, moq: null, supply_capacity: null
    },
    seller_value_context: target.seller_value_context || input.seller_value_context || null,
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

export function evaluateBuyerFit(candidate = {}, targetDefinition = {}) {
  return evaluateA2BuyerFit(candidate, targetDefinition);
}

export function canonicalizeA2Envelope(envelope = {}) {
  const result = envelope.domain_result || {};
  if (Array.isArray(result.candidates)) return envelope;
  const hasCandidate = Boolean(result.buyer_company);
  const candidate = hasCandidate ? {
    candidate_id: `a2c_${result.buyer_company?.buyer_company_key || result.buyer_company?.buyer_company_id || 'direct'}`,
    buyer_company: result.buyer_company,
    buyer_fit: result.buyer_fit,
    development_priority: result.buyer_fit ? { score: result.buyer_fit.development_priority_score || 0, score_components: result.buyer_fit.score_components || {} } : null,
    contact: result.contact || null,
    dependency_status: result.dependencies || null,
    outreach_readiness: result.outreach_readiness,
    outreach: result.outreach || null,
    lifecycle: result.lifecycle || (result.outreach_readiness?.status === 'READY' ? 'READY_FOR_APPROVAL' : 'NEEDS_EVIDENCE'),
    evidence_refs: envelope.evidence_refs || [],
    errors: []
  } : null;
  const candidates = candidate ? [candidate] : [];
  return {
    ...envelope,
    domain_result: {
      target_definition: result.target_definition || {}, candidates,
      summary: { discovered: candidates.length, researched: candidates.length, fit_qualified: candidate?.buyer_fit?.decision === 'FIT_QUALIFIED' ? 1 : 0, contact_enriched: candidate?.contact ? 1 : 0, ready: candidate?.outreach_readiness?.status === 'READY' ? 1 : 0, blocked: candidate?.outreach_readiness?.status === 'BLOCKED' ? 1 : 0, errors: 0 },
      provider_trace: { direct_adapter: { status: 'OK' } },
      missing_evidence: envelope.missing_evidence || [],
      next_state: result.handoff ? 'HANDED_OFF_A6' : candidate?.lifecycle || 'TARGET_DEFINED',
      human_review_required: Boolean(envelope.human_review_required)
    }
  };
}

function dependencyStatus(result) {
  return String(result?.run_status || result?.status || result?.domain_result?.status || '').toUpperCase();
}

export function evaluateOutreachReadiness({ buyerCompany, buyerFit, contact, contactFit, a4Result, a5Result, suppression, execution = {}, seller = {}, existingOpportunity } = {}) {
  if (hasSuppression(suppression || {})) return { status: 'BLOCKED', reason: '命中 suppression / unsubscribe / manual stop' };
  if (existingOpportunity) return { status: 'BLOCKED', reason: 'EXISTING_OPPORTUNITY', existing_opportunity_id: existingOpportunity.id || existingOpportunity.opportunity_id };
  if (isA5Blocked(a5Result)) return { status: 'BLOCKED', reason: 'A5 返回明确交易阻断' };
  if (!buyerCompany) return { status: 'MORE_EVIDENCE', reason: '缺少 Buyer Company' };
  if (!buyerFit || buyerFit.decision !== 'FIT_QUALIFIED' || !buyerFit.evidence_refs?.length) return { status: 'MORE_EVIDENCE', reason: 'BUYER_FIT_NOT_QUALIFIED' };
  if (!contact || contactFit?.status !== 'READY') return { status: 'MORE_EVIDENCE', reason: contactFit?.reason || '缺少与 Buyer Company 绑定的合格联系人' };
  if (!seller.company_name && !seller.name) return { status: 'MORE_EVIDENCE', reason: 'SELLER_COMPANY_NAME_REQUIRED' };
  if (!seller.product_name && !seller.product?.name && !seller.product_id) return { status: 'MORE_EVIDENCE', reason: 'SELLER_PRODUCT_REQUIRED' };
  const a4Status = dependencyStatus(a4Result);
  const a5Status = dependencyStatus(a5Result);
  if (a4Status === 'BLOCKED') return { status: 'BLOCKED', reason: 'A4_SUPPLY_BLOCKED' };
  if (!['DONE', 'PASS', 'READY'].includes(a4Status)) return { status: 'MORE_EVIDENCE', reason: 'A4_SUPPLY_CHECK_REQUIRED' };
  if (!['DONE', 'PASS', 'READY', 'REVIEWED'].includes(a5Status)) return { status: 'MORE_EVIDENCE', reason: 'A5_MARKET_RISK_CHECK_REQUIRED' };
  if (execution.human_gate !== true) return { status: 'BLOCKED', reason: 'HUMAN_GATE_REQUIRED' };
  if (!execution.campaign_id) return { status: 'MORE_EVIDENCE', reason: 'TRANSPORT_CAMPAIGN_REQUIRED', missing_evidence: ['execution.campaign_id'] };
  return { status: 'READY', reason: 'Buyer Fit、联系人、A4/A5、Suppression、Transport 与 Human Gate 均已满足', human_review_required: contactFit?.human_review_required !== false };
}

export function decidePreReplyFollowup({ hasReply = false, deliveryState = 'DELIVERED', suppression = {}, sendCount = 0, maxSendCount = 3, timeAllowed = false, newSignal = false, buyerFitChanged = false } = {}) {
  return decideA2Followup({ hasReply, deliveryState, suppression: { ...suppression, active: hasSuppression(suppression) }, sendCount, maxSendCount, timeAllowed, newSignal, buyerFitChanged });
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

  const rawBuyerCompany = context.buyer_company || input.buyer_company || null;
  const buyerCompany = rawBuyerCompany ? bindBuyerCompanyIdentity(rawBuyerCompany) : null;
  const suppliedFit = context.buyer_fit || input.buyer_fit;
  const buyerFit = buyerCompany ? (suppliedFit?.development_priority_score !== undefined ? suppliedFit : evaluateA2BuyerFit({ ...buyerCompany, ...(suppliedFit || {}) }, targetDefinition)) : null;
  const rawContact = context.contact || input.contact || null;
  const contactFit = rawContact && buyerCompany ? evaluateA2ContactFit(rawContact, buyerCompany, { companySize: buyerCompany.company_size }) : null;
  const contact = contactFit?.contact || rawContact;
  const readiness = evaluateOutreachReadiness({
    buyerCompany,
    buyerFit,
    contact,
    contactFit,
    a4Result: context.a4_result || input.a4_result || input.dependencies?.a4,
    a5Result: context.a5_result || input.a5_result || input.dependencies?.a5,
    suppression: context.suppression || input.suppression,
    execution: input.execution || {},
    seller: input.seller || {},
    existingOpportunity: context.existing_opportunity || input.existing_opportunity
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
      contact_fit: contactFit,
      contact_reason: contactFit?.reason || contact?.role_reason || null,
      dependencies: {
        a3: context.a3_result || input.a3_result || input.dependencies?.a3 || null,
        a4: context.a4_result || input.a4_result || input.dependencies?.a4 || null,
        a5: context.a5_result || input.a5_result || input.dependencies?.a5 || null
      },
      outreach_readiness: readiness,
      outreach: context.outreach || input.outreach || null,
      followup,
      handoff,
      human_review_required: readiness.status === 'READY'
    }
  });
}
