function text(value) { return String(value || '').trim(); }
function first(values = []) { return Array.isArray(values) ? values.find(Boolean) || '' : text(values); }

export function generateA2OutreachDraft({ seller = {}, target = {}, buyerCompany = {}, buyerFit = {}, contact = {}, language = 'en' } = {}) {
  const companyName = text(buyerCompany.legal_or_display_name || buyerCompany.name);
  const contactName = text(contact.name);
  const product = text(seller.product_name || seller.product?.name || first(target.product_keywords));
  const sellerName = text(seller.company_name || seller.name);
  const whyFit = text(buyerFit.why_fit);
  const evidenceRefs = [...new Set([...(buyerFit.evidence_refs || []), ...(buyerCompany.evidence_refs || []), ...(contact.source_refs || [])].filter(Boolean))];
  if (!companyName || !product || !whyFit || !evidenceRefs.length) {
    return { status: 'MORE_EVIDENCE', missing_evidence: [!companyName && 'buyer_company.name', !product && 'seller.product', !whyFit && 'buyer_fit.why_fit', !evidenceRefs.length && 'buyer_evidence'].filter(Boolean), draft: null };
  }
  const recipient = contactName || 'there';
  if (String(language).toLowerCase().startsWith('zh')) {
    return {
      status: 'READY',
      missing_evidence: [],
      draft: {
        subject: `${product}｜供应合作沟通`,
        content: `${recipient} 您好，\n\n我是${sellerName || '贵州供应团队'}。我们关注到 ${companyName} 的业务与 ${whyFit} 相关，因此想就 ${product} 的供应合作做一次简短沟通。\n\n如果这个品类在您负责范围内，我可以先发送产品规格、认证及供货条件，供您判断是否值得继续了解。\n\n方便的话，回复我一个“可以”即可。`,
        language: 'zh',
        objective: '确认对方是否负责该品类并获得继续沟通许可',
        claims_used: ['buyer_fit.why_fit', 'seller.product'],
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
      content: `Hi ${recipient},\n\nI'm reaching out from ${sellerName || 'a Guizhou supplier'}. We noticed that ${companyName} is relevant to ${whyFit}, so I wanted to explore whether ${product} could be relevant to your sourcing scope.\n\nIf this category is within your remit, I can send the product specifications, certifications, and supply terms for a quick review.\n\nWould it be useful for me to send those details?`,
      language: 'en',
      objective: 'confirm category ownership and permission to continue',
      claims_used: ['buyer_fit.why_fit', 'seller.product'],
      evidence_refs: evidenceRefs,
      prohibited_claims_checked: true
    }
  };
}
