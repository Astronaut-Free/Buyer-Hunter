import { createJsonClient } from './http.js';

const DEFAULT_BASE_URL = 'https://api.apollo.io/api/v1';

function requireKey(apiKey) {
  if (!apiKey) throw new Error('APOLLO_API_KEY is required');
}

function normalizeDomain(domain = '') {
  return String(domain).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim();
}

export function createApolloProvider({
  apiKey = process.env.APOLLO_API_KEY,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000
} = {}) {
  const request = createJsonClient({ fetchImpl, timeoutMs });
  const authHeaders = () => ({ 'x-api-key': apiKey, 'cache-control': 'no-cache' });

  async function searchPeople({ domain, titles = [], locations = [], seniorities = [], page = 1, perPage = 10 } = {}) {
    requireKey(apiKey);
    const query = {
      'q_organization_domains_list[]': domain ? [normalizeDomain(domain)] : [],
      'person_titles[]': titles,
      'organization_locations[]': locations,
      'person_seniorities[]': seniorities,
      page,
      per_page: Math.min(Math.max(Number(perPage) || 10, 1), 100)
    };
    const data = await request(`${baseUrl}/mixed_people/api_search`, {
      method: 'POST',
      headers: authHeaders(),
      query
    });
    return {
      total_entries: Number(data?.total_entries || 0),
      people: Array.isArray(data?.people) ? data.people : []
    };
  }

  async function enrichPerson({ id, email, name, domain } = {}) {
    requireKey(apiKey);
    if (!id && !email && !(name && domain)) throw new Error('Apollo enrichment requires id, email, or name + domain');
    const query = {
      id,
      email,
      name,
      domain: domain ? normalizeDomain(domain) : undefined,
      reveal_personal_emails: false,
      reveal_phone_number: false
    };
    return request(`${baseUrl}/people/match`, {
      method: 'POST',
      headers: authHeaders(),
      query
    });
  }

  async function findDecisionMakers({ domain, titles = [], locations = [], seniorities = ['manager', 'director', 'head', 'vp'], limit = 3 } = {}) {
    if (!domain) throw new Error('buyer company domain required');
    const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 10);
    const search = await searchPeople({ domain, titles, locations, seniorities, perPage: Math.max(safeLimit, 5) });
    const selected = search.people.filter(person => person?.id).slice(0, safeLimit);
    const enriched = [];
    for (const person of selected) {
      const match = await enrichPerson({ id: person.id, domain });
      const record = match?.person || match;
      if (!record) continue;
      enriched.push({
        contact_id: record.id || person.id,
        buyer_company_id: null,
        name: record.name || [record.first_name, record.last_name].filter(Boolean).join(' ') || person.first_name || '',
        title: record.title || person.title || '',
        work_email: record.email || '',
        email_status: record.email_status || 'unknown',
        linkedin_url: record.linkedin_url || '',
        organization: record.organization || person.organization || null,
        provider: 'apollo',
        provider_person_id: record.id || person.id
      });
    }
    return enriched;
  }

  return { searchPeople, enrichPerson, findDecisionMakers };
}

export { DEFAULT_BASE_URL as APOLLO_BASE_URL };
