import { buildA2OutreachClaims } from './a2-outreach-claims.js';

function text(value) { return String(value || '').trim(); }
function first(values = []) { return Array.isArray(values) ? values.find(Boolean) || '' : text(values); }

export function generateA2OutreachDraft({ seller = {}, target = {}, buyerCompany = {}, buyerFit = {}, contact = {}, language = 'en' } = {}) {
  const companyName = text(buyerCompany.legal_or_display_name || buyerCompany.name);
  const contactName = text(contact.name);
  const product = text(seller.product_name || seller.product?.name || first(target.product_keywords));
  const sellerName = text(seller.company_name || seller.name);
  const whyFit = text(buyerFit.why_fit);
  const evidenceRefs = [...new Set([...(buyerFit.evidence_refs || []), ...(buyerCompany.evidence_refs || []), ...(contact.source_refs || [])].filter(Boolean))];
  const claims = buildA2OutreachClaims({ buyerCompany, buyerFit, seller });
  if (!sellerName || !companyName || !product || !whyFit || !evidenceRefs.length || claims.prohibited_claims.length) {
    return { status: 'MORE_EVIDENCE', missing_evidence: [!sellerName && 'seller.company_name', !companyName && 'buyer_company.name', !product && 'seller.product_name', !whyFit && 'buyer_fit.why_fit', !evidenceRefs.length && 'buyer_evidence', claims.prohibited_claims.length && 'prohibited_claims'].filter(Boolean), draft: null };
  }
  const recipient = contactName || 'there';
  if (String(language).toLowerCase().startsWith('zh')) {
    return {
      status: 'READY',
      missing_evidence: [],
      draft: {
        subject: `${product}｜供应合作沟通`,
        body: `${recipient} 您好，\n\n我是${sellerName}。我们从公开业务信息了解到 ${companyName} 与 ${whyFit} 相关，因此想就 ${product} 做一次简短沟通。\n\n如果这个品类在您负责范围内，我可以先发送经过核验的产品资料，供您判断是否值得继续了解。\n\n方便的话，回复我一个“可以”即可。`,
        content: `${recipient} 您好，\n\n我是${sellerName}。我们从公开业务信息了解到 ${companyName} 与 ${whyFit} 相关，因此想就 ${product} 做一次简短沟通。\n\n如果这个品类在您负责范围内，我可以先发送经过核验的产品资料，供您判断是否值得继续了解。\n\n方便的话，回复我一个“可以”即可。`,
        language: 'zh',
        objective: '确认对方是否负责该品类并获得继续沟通许可',
        buyer_claims: claims.buyer_claims,
        seller_claims: claims.seller_claims,
        evidence_refs: evidenceRefs,
        prohibited_claims_checked: true
      }
    };
  }
  return {
    status: 'READY',
    missing_evidence: [],
    draft: {
      subject: `${product} supply inquiry`,
      body: `Hi ${recipient},\n\nI'm reaching out from ${sellerName}. Public business information indicates that ${companyName} is relevant to ${whyFit}, so I wanted to ask whether ${product} falls within your remit.\n\nIf so, I can share our verified product information for a quick review.\n\nWould it be useful for me to send those details?`,
      content: `Hi ${recipient},\n\nI'm reaching out from ${sellerName}. Public business information indicates that ${companyName} is relevant to ${whyFit}, so I wanted to ask whether ${product} falls within your remit.\n\nIf so, I can share our verified product information for a quick review.\n\nWould it be useful for me to send those details?`,
      language: 'en',
      objective: 'confirm category ownership and permission to continue',
      buyer_claims: claims.buyer_claims,
      seller_claims: claims.seller_claims,
      evidence_refs: evidenceRefs,
      prohibited_claims_checked: true
    }
  };
}
