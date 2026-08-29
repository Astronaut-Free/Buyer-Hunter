/**
 * Sandbox discovery providers — offline stand-ins for Trademo (trade data) and
 * Apollo (contact data), so A2 proactive development runs with zero credentials.
 *
 * Shapes mirror the real providers exactly (see providers/trademo.js
 * normalizeCompany and providers/apollo.js findDecisionMakers), so the A2
 * pipeline, buyer-fit scoring and outreach drafting exercise the same code
 * paths as live mode.
 *
 * INTEGRITY: every record is stamped `data_mode: 'SANDBOX'` and
 * `provider: 'sandbox'`. These companies are illustrative fixtures, NOT real
 * buyers, and must never be presented as verified demand. server/index.js only
 * installs these when no TRADEMO_BUYER_LIST_URL / APOLLO_API_KEY is configured
 * and QIANPULSE_EXTERNAL_MODE is not 'live'.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../fixtures/sandbox-buyers.json', import.meta.url));

function loadFixture(fixturePath = FIXTURE) {
  return JSON.parse(readFileSync(fixturePath, 'utf8'));
}

const lower = value => String(value || '').toLowerCase();
const normalizeDomain = d => String(d || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim();

// ISO-2 -> the country names a caller might pass, so `countries: ['US']` and
// `countries: ['United States']` both match.
const COUNTRY_ALIASES = {
  US: ['us', 'usa', 'united states', 'america', '美国'],
  JP: ['jp', 'japan', '日本'],
  GB: ['gb', 'uk', 'united kingdom', 'britain', '英国'],
  DE: ['de', 'germany', 'deutschland', '德国'],
  NL: ['nl', 'netherlands', 'holland', '荷兰'],
  AU: ['au', 'australia', '澳大利亚'],
  SG: ['sg', 'singapore', '新加坡'],
  CA: ['ca', 'canada', '加拿大'],
  KR: ['kr', 'korea', 'south korea', '韩国'],
};

function countryMatches(iso, wanted) {
  if (!wanted.length) return true;
  const aliases = COUNTRY_ALIASES[iso] || [lower(iso)];
  return wanted.some(w => aliases.includes(lower(w)));
}

function keywordMatches(company, wanted, hsWanted) {
  if (!wanted.length && !hsWanted.length) return true;
  const kw = company.keywords.map(lower);
  const hs = company.hs.map(lower);
  return wanted.some(w => kw.some(k => k.includes(lower(w)) || lower(w).includes(k)))
      || hsWanted.some(h => hs.some(code => code.startsWith(lower(h))));
}

function toCompany(entry, matchedKeywords, matchedHs) {
  const evidence = `sandbox:company:${entry.id}`;
  return {
    buyer_company_id: entry.id,
    legal_or_display_name: entry.name,
    country: entry.country,
    state: '',
    city: entry.city,
    address: '',
    domain: entry.domain,
    website: `https://${entry.domain}`,
    number_of_shipments: entry.shipments,
    shipment_value: null,
    matched_product_keywords: matchedKeywords,
    matched_hs_codes: matchedHs,
    trading_partner_count: null,
    sells_or_uses_product: true,
    buyer_type: entry.types[0] || 'importer',
    why_fit: entry.why,
    evidence_refs: [evidence],
    product_evidence: [`${evidence}:product-match`],
    trade_evidence: [`${evidence}:trade`],
    provider: 'sandbox',
    provider_company_id: entry.id,
    data_mode: 'SANDBOX',
    raw: { ...entry, data_mode: 'SANDBOX' },
  };
}

export function createSandboxTradeProvider({ fixturePath = FIXTURE, fixture = null } = {}) {
  const data = fixture || loadFixture(fixturePath);

  async function searchBuyers({ countries = [], product_keywords = [], hs_codes = [], page_size = 20 } = {}) {
    const wantedCountries = countries.filter(Boolean);
    const wantedKeywords = product_keywords.filter(Boolean);
    const wantedHs = hs_codes.filter(Boolean);

    const matched = data.companies
      .filter(entry => countryMatches(entry.country, wantedCountries))
      .filter(entry => keywordMatches(entry, wantedKeywords, wantedHs))
      .map(entry => {
        const mk = entry.keywords.filter(k => !wantedKeywords.length
          || wantedKeywords.some(w => lower(k).includes(lower(w)) || lower(w).includes(lower(k))));
        const mh = entry.hs.filter(h => wantedHs.some(w => lower(h).startsWith(lower(w))));
        return toCompany(entry, mk.length ? mk : entry.keywords, mh);
      })
      .sort((a, b) => b.number_of_shipments - a.number_of_shipments)
      .slice(0, Math.max(1, Number(page_size) || 20));

    return { total_companies: matched.length, companies: matched, provider: 'sandbox', data_mode: 'SANDBOX' };
  }

  return { searchBuyers };
}

export function createSandboxContactProvider({ fixturePath = FIXTURE, fixture = null } = {}) {
  const data = fixture || loadFixture(fixturePath);
  const roles = data.contacts.roles;

  async function findDecisionMakers({ domain, titles = [], limit = 3 } = {}) {
    if (!domain) throw new Error('buyer company domain required');
    const host = normalizeDomain(domain);
    const entry = data.companies.find(c => normalizeDomain(c.domain) === host);
    if (!entry) return [];

    // deterministic per-company role pick, so repeated runs are stable
    const seed = [...entry.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const count = Math.min(Math.max(Number(limit) || 1, 1), roles.length);
    const picked = [];
    for (let i = 0; i < count; i += 1) {
      const role = roles[(seed + i) % roles.length];
      const preferred = titles.find(t => lower(role.title).includes(lower(t)));
      picked.push({
        contact_id: `${entry.id}-c${i + 1}`,
        buyer_company_id: entry.id,
        name: `${role.first} ${role.last}`,
        title: preferred ? role.title : role.title,
        work_email: `${lower(role.first)}.${lower(role.last)}@${host}`,
        email_status: 'verified',
        linkedin_url: '',
        organization: { name: entry.name, website_url: `https://${entry.domain}` },
        provider: 'sandbox',
        provider_person_id: `${entry.id}-p${i + 1}`,
        data_mode: 'SANDBOX',
        source_refs: [`sandbox:contact:${entry.id}:${i + 1}`],
      });
    }
    return picked;
  }

  return { findDecisionMakers, searchPeople: async () => ({ total_entries: 0, people: [] }) };
}

export { FIXTURE as SANDBOX_FIXTURE_PATH };
