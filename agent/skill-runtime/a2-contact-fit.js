import { normalizeCompanyDomain } from './a2-company-identity.js';
import { normalizeEvidenceRefs } from './guards.js';

const PERSONAL_DOMAINS = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'qq.com', '163.com', 'icloud.com']);
const ROLE_PATTERNS = [/procurement/i, /purchas/i, /sourcing/i, /import/i, /category/i, /supply chain/i];
const SMALL_BUSINESS_ROLES = [/founder/i, /owner/i, /general manager/i];

export function normalizeEmailStatus(value = '') {
  const status = String(value || '').trim().toUpperCase();
  if (['VERIFIED', 'LIKELY', 'UNVERIFIED', 'INVALID', 'UNKNOWN'].includes(status)) return status;
  if (['VALID', 'DELIVERABLE'].includes(status)) return 'VERIFIED';
  return 'UNKNOWN';
}

export function evaluateA2ContactFit(contact = {}, buyerCompany = {}, { companySize } = {}) {
  const companyDomain = normalizeCompanyDomain(buyerCompany.verified_domain || buyerCompany.domain || buyerCompany.website);
  const organizationDomain = normalizeCompanyDomain(contact.organization?.primary_domain || contact.organization?.domain || contact.company_domain);
  const email = String(contact.work_email || contact.email || '').trim().toLowerCase();
  const emailDomain = email.split('@')[1] || '';
  const bindingDomain = organizationDomain || emailDomain;
  const idBound = Boolean(contact.buyer_company_id && [buyerCompany.buyer_company_id, buyerCompany.buyer_company_key, buyerCompany.id].filter(Boolean).includes(contact.buyer_company_id));
  const companyMatch = Boolean(idBound || (companyDomain && bindingDomain && companyDomain === bindingDomain));
  const companyMismatch = Boolean(companyDomain && bindingDomain && companyDomain !== bindingDomain);
  const roleText = [contact.title, contact.department, contact.seniority, contact.role_reason].filter(Boolean).join(' ');
  const roleFit = ROLE_PATTERNS.some(pattern => pattern.test(roleText)) ? 'HIGH'
    : (Number(companySize || buyerCompany.company_size || 0) <= 50 || !companySize) && SMALL_BUSINESS_ROLES.some(pattern => pattern.test(roleText)) ? 'MEDIUM'
      : roleText ? 'LOW' : 'UNKNOWN';
  let emailStatus = normalizeEmailStatus(contact.email_status);
  if (emailStatus === 'UNKNOWN' && email && companyDomain && emailDomain === companyDomain) emailStatus = 'LIKELY';
  const personalEmail = PERSONAL_DOMAINS.has(emailDomain);
  const sourceRefs = normalizeEvidenceRefs(contact.source_refs);
  const boundContact = {
    ...contact,
    work_email: email,
    email_status: emailStatus,
    company_domain: companyDomain || organizationDomain || null,
    buyer_company_id: buyerCompany.buyer_company_id || buyerCompany.buyer_company_key || buyerCompany.id || null,
    role_fit: roleFit,
    source_refs: sourceRefs
  };
  let status = 'READY';
  let reason = 'contact is bound to the buyer company and reachable';
  if (companyMismatch || !companyMatch) { status = 'MORE_EVIDENCE'; reason = companyMismatch ? 'CONTACT_COMPANY_MISMATCH' : 'CONTACT_COMPANY_BINDING_REQUIRED'; }
  else if (!email || emailStatus === 'INVALID' || emailStatus === 'UNVERIFIED') { status = 'MORE_EVIDENCE'; reason = 'VERIFIED_WORK_EMAIL_REQUIRED'; }
  else if (personalEmail) { status = 'MORE_EVIDENCE'; reason = 'PERSONAL_EMAIL_REQUIRES_EXPLICIT_REVIEW'; }
  else if (!['HIGH', 'MEDIUM'].includes(roleFit)) { status = 'MORE_EVIDENCE'; reason = 'CONTACT_ROLE_FIT_REQUIRED'; }
  return { status, reason, contact: boundContact, human_review_required: emailStatus === 'LIKELY' };
}
