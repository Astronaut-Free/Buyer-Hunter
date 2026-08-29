import { CAPABILITY_STATUS, isA5Blocked, makeCapabilityEnvelope, normalizeEvidenceRefs } from './guards.js';

export const A6_CAPABILITY_ID = 'qianpulse.a6.opportunity_progression';
export const A6_VERSION = '1.0.0';

export const A6_STAGES = Object.freeze([
  'CONTACTED', 'REPLIED', 'QUALIFYING', 'NEEDS_INFORMATION', 'SOLUTION_FIT',
  'QUOTE_OR_SAMPLE', 'COMMERCIAL_DISCUSSION', 'NURTURE', 'WON', 'LOST', 'STOPPED'
]);

const intentRules = [
  ['UNSUBSCRIBE', /unsubscribe|remove me|stop emailing|退订|不要再联系/i],
  ['COMPLAINT', /complain|complaint|angry|unacceptable|投诉|不满|欺骗/i],
  ['PAYMENT_TERMS', /payment terms?|付款条件|账期|信用证|letter of credit|\bl\/c\b/i],
  ['PRICE_REQUEST', /formal quotation|quotation|quote|price|pricing|报价|价格/i],
  ['SAMPLE_REQUEST', /sample|样品|寄样/i],
  ['MOQ_SPEC_REQUEST', /\bmoq\b|minimum order|specification|\bspec\b|规格|起订量/i],
  ['DELIVERY_REQUEST', /delivery|lead time|shipping date|交期|到货|发货/i],
  ['CERTIFICATION_REQUEST', /certification|certificate|organic|fda|jas|认证|证书/i],
  ['WRONG_PERSON', /wrong person|not responsible|not my area|找错人|不负责/i],
  ['REFERRAL', /contact .* instead|speak to|refer|转给|联系人是/i],
  ['NOT_NOW', /not now|later|next quarter|next year|以后再说|暂时不需要|目前不需要/i],
  ['NOT_INTERESTED', /not interested|no interest|不感兴趣|不需要/i],
  ['OUT_OF_OFFICE', /out of office|on leave|vacation|休假|不在办公室/i],
  ['NEED_INFORMATION', /send .*info|more information|catalog|datasheet|资料|目录|介绍/i],
  ['INTERESTED', /interested|sounds good|let's discuss|有兴趣|可以聊|进一步沟通/i]
];

export function classifyReplyIntent(content = '') {
  const text = String(content || '').trim();
  const matched = intentRules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  if (!matched.length) {
    if (/^(thanks|thank you|thanks,? received|received|谢谢|收到|好的|ok|okay|got it)[.!！。 ]*$/i.test(text)) {
      return { primary: 'NEED_INFORMATION', secondary: [], acknowledgement: true, confidence: 'medium' };
    }
    return { primary: 'UNKNOWN', secondary: [], acknowledgement: false, confidence: 'low' };
  }
  const priority = ['UNSUBSCRIBE', 'COMPLAINT', 'PAYMENT_TERMS', 'PRICE_REQUEST', 'SAMPLE_REQUEST', 'MOQ_SPEC_REQUEST', 'DELIVERY_REQUEST', 'CERTIFICATION_REQUEST', 'WRONG_PERSON', 'REFERRAL', 'NOT_INTERESTED', 'NOT_NOW', 'NEED_INFORMATION', 'INTERESTED', 'OUT_OF_OFFICE'];
  matched.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
  return { primary: matched[0], secondary: matched.slice(1), acknowledgement: false, confidence: 'high' };
}

export function detectA6ChangedFields({ content = '', fieldUpdates = {}, previousFields = {} } = {}) {
  const changed = [];
  for (const [field, after] of Object.entries(fieldUpdates || {})) {
    const before = previousFields?.[field];
    if (JSON.stringify(before) !== JSON.stringify(after)) changed.push({ field, before: before ?? null, after, evidence_ref: null });
  }
  const text = String(content || '').toLowerCase();
  const inferred = [
    ['quantity', /quantity|volume|\btons?\b|\bkg\b|数量|采购量|吨|公斤/],
    ['destination', /destination|ship(?:ment)? to|deliver to|目的地|发到|运到/],
    ['specification', /specification|\bspec\b|mesh|package|规格|目数|包装/],
    ['certification', /certification|certificate|organic|fda|jas|认证|证书/],
    ['moq', /\bmoq\b|minimum order|起订量/],
    ['price_request', /price|pricing|quotation|quote|价格|报价/],
    ['delivery_date', /delivery|lead time|deadline|交期|到货|发货日期/],
    ['payment_terms', /payment terms?|付款条件|账期|信用证/],
    ['sample_request', /sample|样品|寄样/]
  ];
  const existing = new Set(changed.map(item => item.field));
  for (const [field, pattern] of inferred) {
    if (pattern.test(text) && !existing.has(field)) changed.push({ field, before: previousFields?.[field] ?? null, after: null, evidence_ref: null, needs_structured_extraction: true });
  }
  return changed;
}

export function routeA6ChangedFields(changedFields = []) {
  const mapping = {
    quantity: ['qianpulse.a4.supply_match'],
    specification: ['qianpulse.a4.supply_match'],
    destination: ['qianpulse.a5.trade_risk'],
    certification: ['qianpulse.a4.supply_match', 'qianpulse.a5.trade_risk'],
    delivery_date: ['qianpulse.a3.purchase_timing', 'qianpulse.a4.supply_match'],
    payment_terms: ['qianpulse.a5.trade_risk'],
    buyer_company: ['qianpulse.a3.purchase_timing', 'qianpulse.a4.supply_match', 'qianpulse.a5.trade_risk'],
    sample_request: []
  };
  const routed = [...new Set(changedFields.flatMap(item => mapping[item.field] || []))];
  // any business change also invalidates the commercial judgment (Phase 8)
  if (routed.length) routed.push('qianpulse.a8.deal_action');
  return routed;
}

export function deriveA6Stage({ currentStage = 'CONTACTED', intent, a5Result } = {}) {
  if (isA5Blocked(a5Result)) return currentStage;
  const primary = intent?.primary || intent;
  if (primary === 'UNSUBSCRIBE') return 'STOPPED';
  if (primary === 'NOT_INTERESTED') return 'LOST';
  if (primary === 'NOT_NOW' || primary === 'OUT_OF_OFFICE') return 'NURTURE';
  if (['PRICE_REQUEST', 'PAYMENT_TERMS'].includes(primary)) return 'COMMERCIAL_DISCUSSION';
  if (primary === 'SAMPLE_REQUEST') return 'QUOTE_OR_SAMPLE';
  if (['MOQ_SPEC_REQUEST', 'DELIVERY_REQUEST', 'CERTIFICATION_REQUEST', 'NEED_INFORMATION'].includes(primary)) return currentStage === 'CONTACTED' ? 'REPLIED' : 'QUALIFYING';
  if (primary === 'INTERESTED') return currentStage === 'CONTACTED' ? 'REPLIED' : currentStage;
  return currentStage;
}

export function selectA6NextAction({ intent, a5Result, a8Result = null, sellerContext = {}, acknowledgement = false } = {}) {
  const primary = intent?.primary || intent || 'UNKNOWN';
  const secondary = intent?.secondary || [];
  // Phase 8: Free's commercial judgment may HALT or defer the cycle, but A6
  // keeps ownership of next_action — the a8 snapshot is an input, not a driver.
  const a8Action = a8Result?.domain_result?.primary_action || a8Result?.primary_action || null;
  if (a8Action?.type === 'HALT') {
    return { action: 'WAIT', reason: `A8 商业判断 HALT：${a8Action.reason}`, execution_mode: 'HUMAN', human_review_required: true };
  }
  if (a8Action?.type === 'SCHEDULE_REVIEW') {
    return { action: 'WAIT', reason: `A8 时机判断 SCHEDULE_REVIEW：${a8Action.reason}`, execution_mode: 'AUTO', human_review_required: false };
  }
  if (isA5Blocked(a5Result)) return { action: 'WAIT', reason: 'A5 返回 BLOCKED，停止对外推进', execution_mode: 'HUMAN', human_review_required: true };
  if (primary === 'UNSUBSCRIBE') return { action: 'STOP_CONTACT', reason: '买家明确退订', execution_mode: 'AUTO', human_review_required: false };
  if (primary === 'COMPLAINT') return { action: 'HUMAN_TAKEOVER', reason: '投诉属于高风险场景', execution_mode: 'HUMAN', human_review_required: true };
  if (primary === 'PAYMENT_TERMS' || secondary.includes('PAYMENT_TERMS')) return { action: 'HUMAN_TAKEOVER', reason: '涉及支付条件', execution_mode: 'HUMAN', human_review_required: true };
  if (primary === 'PRICE_REQUEST' || secondary.includes('PRICE_REQUEST')) return { action: 'HUMAN_TAKEOVER', reason: '涉及正式价格或报价', execution_mode: 'HUMAN', human_review_required: true };
  if (primary === 'SAMPLE_REQUEST') {
    const hasPolicy = Boolean(sellerContext.sample_policy || sellerContext.samplePolicy);
    return hasPolicy
      ? { action: 'CREATE_SAMPLE_TASK', reason: '买家明确提出寄样请求', execution_mode: 'APPROVAL', human_review_required: true }
      : { action: 'REQUEST_MORE_EVIDENCE', reason: '缺少卖家样品政策或执行条件', execution_mode: 'APPROVAL', human_review_required: true };
  }
  if (primary === 'WRONG_PERSON' || primary === 'REFERRAL') return { action: 'REQUEST_REFERRAL', reason: '当前联系人并非合适负责人或已提供转介绍线索', execution_mode: 'APPROVAL', human_review_required: true };
  if (primary === 'NOT_NOW' || primary === 'OUT_OF_OFFICE') return { action: 'ENTER_NURTURE', reason: '当前时点不适合继续强推进', execution_mode: 'APPROVAL', human_review_required: true };
  if (primary === 'NOT_INTERESTED') return { action: 'MARK_LOST', reason: '买家明确拒绝当前机会', execution_mode: 'APPROVAL', human_review_required: true };
  if (primary === 'NEED_INFORMATION') return acknowledgement
    ? { action: 'WAIT', reason: '当前仅为礼貌确认，没有新增业务问题', execution_mode: 'AUTO', human_review_required: false }
    : { action: 'SEND_MATERIAL', reason: '买家要求补充资料', execution_mode: 'APPROVAL', human_review_required: true };
  if (['MOQ_SPEC_REQUEST', 'DELIVERY_REQUEST', 'CERTIFICATION_REQUEST'].includes(primary)) return { action: 'ANSWER_WITH_EVIDENCE', reason: '买家提出可由已验证业务资料回答的问题', execution_mode: 'APPROVAL', human_review_required: true };
  if (primary === 'INTERESTED') return { action: 'ASK_KEY_QUESTION', reason: '买家表达兴趣，需确认一个关键需求以推进资格判断', execution_mode: 'APPROVAL', human_review_required: true };
  return { action: 'REQUEST_APPROVAL', reason: '意图置信度不足或无法可靠判断', execution_mode: 'APPROVAL', human_review_required: true };
}

export function runA6Skill(context = {}) {
  const input = context.input || context;
  const opportunityId = input.opportunity_id || context.opportunity_id;
  if (!opportunityId) {
    return makeCapabilityEnvelope({
      capabilityId: A6_CAPABILITY_ID,
      capabilityVersion: A6_VERSION,
      runStatus: CAPABILITY_STATUS.BLOCKED,
      missingEvidence: ['opportunity_id'],
      domainResult: { code: 'NEEDS_CONTEXT', human_review_required: true },
      humanReviewRequired: true
    });
  }
  const message = input.latest_buyer_message?.content || input.latest_buyer_message || context.content || '';
  const intent = classifyReplyIntent(message);
  const changedFields = detectA6ChangedFields({
    content: message,
    fieldUpdates: input.field_updates || context.field_updates,
    previousFields: input.opportunity_state?.fields || context.opportunity_state?.fields || {}
  });
  const invalidatedCapabilities = routeA6ChangedFields(changedFields);
  const currentStage = input.opportunity_state?.stage || context.current_stage || 'CONTACTED';
  const nextStage = deriveA6Stage({ currentStage, intent, a5Result: input.a5_result || context.a5_result });
  const next = selectA6NextAction({
    intent,
    a5Result: input.a5_result || context.a5_result,
    a8Result: input.a8_result || context.a8_result,
    sellerContext: input.seller_context || context.seller_context || {},
    acknowledgement: intent.acknowledgement
  });
  const evidenceRefs = normalizeEvidenceRefs(input.latest_buyer_message?.evidence_ref, input.latest_buyer_message?.evidence_refs, context.evidence_refs);
  const blocked = isA5Blocked(input.a5_result || context.a5_result);
  const runStatus = blocked ? CAPABILITY_STATUS.BLOCKED : CAPABILITY_STATUS.DONE;
  const outcome = next.action === 'STOP_CONTACT'
    ? { opportunity_id: opportunityId, outcome: 'STOPPED', reason: next.reason, evidence_refs: evidenceRefs }
    : next.action === 'MARK_LOST'
      ? { opportunity_id: opportunityId, outcome: 'LOST', reason: next.reason, evidence_refs: evidenceRefs }
      : null;

  return makeCapabilityEnvelope({
    capabilityId: A6_CAPABILITY_ID,
    capabilityVersion: A6_VERSION,
    runStatus,
    changedFields: changedFields.map(item => item.field),
    evidenceRefs,
    humanReviewRequired: next.human_review_required,
    domainResult: {
      opportunity_id: opportunityId,
      buyer_reply: { intent, questions: [], objections: [] },
      stage: { before: currentStage, after: nextStage },
      changed_business_fields: changedFields,
      invalidated_capabilities: invalidatedCapabilities,
      key_question: null,
      next_action: {
        action: next.action,
        reason: next.reason,
        prerequisites: invalidatedCapabilities.length ? ['refresh_invalidated_capabilities'] : []
      },
      execution_mode: next.execution_mode,
      reply_draft: null,
      followup: null,
      outcome,
      evidence_refs: evidenceRefs,
      human_review_required: next.human_review_required
    }
  });
}
