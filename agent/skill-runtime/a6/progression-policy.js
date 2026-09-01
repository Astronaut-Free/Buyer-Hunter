import { isA5Blocked, normalizeEvidenceRefs } from '../guards.js';
import { makeNextAction } from './contract.js';

function domain(result) {
  return result?.domain_result || result || {};
}

function resultEvidence(result) {
  return normalizeEvidenceRefs(result?.evidence_refs, domain(result).evidence_refs);
}

function keyQuestion(category, audience, description, whyBlocking, requiredInformation = []) {
  return { category, audience, description, why_blocking: whyBlocking, required_information: requiredInformation };
}

export function resolveA6KeyQuestion({ intent = 'UNKNOWN', opportunityState = {}, skillResults = {}, sellerExecutionPolicy = {} } = {}) {
  const primary = intent?.primary || intent;
  const fields = opportunityState.fields || {};
  const a4 = skillResults.a4;
  const a4Facts = domain(a4).verified_facts || {};
  const a4ChangedFields = new Set(a4?.changed_fields || []);
  const hasNarrowVerifiedFact = (
    (primary === 'DELIVERY_REQUEST' && a4Facts.delivery
      && !['quantity', 'specification', 'grade', 'certification'].some(field => a4ChangedFields.has(field)))
    || (primary === 'MOQ_SPEC_REQUEST' && (a4Facts.capacity_or_moq || a4Facts.specification))
    || (primary === 'CERTIFICATION_REQUEST' && a4Facts.certifications)
  ) && resultEvidence(a4).length > 0;
  if (a4?.run_status === 'MORE_EVIDENCE' && !hasNarrowVerifiedFact) {
    const missing = a4.missing_evidence || [];
    return keyQuestion('SUPPLY_EVIDENCE', 'SELLER', '请补充缺失的供给、规格、认证或交期证据。', 'A4 无法完成供需匹配判断。', missing);
  }
  const a3 = skillResults.a3;
  const a3Domain = domain(a3);
  if (primary === 'DELIVERY_REQUEST' && (a3?.run_status === 'MORE_EVIDENCE' || a3Domain.window_status === 'UNKNOWN')) {
    return keyQuestion('PURCHASE_WINDOW', 'BUYER', 'What delivery window are you working toward?', 'A3 无法确认采购或交付窗口。', ['purchase_window']);
  }
  if (primary === 'INTERESTED') {
    return keyQuestion('QUALIFICATION', 'BUYER', 'What purchase quantity should we use as the basis for the next step?', '目标采购量会影响供给匹配与后续方案。', ['quantity']);
  }
  if (primary === 'WRONG_PERSON' || primary === 'REFERRAL') {
    return keyQuestion('CONTACT', 'BUYER', 'Who is responsible for sourcing this product category?', '需要找到正确采购负责人。', ['buyer_role']);
  }
  if (primary === 'SAMPLE_REQUEST') {
    if (!sellerExecutionPolicy.sample_policy?.approved) {
      return keyQuestion('SAMPLE_POLICY', 'SELLER', '请补充并审批样品政策、费用与物流条件。', '缺少已批准的寄样条件。', ['approved_sample_policy']);
    }
    if (!fields.destination) {
      return keyQuestion('SAMPLE_DESTINATION', 'BUYER', 'Which destination should we use for the sample shipment?', '寄样需要明确目的地。', ['destination']);
    }
    if (!skillResults.a5 || !['DONE', 'NOT_APPLICABLE'].includes(skillResults.a5.run_status)) {
      return keyQuestion('TRADE_RISK', 'SELLER', '请先完成样品目的地的 A5 风险判断。', '寄样前必须确认 A5 非阻断。', ['a5_result']);
    }
  }
  if (primary === 'CERTIFICATION_REQUEST' && skillResults.a5?.run_status === 'MORE_EVIDENCE') {
    return keyQuestion('TRADE_RISK', 'SELLER', '请补充认证对应市场的准入或风险证据。', 'A5 尚未完成认证相关风险判断。', skillResults.a5.missing_evidence || ['a5_evidence']);
  }
  if (primary === 'NEED_INFORMATION' && !(sellerExecutionPolicy.approved_materials || []).length) {
    return keyQuestion('MATERIAL', 'SELLER', '请补充已批准、可对外发送的产品资料。', '系统没有可授权发送的资料。', ['approved_materials']);
  }
  if (primary === 'UNKNOWN') {
    return keyQuestion('CLARIFICATION', 'BUYER', 'What specific requirement would you like us to address first?', '当前意图无法可靠判断。', ['buyer_requirement']);
  }
  return null;
}

