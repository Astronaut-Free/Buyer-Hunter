import { normalizeCompanyDomain } from './a2-company-identity.js';

export const A2_SUPPRESSION_REASONS = Object.freeze([
  'UNSUBSCRIBE', 'HARD_BOUNCE', 'MANUAL_STOP', 'COMPLIANCE_BLOCK', 'DO_NOT_CONTACT',
  'EXISTING_CUSTOMER', 'DUPLICATE_ACTIVE_OUTREACH'
]);

export function suppressionKey({ sellerId, buyerCompanyId, contactEmail, channel = 'email' } = {}) {
  return [sellerId, buyerCompanyId, String(contactEmail || '').trim().toLowerCase(), channel].join(':');
}

export function isCompanyExcluded(company = {}, targetDefinition = {}) {
  const domain = normalizeCompanyDomain(company.verified_domain || company.domain || company.website);
  const excludedDomains = new Set((targetDefinition.exclude_domains || []).map(normalizeCompanyDomain).filter(Boolean));
  if (domain && excludedDomains.has(domain)) return { excluded: true, reason: 'EXCLUDED_DOMAIN' };
  const normalizedName = String(company.legal_or_display_name || company.name || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const excludedNames = (targetDefinition.exclude_companies || []).map(value => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''));
  if (normalizedName && excludedNames.includes(normalizedName)) return { excluded: true, reason: 'EXCLUDED_COMPANY' };
  return { excluded: false, reason: null };
}

export async function checkSuppression(store, context = {}) {
  if (!store?.check) return { suppressed: false, reason: null };
  const result = await store.check(context);
  const reason = String(result?.reason || result?.status || '').toUpperCase();
  return { suppressed: Boolean(result?.suppressed || A2_SUPPRESSION_REASONS.includes(reason)), reason: reason || null, record: result || null };
}
