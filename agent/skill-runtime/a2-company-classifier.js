import { normalizeEvidenceRefs } from './guards.js';

export const BUYER_TYPE_TAXONOMY = Object.freeze([
  'IMPORTER', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'BRAND', 'MANUFACTURER',
  'FOODSERVICE', 'INGREDIENT_USER', 'MARKETPLACE_SELLER', 'UNKNOWN'
]);

const PATTERNS = [
  ['IMPORTER', /\b(importer|imports?|importing)\b/i],
  ['DISTRIBUTOR', /\b(distributor|distribution)\b/i],
  ['WHOLESALER', /\b(wholesale|wholesaler)\b/i],
  ['RETAILER', /\b(retail|retailer|stores?)\b/i],
  ['BRAND', /\bbrand owner|consumer brand\b/i],
  ['MANUFACTURER', /\bmanufacturer|manufacturing|factory\b/i],
  ['FOODSERVICE', /\bfoodservice|restaurant|catering\b/i],
  ['INGREDIENT_USER', /\bingredient user|formulator|beverage producer|food producer\b/i],
  ['MARKETPLACE_SELLER', /\bmarketplace seller|amazon seller\b/i]
];

export function normalizeBuyerType(value = '') {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (normalized === 'MANUFACTURER_ONLY') return 'MANUFACTURER';
  return BUYER_TYPE_TAXONOMY.includes(normalized) ? normalized : 'UNKNOWN';
}

export function classifyBuyerCompany(company = {}) {
  const explicit = normalizeBuyerType(company.buyer_type?.value || company.buyer_type);
  const explicitEvidence = normalizeEvidenceRefs(
    company.buyer_type?.evidence_refs,
    company.buyer_type_evidence_refs,
    company.website_evidence,
    company.trade_evidence
  );
  if (explicit !== 'UNKNOWN' && explicitEvidence.length) {
    return { value: explicit, confidence: explicitEvidence.length > 1 ? 'HIGH' : 'MEDIUM', evidence_refs: explicitEvidence };
  }

  const facts = [company.company_description, company.description, company.about, company.website_facts, company.directory_facts]
    .flat().filter(Boolean).join(' ');
  const match = PATTERNS.find(([, pattern]) => pattern.test(facts));
  const factEvidence = normalizeEvidenceRefs(company.website_evidence, company.directory_evidence, company.evidence_refs);
  if (match && factEvidence.length) {
    return { value: match[0], confidence: 'MEDIUM', evidence_refs: factEvidence };
  }
  return { value: 'UNKNOWN', confidence: 'LOW', evidence_refs: [] };
}