function claimsForIntent(intent, skillResults = {}) {
  const a4 = skillResults.a4;
  const facts = domain(a4).verified_facts || {};
  const evidenceRefs = resultEvidence(a4);
  if (!evidenceRefs.length) return [];
  const primary = intent?.primary || intent;
  const pairs = [];
  if (primary === 'DELIVERY_REQUEST' && facts.delivery) pairs.push(['lead_time', facts.delivery]);
  if (primary === 'MOQ_SPEC_REQUEST' && facts.capacity_or_moq) pairs.push(['moq_or_capacity', facts.capacity_or_moq]);
  if (primary === 'MOQ_SPEC_REQUEST' && facts.specification) pairs.push(['specification', facts.specification]);
  if (primary === 'CERTIFICATION_REQUEST' && facts.certifications) pairs.push(['certifications', facts.certifications]);
  if (!['DONE', 'MORE_EVIDENCE'].includes(a4?.run_status)) return [];
  return pairs.map(([fact, value]) => ({ fact, value, evidence_refs: evidenceRefs }));
}

function communicationBrief({ action, intent, keyQuestion: question, skillResults, sellerExecutionPolicy }) {
  if (action === 'ANSWER_WITH_EVIDENCE') {
    const allowedClaims = claimsForIntent(intent, skillResults);
    if (!allowedClaims.length) return null;
    return {
      objective: `answer buyer ${String(intent.primary || '').toLowerCase()} with verified evidence`,
      allowed_claims: allowedClaims,
      approved_assets: [],
      questions_to_ask: [],
      prohibited_claims: ['guaranteed delivery date', 'unapproved price', 'unverified certification'],
      language: 'en'
    };
  }
  if (['ASK_KEY_QUESTION', 'REQUEST_REFERRAL'].includes(action) && question?.audience === 'BUYER') {
    return {
      objective: action === 'REQUEST_REFERRAL' ? 'reach the correct sourcing owner' : 'resolve one key qualification question',
      allowed_claims: [],
      approved_assets: [],
      questions_to_ask: [question.description],
      prohibited_claims: [],
      language: 'en'
    };
  }
  if (action === 'SEND_MATERIAL') {
    const assets = (sellerExecutionPolicy.approved_materials || []).filter(item => item?.approved !== false);
    if (!assets.length) return null;
    return {
      objective: 'send approved product information',
      allowed_claims: [],
      approved_assets: assets,
      questions_to_ask: [],
      prohibited_claims: ['claims not present in approved materials'],
      language: 'en'
    };
  }
  return null;
}

