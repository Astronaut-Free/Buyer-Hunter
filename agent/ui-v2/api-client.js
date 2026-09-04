const AUTH_TOKEN_KEY = 'qianpulse-auth-token';

function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function agentBase() {
  const explicit = typeof window !== 'undefined' ? window.QIANPULSE_APP_API_URL : '';
  if (explicit) return trimSlash(explicit);
  if (typeof location !== 'undefined') return trimSlash(location.origin);
  return 'http://127.0.0.1:3317';
}

function decisionBase() {
  const explicit = typeof window !== 'undefined' ? window.QIANPULSE_API_URL : '';
  return trimSlash(explicit || 'http://127.0.0.1:8000');
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', body = null, path = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.path = path;
  }
}

export function authToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Storage can be blocked; callers still receive the auth response.
  }
}

async function request(base, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (options.auth !== false) {
    const token = authToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${base}${path}`, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const message = body?.error || body?.message || body?.detail || `HTTP ${response.status}`;
    throw new ApiError(message, {
      status: response.status,
      code: body?.code || `HTTP_${response.status}`,
      body,
      path,
    });
  }
  return body;
}

function jsonBody(value) {
  return JSON.stringify(value ?? {});
}

export const agentApi = {
  health: () => request(agentBase(), '/api/health', { auth: false }),
  login: payload => request(agentBase(), '/api/v1/auth/login', { method: 'POST', auth: false, body: jsonBody(payload) }),
  register: payload => request(agentBase(), '/api/v1/auth/register', { method: 'POST', auth: false, body: jsonBody(payload) }),
  me: () => request(agentBase(), '/api/v1/auth/me'),
  logout: () => request(agentBase(), '/api/v1/auth/logout', { method: 'POST' }),

  opportunities: () => request(agentBase(), '/api/v1/opportunities'),
  workspace: opportunityId => request(agentBase(), `/api/v1/opportunities/${encodeURIComponent(opportunityId)}/workspace`),
  threads: opportunityId => request(agentBase(), `/api/v1/opportunities/${encodeURIComponent(opportunityId)}/threads`),
  sendBuyerMessage: (opportunityId, payload) => request(agentBase(), `/api/v1/opportunities/${encodeURIComponent(opportunityId)}/messages`, { method: 'POST', body: jsonBody(payload) }),

  capabilities: () => request(agentBase(), '/api/v1/agent/capabilities'),
  parseMission: payload => request(agentBase(), '/api/v1/agent/nl-targets', { method: 'POST', body: jsonBody(payload) }),
  createRun: payload => request(agentBase(), '/api/v1/agent/runs', { method: 'POST', body: jsonBody(payload) }),
  run: runId => request(agentBase(), `/api/v1/agent/runs/${encodeURIComponent(runId)}`),
  resumeRun: (runId, payload) => request(agentBase(), `/api/v1/agent/runs/${encodeURIComponent(runId)}/resume`, { method: 'POST', body: jsonBody(payload) }),
  approve: (approvalId, payload) => request(agentBase(), `/api/v1/approvals/${encodeURIComponent(approvalId)}`, { method: 'POST', body: jsonBody(payload) }),

  collectionRuns: () => request(agentBase(), '/api/v1/collection-runs'),
  createCollectionRun: payload => request(agentBase(), '/api/v1/collection-runs', { method: 'POST', body: jsonBody(payload) }),
  collectionRun: id => request(agentBase(), `/api/v1/collection-runs/${encodeURIComponent(id)}`),

  intake: payload => request(agentBase(), '/api/v1/agent/intake', { method: 'POST', body: jsonBody(payload) }),
  chat: payload => request(agentBase(), '/api/v1/agent/chat', { method: 'POST', body: jsonBody(payload) }),
  publicOpportunities: () => request(agentBase(), '/api/public/opportunities', { auth: false }),
};

export const decisionApi = {
  health: () => request(decisionBase(), '/health', { auth: false }),
  recent: (limit = 12) => request(decisionBase(), `/api/v1/opportunities/recent?limit=${encodeURIComponent(limit)}`, { auth: false }),
  today: ({ sellerProfileId = 'seller-guizhou-specialty-demo', limit = 5, categoryCode, marketCode } = {}) => {
    const query = new URLSearchParams({ seller_profile_id: sellerProfileId, limit: String(limit) });
    if (categoryCode) query.set('category_code', categoryCode);
    if (marketCode) query.set('market_code', marketCode);
    return request(decisionBase(), `/api/v1/opportunities/today?${query.toString()}`, { auth: false });
  },
  decision: (opportunityId, { full = false } = {}) => request(
    decisionBase(),
    `/api/v1/opportunities/${encodeURIComponent(opportunityId)}/decision`,
    { auth: false, headers: full ? { 'X-Demo-Member': 'true' } : {} },
  ),
  accessChannels: (opportunityId, { granted = false } = {}) => request(
    decisionBase(),
    `/api/v1/opportunities/${encodeURIComponent(opportunityId)}/access-channels`,
    { auth: false, headers: granted ? { 'X-Lead-Access': 'granted' } : {} },
  ),
  briefUrl: (opportunityId, { member = false } = {}) => `${decisionBase()}/api/v1/opportunities/${encodeURIComponent(opportunityId)}/brief.pdf${member ? '?member=1' : ''}`,
};

export const apiConfig = Object.freeze({
  get agentBase() { return agentBase(); },
  get decisionBase() { return decisionBase(); },
  authTokenKey: AUTH_TOKEN_KEY,
});
