import { normalizeEvidenceRefs } from './guards.js';

const PROHIBITED = [
  /currently (buying|sourcing|looking for)/i, /active demand/i, /purchase plan/i,
  /正在采购/, /近期采购计划/, /正在寻找供应商/, /马上需要/
];

export function buildA2OutreachClaims({ buyerCompany = {}, buyerFit = {}, seller = {} } = {}) {
  const buyerRefs = normalizeEvidenceRefs(buyerFit.evidence_refs, buyerCompany.evidence_refs);
  const sellerFacts = Array.isArray(seller.verified_facts) ? seller.verified_facts : [];
  const buyerClaims = buyerFit.why_fit && buyerRefs.length ? [{ text: buyerFit.why_fit, evidence_refs: buyerRefs }] : [];
  const sellerClaims = sellerFacts
    .filter(fact => fact?.fact && normalizeEvidenceRefs(fact.evidence_refs).length)
    .map(fact => ({ text: fact.fact, evidence_refs: normalizeEvidenceRefs(fact.evidence_refs) }));
  const prohibitedClaims = [...buyerClaims, ...sellerClaims].filter(claim => PROHIBITED.some(pattern => pattern.test(claim.text)));
  return {
    approved_claims: [...buyerClaims, ...sellerClaims].filter(claim => !prohibitedClaims.includes(claim)),
    buyer_claims: buyerClaims.filter(claim => !prohibitedClaims.includes(claim)),
    seller_claims: sellerClaims.filter(claim => !prohibitedClaims.includes(claim)),
    prohibited_claims: prohibitedClaims
  };
}
