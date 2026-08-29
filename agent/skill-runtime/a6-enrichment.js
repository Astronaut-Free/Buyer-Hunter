function primaryIntent(envelope = {}) {
  const intent = envelope.domain_result?.buyer_reply?.intent;
  return intent?.primary || intent || 'UNKNOWN';
}

function has(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function resolveA6KeyQuestion({ intent = 'UNKNOWN', sellerContext = {}, opportunityState = {} } = {}) {
  const fields = opportunityState.fields || {};
  switch (intent) {
    case 'INTERESTED':
      return { category: 'QUALIFICATION', audience: 'BUYER', description: 'What purchase quantity should we use as the basis for the next step?', why_blocking: '目标采购量会影响供给匹配与后续方案。', required_information: ['quantity'] };
    case 'WRONG_PERSON':
    case 'REFERRAL':
      return { category: 'CONTACT', audience: 'BUYER', description: 'Who is responsible for sourcing this product category?', why_blocking: '需要找到正确采购负责人。', required_information: ['buyer_role'] };
    case 'SAMPLE_REQUEST':
      if (!has(sellerContext.sample_policy || sellerContext.samplePolicy)) return { category: 'SAMPLE_POLICY', audience: 'SELLER', description: '请补充样品政策、费用与物流条件。', why_blocking: '缺少可授权寄样条件。', required_information: ['sample_policy'] };
      if (!has(fields.destination || opportunityState.destination)) return { category: 'SAMPLE_DESTINATION', audience: 'BUYER', description: 'Which destination should we use for the sample shipment?', why_blocking: '寄样需要明确目的地。', required_information: ['destination'] };
      return null;
    case 'MOQ_SPEC_REQUEST':
      if (!has(sellerContext.moq) && !has(sellerContext.specification || sellerContext.specifications)) return { category: 'PRODUCT_FACT', audience: 'SELLER', description: '请补充已验证的 MOQ 或产品规格。', why_blocking: '缺少可对外回答的产品事实。', required_information: ['moq_or_specification'] };
      return null;
    case 'DELIVERY_REQUEST':
      if (!has(sellerContext.delivery || sellerContext.lead_time || sellerContext.leadTime)) return { category: 'DELIVERY_FACT', audience: 'SELLER', description: '请补充已确认交期或产能数据。', why_blocking: '缺少可承诺的交期证据。', required_information: ['delivery'] };
      return null;
    case 'CERTIFICATION_REQUEST':
      if (!has(sellerContext.certifications || sellerContext.certification)) return { category: 'CERTIFICATION_FACT', audience: 'SELLER', description: '请补充可验证认证资料。', why_blocking: '认证回答必须有证据。', required_information: ['certifications'] };
      return null;
    case 'NEED_INFORMATION':
      if (!has(sellerContext.materials || sellerContext.public_materials)) return { category: 'MATERIAL', audience: 'SELLER', description: '请补充可对外发送的产品资料。', why_blocking: '系统没有可授权发送的资料。', required_information: ['materials'] };
      return null;
    case 'UNKNOWN':
      return { category: 'CLARIFICATION', audience: 'BUYER', description: 'What specific requirement would you like us to address first?', why_blocking: '当前意图无法可靠判断。', required_information: ['buyer_requirement'] };
    default:
      return null;
  }
}

function answerFacts(intent, sellerContext = {}) {
  if (intent === 'MOQ_SPEC_REQUEST') {
    const parts = [];
    if (has(sellerContext.moq)) parts.push(`MOQ: ${sellerContext.moq}`);
    if (has(sellerContext.specification)) parts.push(`Specification: ${sellerContext.specification}`);
    if (Array.isArray(sellerContext.specifications) && sellerContext.specifications.length) parts.push(`Specifications: ${sellerContext.specifications.join(', ')}`);
    return parts;
  }
  if (intent === 'DELIVERY_REQUEST' && has(sellerContext.delivery || sellerContext.lead_time || sellerContext.leadTime)) return [`Lead time: ${sellerContext.delivery || sellerContext.lead_time || sellerContext.leadTime}`];
  if (intent === 'CERTIFICATION_REQUEST') {
    const certs = sellerContext.certifications || sellerContext.certification;
    return Array.isArray(certs) ? [`Certifications: ${certs.join(', ')}`] : has(certs) ? [`Certifications: ${certs}`] : [];
  }
  return [];
}

export function enrichA6Envelope(envelope = {}, { sellerContext = {}, opportunityState = {} } = {}) {
  if (!envelope?.domain_result) return envelope;
  const intent = primaryIntent(envelope);
  const keyQuestion = resolveA6KeyQuestion({ intent, sellerContext, opportunityState });
  const result = { ...envelope, domain_result: { ...envelope.domain_result, key_question: keyQuestion } };
  const action = result.domain_result.next_action?.action;
  if (['HUMAN_TAKEOVER', 'STOP_CONTACT', 'MARK_LOST', 'WAIT'].includes(action)) return result;

  if (keyQuestion?.audience === 'SELLER') {
    return {
      ...result,
      run_status: 'MORE_EVIDENCE',
      missing_evidence: [...new Set([...(result.missing_evidence || []), ...(keyQuestion.required_information || [])])],
      human_review_required: true,
      domain_result: {
        ...result.domain_result,
        next_action: { action: 'REQUEST_MORE_EVIDENCE', reason: keyQuestion.why_blocking, prerequisites: keyQuestion.required_information || [] },
        execution_mode: 'APPROVAL',
        reply_draft: null,
        human_review_required: true
      }
    };
  }

  if (action === 'ASK_KEY_QUESTION' && keyQuestion?.audience === 'BUYER') {
    result.domain_result.reply_draft = {
      objective: 'resolve the current key qualification question',
      content: keyQuestion.description,
      language: 'en',
      claims_used: [],
      evidence_refs: result.evidence_refs || [],
      prohibited_claims_checked: true
    };
    return result;
  }

  if (action === 'REQUEST_REFERRAL') {
    result.domain_result.reply_draft = {
      objective: 'reach the correct sourcing owner',
      content: keyQuestion?.description || 'Could you point me to the person responsible for sourcing this product category?',
      language: 'en',
      claims_used: [],
      evidence_refs: result.evidence_refs || [],
      prohibited_claims_checked: true
    };
    return result;
  }

  if (action === 'SEND_MATERIAL') {
    const materials = sellerContext.public_materials || sellerContext.materials;
    const list = Array.isArray(materials) ? materials : has(materials) ? [materials] : [];
    if (!list.length) return result;
    result.domain_result.reply_draft = {
      objective: 'send approved product information',
      content: `Thanks for your interest. I can share the following product information: ${list.map(item => typeof item === 'string' ? item : item.title || item.url || 'product material').join(', ')}.`,
      language: 'en',
      claims_used: ['seller_context.materials'],
      evidence_refs: result.evidence_refs || [],
      prohibited_claims_checked: true
    };
    return result;
  }

  if (action === 'ANSWER_WITH_EVIDENCE') {
    const facts = answerFacts(intent, sellerContext);
    if (!facts.length) return result;
    result.domain_result.reply_draft = {
      objective: 'answer buyer question with verified seller facts',
      content: `Thanks for checking. ${facts.join('. ')}.`,
      language: 'en',
      claims_used: facts,
      evidence_refs: result.evidence_refs || [],
      prohibited_claims_checked: true
    };
  }
  return result;
}
