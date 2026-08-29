import { createJsonClient, ProviderHttpError } from './http.js';
import { withRetry } from '../capability-adapter.js';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';

/**
 * DeepSeek chat client for the A2 natural-language entry (Phase: NL target).
 * House pattern: createJsonClient (injectable fetch, timeout, ProviderHttpError)
 * + withRetry. Never used without DEEPSEEK_API_KEY — the caller falls back to
 * the rule parser on any failure (network / bad JSON / empty content).
 */
export function createDeepSeekClient({
  apiKey = process.env.DEEPSEEK_API_KEY || '',
  model = globalThis.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000,
} = {}) {
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required');

  const request = createJsonClient({
    fetchImpl,
    timeoutMs,
    defaultHeaders: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  const SYSTEM_PROMPT = [
    'You extract a structured buyer-development target from a seller\'s natural-language intent.',
    'Output ONLY a JSON object with exactly these keys:',
    '"countries" (ISO 3166-1 alpha-2 codes array, e.g. ["DE","NL"])',
    '"product_keywords" (English product keywords array, e.g. ["matcha"])',
    '"company_types" (lowercase buyer types array from: importer, distributor, retailer, wholesaler, food brand, supermarket, e-commerce, tea chain, coffee chain)',
    '"hs_codes" (array of HS code strings, may be empty)',
    '"constraints" (object with optional keys: certification, moq, payment_terms — omit keys when absent)',
    'When the text does not mention a key, output an empty array / omit it. Never invent values.'
  ].join(' ');

  async function parseTarget(text, language = 'auto') {
    const payload = await withRetry(
      () => request(`${baseUrl}/chat/completions`, {
        method: 'POST',
        body: {
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: String(text || '') }
          ],
          response_format: { type: 'json_object' },
          temperature: 0
        }
      }),
      { retries: 1 }
    );
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new ProviderHttpError('deepseek returned empty content', { url: `${baseUrl}/chat/completions` });
    const parsed = JSON.parse(content); // throws on prose -> caller falls back to rules
    return {
      countries: Array.isArray(parsed.countries) ? parsed.countries.map(String).slice(0, 5) : [],
      product_keywords: Array.isArray(parsed.product_keywords) ? parsed.product_keywords.map(String).slice(0, 8) : [],
      company_types: Array.isArray(parsed.company_types) ? parsed.company_types.map(String).slice(0, 4) : [],
      hs_codes: Array.isArray(parsed.hs_codes) ? parsed.hs_codes.map(String).slice(0, 8) : [],
      constraints: parsed.constraints && typeof parsed.constraints === 'object' ? parsed.constraints : {},
      language: String(language || 'auto')
    };
  }

  return { parseTarget };
}
