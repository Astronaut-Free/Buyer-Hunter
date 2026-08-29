import { A6_CONFIDENCE, A6_INTENTS } from './contract.js';

const INTENT_RULES = Object.freeze([
  ['UNSUBSCRIBE', /unsubscribe|remove me|stop emailing|退订|不要再联系/i],
  ['COMPLAINT', /complain|complaint|angry|unacceptable|refund|compensation|投诉|不满|欺骗|退款|赔偿/i],
  ['PAYMENT_TERMS', /payment terms?|\bnet\s*\d+\b|付款条件|账期|信用证|letter of credit|\bl\/?c\b|\bt\/?t\b/i],
  ['PRICE_REQUEST', /formal quotation|quotation|quote|price|pricing|报价|价格/i],
  ['SAMPLE_REQUEST', /sample|样品|寄样/i],
  ['MOQ_SPEC_REQUEST', /\bmoq\b|minimum order|specification|\bspec\b|规格|起订量/i],
  ['DELIVERY_REQUEST', /delivery|deliver|lead time|shipping date|交期|到货|发货/i],
  ['CERTIFICATION_REQUEST', /certification|certificate|organic|fda|jas|认证|证书/i],
  ['WRONG_PERSON', /wrong person|not responsible|not my area|找错人|不负责/i],
  ['REFERRAL', /contact .* instead|speak to|refer|转给|联系人是/i],
  ['NOT_NOW', /not now|maybe later|later|next quarter|next year|以后再说|暂时不需要|目前不需要/i],
  ['NOT_INTERESTED', /not interested|no interest|不感兴趣|不需要/i],
  ['OUT_OF_OFFICE', /out of office|on leave|vacation|休假|不在办公室/i],
  ['NEED_INFORMATION', /send .*info|more information|catalog|datasheet|资料|目录|介绍/i],
  ['INTERESTED', /(?:we(?:'re| are)?|i(?:'m| am)?|remain|still)\s+interested|sounds good|let's discuss|有兴趣|可以聊|进一步沟通/i]
]);

const PRIORITY = Object.freeze(INTENT_RULES.map(([label]) => label));
const ACKNOWLEDGEMENT = /^(thanks|thank you|thanks,? received|received|谢谢|收到|好的|ok|okay|got it)[.!！。 ]*$/i;

function evidenceSpan(text, pattern, evidenceRef) {
  const match = text.match(pattern);
  return match ? { text: match[0], evidence_ref: evidenceRef || null } : null;
}

export function classifyReplyIntent(content = '', { evidenceRef = null } = {}) {
  const text = String(content || '').trim();
  if (ACKNOWLEDGEMENT.test(text)) {
    return {
      primary: 'ACKNOWLEDGEMENT',
      secondary: [],
      confidence: 'HIGH',
      evidence_spans: [{ text, evidence_ref: evidenceRef }]
    };
  }

  const matches = INTENT_RULES.map(([label, pattern]) => ({
    label,
    span: evidenceSpan(text, pattern, evidenceRef)
  })).filter(item => item.span);
  const labels = matches.map(item => item.label);
  const conflictingInterest = labels.includes('NOT_INTERESTED') && labels.includes('INTERESTED');
  if (conflictingInterest) {
    return {
      primary: 'UNKNOWN',
      secondary: ['NOT_INTERESTED', 'INTERESTED'],
      confidence: 'LOW',
      evidence_spans: matches.filter(item => ['NOT_INTERESTED', 'INTERESTED'].includes(item.label)).map(item => item.span)
    };
  }

  if (!matches.length) {
    return { primary: 'UNKNOWN', secondary: [], confidence: 'LOW', evidence_spans: [] };
  }
  matches.sort((left, right) => PRIORITY.indexOf(left.label) - PRIORITY.indexOf(right.label));
  return {
    primary: matches[0].label,
    secondary: [...new Set(matches.slice(1).map(item => item.label))],
    confidence: 'HIGH',
    evidence_spans: matches.map(item => item.span)
  };
}

export { INTENT_RULES as intentRules };

if (!A6_CONFIDENCE.includes('HIGH') || !A6_INTENTS.includes('UNKNOWN')) {
  throw new Error('A6 intent contract is invalid');
}