export function buildA6Progression({ intent, opportunityState, skillResults = {}, sellerExecutionPolicy = {}, outcome } = {}) {
  const primary = intent?.primary || 'UNKNOWN';
  const secondary = intent?.secondary || [];
  const a5 = skillResults.a5;
  const question = resolveA6KeyQuestion({ intent, opportunityState, skillResults, sellerExecutionPolicy });
  let decisionState = 'PROCEED';
  let runStatus = 'DONE';
  let followUp = null;
  let action;

  if (isA5Blocked(a5)) {
    decisionState = 'STOP';
    runStatus = 'BLOCKED';
    action = makeNextAction({ action: 'WAIT', reason: 'A5 返回 BLOCK，停止所有对外业务推进', owner: 'INTERNAL', executionMode: 'HUMAN', prerequisites: ['resolve_a5_block'], stopCondition: 'A5 block remains active' });
  } else if (primary === 'UNSUBSCRIBE') {
    decisionState = 'STOP';
    action = makeNextAction({ action: 'STOP_CONTACT', reason: '买家明确退订', executionMode: 'AUTO', successCondition: 'suppression signal persisted' });
  } else if (primary === 'COMPLAINT') {
    decisionState = 'HUMAN';
    action = makeNextAction({ action: 'HUMAN_TAKEOVER', reason: '投诉涉及承诺、退款或赔偿风险', owner: 'INTERNAL', executionMode: 'HUMAN', stopCondition: 'human resolves complaint' });
  } else if (primary === 'PAYMENT_TERMS' || secondary.includes('PAYMENT_TERMS')) {
    decisionState = 'HUMAN';
    action = makeNextAction({ action: 'HUMAN_TAKEOVER', reason: '支付条件必须由人工审批和谈判', owner: 'INTERNAL', executionMode: 'HUMAN' });
  } else if (primary === 'PRICE_REQUEST' || secondary.includes('PRICE_REQUEST')) {
    decisionState = 'HUMAN';
    action = makeNextAction({ action: 'HUMAN_TAKEOVER', reason: '正式价格或报价必须由人工审批', owner: 'INTERNAL', executionMode: 'HUMAN' });
  } else if (primary === 'NOT_NOW' || primary === 'OUT_OF_OFFICE') {
    decisionState = 'WAIT';
    followUp = { trigger: 'TIME', due_at: null, condition: null, owner: 'SELLER', success_condition: 'buyer re-engages', stop_condition: 'buyer opts out' };
    action = makeNextAction({ action: 'ENTER_NURTURE', reason: '买家当前没有采购窗口', executionMode: 'APPROVAL', prerequisites: ['follow_up_time'] });
  } else if (outcome?.type === 'LOST') {
    decisionState = 'STOP';
    action = makeNextAction({ action: 'MARK_LOST', reason: '买家明确拒绝当前机会', owner: 'INTERNAL', executionMode: 'APPROVAL', successCondition: 'lost outcome persisted' });
  } else if (outcome?.type === 'WON') {
    decisionState = 'STOP';
    action = makeNextAction({ action: 'WAIT', reason: '已收到有证据的成交结果事件', owner: 'INTERNAL', executionMode: 'AUTO', successCondition: 'won outcome persisted' });
  } else if (primary === 'SAMPLE_REQUEST') {
    if (question) {
      decisionState = 'VERIFY'; runStatus = 'MORE_EVIDENCE';
      action = makeNextAction({ action: question.audience === 'BUYER' ? 'ASK_KEY_QUESTION' : 'REQUEST_MORE_EVIDENCE', reason: question.why_blocking, owner: question.audience === 'BUYER' ? 'AGENT' : 'SELLER', executionMode: 'APPROVAL', prerequisites: question.required_information });
    } else {
      action = makeNextAction({ action: 'CREATE_SAMPLE_TASK', reason: '样品政策、目的地和 A5 非阻断条件均已满足', owner: 'INTERNAL', executionMode: 'APPROVAL', successCondition: 'sample task approved', stopCondition: 'A5 becomes blocked' });
    }
  } else if (primary === 'WRONG_PERSON' || primary === 'REFERRAL') {
    action = makeNextAction({ action: 'REQUEST_REFERRAL', reason: '需要找到正确采购负责人', executionMode: 'APPROVAL' });
  } else if (primary === 'NEED_INFORMATION') {
    if (question) {
      decisionState = 'VERIFY'; runStatus = 'MORE_EVIDENCE';
      action = makeNextAction({ action: 'REQUEST_MORE_EVIDENCE', reason: question.why_blocking, owner: 'SELLER', executionMode: 'APPROVAL', prerequisites: question.required_information });
    } else action = makeNextAction({ action: 'SEND_MATERIAL', reason: '存在已批准的产品资料', executionMode: 'APPROVAL' });
  } else if (['MOQ_SPEC_REQUEST', 'DELIVERY_REQUEST', 'CERTIFICATION_REQUEST'].includes(primary)) {
    const claims = claimsForIntent(intent, skillResults);
    if (question?.audience === 'BUYER') {
      decisionState = 'VERIFY'; runStatus = 'MORE_EVIDENCE';
      action = makeNextAction({ action: 'ASK_KEY_QUESTION', reason: question.why_blocking, owner: 'AGENT', executionMode: 'APPROVAL', prerequisites: question.required_information });
    } else if (!claims.length || question?.audience === 'SELLER') {
      decisionState = 'VERIFY'; runStatus = 'MORE_EVIDENCE';
      const missing = question?.required_information || ['verified_answer_fact'];
      action = makeNextAction({ action: 'REQUEST_MORE_EVIDENCE', reason: question?.why_blocking || '缺少可对外引用且有证据的专业判断', owner: 'SELLER', executionMode: 'APPROVAL', prerequisites: missing });
    } else action = makeNextAction({ action: 'ANSWER_WITH_EVIDENCE', reason: '专业能力结果提供了可验证事实', executionMode: 'APPROVAL', successCondition: 'buyer receives approved evidence-grounded answer' });
  } else if (primary === 'INTERESTED') {
    action = makeNextAction({ action: 'ASK_KEY_QUESTION', reason: '买家表达兴趣，需确认一个关键需求', executionMode: 'APPROVAL', prerequisites: question?.required_information || [] });
  } else if (primary === 'ACKNOWLEDGEMENT') {
    decisionState = 'WAIT';
    action = makeNextAction({ action: 'WAIT', reason: '礼貌确认没有新增业务问题', executionMode: 'AUTO' });
  } else {
    decisionState = 'HUMAN';
    action = makeNextAction({ action: 'REQUEST_APPROVAL', reason: '意图置信度不足，禁止自动发送猜测回复', owner: 'INTERNAL', executionMode: 'HUMAN' });
  }

  return {
    run_status: runStatus,
    decision_state: decisionState,
    next_action: action,
    key_question: question,
    communication_brief: communicationBrief({ action: action.action, intent, keyQuestion: question, skillResults, sellerExecutionPolicy }),
    follow_up: followUp,
    missing_evidence: runStatus === 'MORE_EVIDENCE' ? (question?.required_information || action.prerequisites || []) : []
  };
}

export function enrichA6Envelope(envelope = {}) {
  return envelope;
}
