import { bindBuyerCompanyIdentity } from './a2-company-identity.js';
import { classifyBuyerCompany, normalizeBuyerType } from './a2-company-classifier.js';
import { normalizeEvidenceRefs } from './guards.js';

function array(value) { return Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []; }
function upper(values) { return array(values).map(value => String(value).trim().toUpperCase().replace(/[\s-]+/g, '_')); }

function productRelevance(company) {
  const refs = normalizeEvidenceRefs(company.product_evidence, company.product_relevance?.evidence_refs);
  const explicit = String(company.product_relevance?.value || company.product_relevance?.status || company.product_relevance || '').toUpperCase();
  if (['DIRECT', 'CATEGORY_ADJACENT', 'INDIRECT', 'UNKNOWN', 'CONFLICT'].includes(explicit)) return { value: explicit, evidence_refs: refs };
  if (company.trade_product_match === true || company.official_product_match === true || (company.sells_or_uses_product === true && refs.length)) return { value: 'DIRECT', evidence_refs: refs };
  if (company.category_match === true && refs.length) return { value: 'CATEGORY_ADJACENT', evidence_refs: refs };
  if (company.sells_or_uses_product === false) return { value: 'CONFLICT', evidence_refs: refs };
  return { value: 'UNKNOWN', evidence_refs: refs };
}

function evidenceQuality(company) {
  const primaryStrong = normalizeEvidenceRefs(company.official_product_evidence, company.verified_trade_evidence);
  const primary = normalizeEvidenceRefs(company.trade_evidence, company.website_evidence, company.product_evidence);
  const secondary = normalizeEvidenceRefs(company.directory_evidence);
  const weak = normalizeEvidenceRefs(company.evidence_refs).filter(ref => ![...primaryStrong, ...primary, ...secondary].includes(ref));
  if (primaryStrong.length) return { value: 'PRIMARY_STRONG', score: 20, evidence_refs: primaryStrong };
  if (primary.length) return { value: 'PRIMARY', score: 16, evidence_refs: primary };
  if (secondary.length) return { value: 'SECONDARY', score: 8, evidence_refs: secondary };
  return { value: weak.length ? 'WEAK' : 'NONE', score: weak.length ? 3 : 0, evidence_refs: weak };
}

export function evaluateA2BuyerFit(company = {}, targetDefinition = {}) {
  const buyerCompany = bindBuyerCompanyIdentity(company);
  const classification = classifyBuyerCompany(buyerCompany);
  const relevance = productRelevance(buyerCompany);
  const quality = evidenceQuality(buyerCompany);
  const targetTypes = upper(targetDefinition.buyer_company_types || targetDefinition.company_types);
  const companyType = normalizeBuyerType(classification.value);
  const excludedTypes = upper(targetDefinition.excluded_company_types);
  const typeConflict = excludedTypes.includes(companyType) || (targetTypes.length && companyType !== 'UNKNOWN' && !targetTypes.includes(companyType));
  const companyCountry = String(buyerCompany.country || '').toUpperCase();
  const targetCountries = upper(targetDefinition.countries);
  const marketRefs = normalizeEvidenceRefs(buyerCompany.market_evidence);
  const marketRelation = marketRefs.length ? 'EVIDENCED_OPERATION' : targetCountries.includes(companyCountry) ? 'LOCATED_IN_MARKET' : 'UNKNOWN';

  const scoreComponents = {
    product_relevance: ({ DIRECT: 30, CATEGORY_ADJACENT: 18, INDIRECT: 8, UNKNOWN: 0, CONFLICT: 0 })[relevance.value],
    buyer_type_fit: typeConflict ? 0 : companyType === 'UNKNOWN' ? 5 : targetTypes.includes(companyType) ? 20 : 10,
    business_evidence: quality.score,
    market_fit: marketRelation === 'EVIDENCED_OPERATION' ? 15 : marketRelation === 'LOCATED_IN_MARKET' ? 12 : 0,
    identity: buyerCompany.identity_status === 'LEGAL_ENTITY_VERIFIED' || buyerCompany.identity_status === 'VERIFIED_DOMAIN' ? 10 : buyerCompany.identity_status === 'PROVIDER_IDENTIFIED' ? 6 : buyerCompany.identity_status === 'NAME_ONLY' ? 2 : 0,
    evidence_coverage: 0
  };
  const covered = [relevance.evidence_refs.length, classification.evidence_refs.length, quality.evidence_refs.length, marketRefs.length, buyerCompany.identity_status !== 'UNRESOLVED'].filter(Boolean).length;
  scoreComponents.evidence_coverage = covered >= 4 ? 5 : covered >= 2 ? 3 : covered ? 1 : 0;
  const score = Object.values(scoreComponents).reduce((sum, value) => sum + value, 0);
  const evidenceRefs = normalizeEvidenceRefs(company.evidence_refs, relevance.evidence_refs, classification.evidence_refs, quality.evidence_refs, marketRefs);
  const decision = typeConflict || relevance.value === 'CONFLICT'
    ? 'FIT_REJECTED'
    : score >= 55 && ['DIRECT', 'CATEGORY_ADJACENT'].includes(relevance.value) && buyerCompany.identity_status !== 'UNRESOLVED'
      ? 'FIT_QUALIFIED'
      : 'NEEDS_EVIDENCE';
  const whyFit = company.why_fit || [
    relevance.value === 'DIRECT' ? 'verified product or trade relevance' : relevance.value === 'CATEGORY_ADJACENT' ? 'adjacent category relevance' : null,
    companyType !== 'UNKNOWN' ? `${companyType.toLowerCase()} business model` : null,
    marketRelation !== 'UNKNOWN' ? 'target-market relationship' : null
  ].filter(Boolean).join('; ');

  return {
    buyer_company_id: buyerCompany.buyer_company_id,
    buyer_company_key: buyerCompany.buyer_company_key,
    company_identity: { status: buyerCompany.identity_status, domain: buyerCompany.verified_domain, evidence_refs: normalizeEvidenceRefs(company.identity_evidence, company.evidence_refs) },
    buyer_type: classification,
    market_relation: { value: marketRelation, evidence_refs: marketRefs },
    product_relevance: relevance,
    business_evidence: quality,
    development_priority_score: score,
    score_components: scoreComponents,
    decision,
    why_fit: whyFit,
    why_now: company.why_now || null,
    recent_signal: company.recent_signal || null,
    evidence_refs: evidenceRefs,
    confidence: score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low'
  };
}
