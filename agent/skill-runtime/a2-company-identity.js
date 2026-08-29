import { createHash } from 'node:crypto';

export function normalizeCompanyDomain(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0].replace(/\.$/, '');
  }
}

export function normalizeCompanyName(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(incorporated|inc|limited|ltd|llc|corp(?:oration)?|company|co)\b\.?/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

export function resolveBuyerCompanyIdentity(company = {}) {
  const legalId = company.legal_entity_id || company.legalEntityId || company.registration_id || null;
  const domain = normalizeCompanyDomain(company.verified_domain || company.domain || company.website || company.company_url);
  const provider = String(company.provider || '').toLowerCase() || null;
  const providerId = company.provider_company_id || company.external_company_id || company.id || null;
  const name = company.legal_or_display_name || company.legal_name || company.name || '';
  const country = String(company.country || '').toUpperCase();
  let basis;
  let identityStatus;
  if (legalId) {
    basis = `legal:${country}:${legalId}`;
    identityStatus = 'LEGAL_ENTITY_VERIFIED';
  } else if (domain) {
    basis = `domain:${domain}`;
    identityStatus = 'VERIFIED_DOMAIN';
  } else if (provider && providerId) {
    basis = `provider:${provider}:${providerId}`;
    identityStatus = 'PROVIDER_IDENTIFIED';
  } else if (name) {
    basis = `canonical:${country}:${normalizeCompanyName(name)}`;
    identityStatus = 'NAME_ONLY';
  } else {
    basis = 'unresolved';
    identityStatus = 'UNRESOLVED';
  }
  return {
    buyer_company_key: `buyer_${digest(basis)}`,
    identity_status: identityStatus,
    verified_domain: domain || null,
    external_ids: provider && providerId ? { [provider]: String(providerId) } : {},
    identity_basis: basis
  };
}

export function bindBuyerCompanyIdentity(company = {}) {
  const identity = resolveBuyerCompanyIdentity(company);
  return {
    ...company,
    ...identity,
    buyer_company_id: company.buyer_company_id || identity.buyer_company_key
  };
}
