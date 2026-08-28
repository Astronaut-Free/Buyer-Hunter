export class ProviderHttpError extends Error {
  constructor(message, { status = 0, url = '', body = null } = {}) {
    super(message);
    this.name = 'ProviderHttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

function appendQuery(url, query = {}) {
  const target = new URL(url);
  for (const [key, raw] of Object.entries(query || {})) {
    if (raw === undefined || raw === null || raw === '') continue;
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) target.searchParams.append(key, String(value));
  }
  return target.toString();
}

export function createJsonClient({ fetchImpl = globalThis.fetch, timeoutMs = 15000, defaultHeaders = {} } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation required');

  return async function request(url, { method = 'GET', query, headers = {}, body } = {}) {
    const finalUrl = appendQuery(url, query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(finalUrl, {
        method,
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...defaultHeaders,
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      let parsed = null;
      if (text) {
        try { parsed = JSON.parse(text); } catch { parsed = text; }
      }
      if (!response.ok) {
        throw new ProviderHttpError(`provider request failed: ${response.status}`, {
          status: response.status,
          url: finalUrl,
          body: parsed
        });
      }
      return parsed;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new ProviderHttpError('provider request timeout', { url: finalUrl });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
