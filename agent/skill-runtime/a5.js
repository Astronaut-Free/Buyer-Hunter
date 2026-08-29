import { CAPABILITY_STATUS, makeCapabilityEnvelope, normalizeEvidenceRefs } from './guards.js';
import { A5_CAPABILITY_ID } from './capability-ids.js';

export { A5_CAPABILITY_ID };
export const A5_VERSION = '1.0.0';

function has(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function list(value) {
  if (!has(value)) return [];
  return Array.isArray(value) ? value.map(String) : String(value).split(',').map(item => item.trim()).filter(Boolean);
}

export function runA5TradeRisk(context = {}) {
  const input = context.input || context;
  const opportunityId = input.opportunity_id;
  if (!opportunityId) {
    return makeCapabilityEnvelope({
      capabilityId: A5_CAPABILITY_ID,
      capabilityVersion: A5_VERSION,
      runStatus: CAPABILITY_STATUS.BLOCKED,
      missingEvidence: ['opportunity_id'],
      humanReviewRequired: true,
      domainResult: { code: 'NEEDS_CONTEXT', status: 'BLOCKED' }
    });
  }

  const seller = input.seller_context || {};
  const fields = { ...(input.opportunity_state?.fields || {}), ...(input.field_updates || {}) };
  const changedFields = input.changed_fields || [];
  const destination = fields.destination || input.destination || null;
  const allowedMarkets = list(seller.allowed_markets || seller.allowedMarkets);
  const blockedMarkets = list(seller.blocked_markets || seller.blockedMarkets);
  const marketAccess = seller.market_access || seller.marketAccess || seller.trade_risk || null;
  const paymentPolicy = seller.payment_policy || seller.paymentPolicy || seller.allowed_payment_terms || null;
  const evidenceRefs = normalizeEvidenceRefs(
    input.latest_buyer_message?.evidence_ref,
    input.latest_buyer_message?.evidence_refs,
    seller.evidence_refs,
    input.evidence_refs
  );

  if (destination && blockedMarkets.some(item => item.toLowerCase() === String(destination).toLowerCase())) {
    return makeCapabilityEnvelope({
      capabilityId: A5_CAPABILITY_ID,
      capabilityVersion: A5_VERSION,
      runStatus: CAPABILITY_STATUS.BLOCKED,
      changedFields,
      evidenceRefs,
      humanReviewRequired: true,
      domainResult: {
        status: 'BLOCKED',
        decision: 'BLOCKED',
        reason: 'destination explicitly blocked by seller trade policy',
        destination
      }
    });
  }

  const needsDestinationReview = changedFields.includes('destination') || changedFields.includes('certification');
  const needsPaymentReview = changedFields.includes('payment_terms');
  const missing = [];
  if (needsDestinationReview && !has(marketAccess) && !(destination && allowedMarkets.length)) missing.push('market_access_or_trade_risk');
  if (needsPaymentReview && !has(paymentPolicy)) missing.push('payment_policy');

  if (missing.length) {
    return makeCapabilityEnvelope({
      capabilityId: A5_CAPABILITY_ID,
      capabilityVersion: A5_VERSION,
      runStatus: CAPABILITY_STATUS.MORE_EVIDENCE,
      changedFields,
      missingEvidence: missing,
      evidenceRefs,
      humanReviewRequired: true,
      domainResult: {
        status: 'NEEDS_EVIDENCE',
        decision: 'REVIEW_REQUIRED',
        destination
      }
    });
  }

  const destinationAllowed = destination && allowedMarkets.length
    ? allowedMarkets.some(item => item.toLowerCase() === String(destination).toLowerCase())
    : null;

  // Rule-based depth (credit / fraud / IP / contract) mirrors the Python
  // authority's 13-class taxonomy for the four provider-free classes.
  const FREE_MAIL_DOMAINS = new Set([
    'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.co.uk', 'aol.com',
    'icloud.com', 'qq.com', '163.com', '126.com', 'sina.com', 'sina.cn', 'foxmail.com',
    'proton.me', 'protonmail.com', 'live.com', 'msn.com', 'yandex.com', 'mail.ru'
  ]);
  const BRANDS = [
    '茅台', '五粮液', '星巴克', '瑞幸', '喜茶', '奈雪', '蜜雪冰城', '三只松鼠',
    '百草味', '良品铺子', '元气森林', '农夫山泉', '康师傅', '统一', '雀巢',
    'starbucks', 'nestle', 'nescafe', 'nutella', 'haribo', 'ferrero', 'coca-cola',
    'cocacola', 'pepsi', 'lipton', 'twinings', 'tazo', 'celestial', 'red bull',
    'redbull', 'monster energy', 'kellogg', 'mars inc', 'kinder', 'lindt',
    'toblerone', 'oreo', 'mcdonald', 'kfc', 'subway', 'domino', 'burger king'
  ];
  const CONTRACT_TERMS = [
    '无担保全预付', '全款预付', '全款支付', '全额预付', '100% 预付',
    '100% t/t in advance', '100% tt advance', 'full payment in advance',
    '100% advance payment', '100% prepayment', 'no guarantee', 'without guarantee'
  ];
  const identity = String(fields.buyer_identity_status || input.buyer_identity_status || 'UNRESOLVED').toUpperCase();
  const identityUnresolved = ['PERSON_ONLY', 'UNRESOLVED'].includes(identity);
  const messageText = input.latest_buyer_message?.content || input.latest_buyer_message || '';
  const haystack = [
    fields.demand_title, fields.payment_terms, fields.contact_email_raw,
    fields.public_business_emails, messageText
  ].filter(Boolean).join(' ').toLowerCase();

  const riskItems = [];
  if (identityUnresolved && !has(fields.buyer_domain) && !has(fields.platform_account_id)) {
    riskItems.push({ code: 'CREDIT_UNKNOWN', severity: 'LOW', reason: '买家无可核验的信用锚点，信用背景未知' });
  }
  const freeMail = (haystack.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || [])
    .find(address => FREE_MAIL_DOMAINS.has(address.split('@')[1].toLowerCase()));
  if (freeMail && identityUnresolved) {
    const fraud = { code: 'FRAUD_SIGNAL', severity: 'MEDIUM', reason: '免费邮箱 + 无公司主体，冒充采购方的欺诈风险偏高' };
    if (fields.quantity && /未披露|unknown/i.test(String(fields.quantity))) fraud.severity = 'HIGH';
    riskItems.push(fraud);
  }
  const brandHit = BRANDS.find(brand => haystack.includes(brand.toLowerCase()));
  if (brandHit) riskItems.push({ code: 'IP_CONFLICT', severity: 'MEDIUM', reason: '需求指向特定品牌且未见授权/OEM 证据' });
  const contractHit = CONTRACT_TERMS.find(term => haystack.includes(term.toLowerCase()));
  if (contractHit) riskItems.push({ code: 'CONTRACT_RISK', severity: 'MEDIUM', reason: '全款预付且无担保条款，履约争议风险偏高' });

  return makeCapabilityEnvelope({
    capabilityId: A5_CAPABILITY_ID,
    capabilityVersion: A5_VERSION,
    runStatus: CAPABILITY_STATUS.DONE,
    changedFields,
    evidenceRefs,
    humanReviewRequired: false,
    domainResult: {
      status: 'REVIEWED',
      decision: 'ALLOW_WITH_EXISTING_POLICY',
      destination,
      destination_allowed: destinationAllowed,
      market_access: marketAccess,
      payment_policy: paymentPolicy || null,
      risk_items: riskItems
    }
  });
}
