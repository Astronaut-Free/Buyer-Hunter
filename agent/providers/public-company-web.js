import { normalizeCompanyDomain } from '../skill-runtime/a2-company-identity.js';

const ALLOWED_PATHS = ['/', '/about', '/products', '/categories', '/contact'];

function textFromHtml(html = '') {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20000);
}

export function createPublicCompanyWebProvider({ fetchImpl = globalThis.fetch, timeoutMs = 10000, maxPages = 5 } = {}) {
  async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { headers: { 'user-agent': 'QianPulseCompanyResearch/1.0 (+public-business-research)' }, signal: controller.signal, redirect: 'follow' });
      if (!response.ok) return null;
      return response.text();
    } finally { clearTimeout(timer); }
  }

  async function researchCompany({ website } = {}) {
    const domain = normalizeCompanyDomain(website);
    if (!domain) return { status: 'MORE_EVIDENCE', pages: [], evidence_records: [] };
    const origin = `https://${domain}`;
    const robots = await fetchText(`${origin}/robots.txt`).catch(() => null);
    const disallowed = String(robots || '').split(/\r?\n/).filter(line => /^disallow:/i.test(line)).map(line => line.split(':').slice(1).join(':').trim());
    const paths = ALLOWED_PATHS.filter(path => !disallowed.some(rule => rule && path.startsWith(rule))).slice(0, Math.min(maxPages, 5));
    const pages = [];
    for (const path of paths) {
      const url = `${origin}${path}`;
      const html = await fetchText(url).catch(() => null);
      if (html) pages.push({ url, path, text: textFromHtml(html) });
    }
    return {
      status: pages.length ? 'DONE' : 'MORE_EVIDENCE', domain, pages,
      evidence_records: pages.map((page, index) => ({
        evidence_id: `web:${domain}:${index + 1}`, source_type: 'OFFICIAL_WEBSITE', provider: 'public-company-web',
        source_ref: page.url, source_url: page.url, captured_at: new Date().toISOString(),
        fact: page.text.slice(0, 500), raw_snapshot_ref: page.url, confidence: 'PRIMARY'
      }))
    };
  }
  return { researchCompany };
}
