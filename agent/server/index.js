import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { decideHandoff, calculateMatch, evaluateMarketAccess } from './decision-engine.js';
import { withRetry } from './capability-adapter.js';
import { guardBuyerOutput } from './output-guard.js';
import { loadFreeOpportunities } from './repository.js';
import { createApolloProvider } from '../providers/apollo.js';
import { createTrademoProvider } from '../providers/trademo.js';
import { createSmartleadProvider } from '../providers/smartlead.js';
import { createLiveA2A6Runtime } from './a2a6-live-runtime.js';
import { createSmartleadLiveWebhookHandler } from './smartlead-live-webhook.js';
import { createApprovalLiveExecutor } from './approval-live-executor.js';
import { createA2FirstOutreachExecutor } from './a2-first-outreach-executor.js';
import { createOpportunityWorkspaceHandler } from './opportunity-workspace-handler.js';
import { createRuntimeObservabilityHandler } from './runtime-observability-handler.js';
import { createPythonDependencyRunners, pythonCapabilitiesAvailable } from '../skill-runtime/python-capability-runners.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SERVER_DIR = fileURLToPath(new URL('.', import.meta.url));
const STATE_FILE = join(SERVER_DIR, 'agent-state.json');
const PORT = Number(process.env.PORT || 3317);
const AGENT_VERSION = 'qianpulse-agent-0.2.0';
const SESSION_DAYS = 7;

const CAPABILITIES = [
  { capability_id: 'demand.normalize', version: '1.0.0', description: '标准化买家采购需求' },
  { capability_id: 'buyer.intent', version: '1.0.0', description: '读取买家采购意向结果' },
  { capability_id: 'supply.match', version: '1.0.0', description: '读取卖家能力匹配结果' },
  { capability_id: 'market.access', version: '1.0.0', description: '核验目标市场准入资料' },
  { capability_id: 'conversation.qualify', version: '1.0.0', description: '计算沟通字段完整度' },
  { capability_id: 'reply.draft', version: '1.0.0', description: '生成待人工确认的回复草稿' },
  { capability_id: 'qianpulse.a2.proactive_buyer_development', version: '1.0.0', description: '主动开发潜在海外采购商' },
  { capability_id: 'qianpulse.a6.opportunity_progression', version: '1.0.0', description: '根据买家反馈动态推进 Opportunity' }
];

const ROUTING_POLICY = {
  budget: ['buyer.intent', 'conversation.qualify'],
  price: ['buyer.intent', 'conversation.qualify', 'reply.draft'],
  delivery_date: ['supply.match', 'conversation.qualify', 'reply.draft'],
  quantity: ['supply.match', 'buyer.intent', 'conversation.qualify'],
  certification: ['market.access', 'supply.match', 'reply.draft'],
  specification: ['supply.match', 'market.access'],
  seller_capacity: ['supply.match'],
  seller_profile: ['supply.match']
};

const now = () => new Date().toISOString();
const id = prefix => `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}`;
const hash = value => createHmac('sha256', 'qianpulse-integrity').update(JSON.stringify(value)).digest('hex');
const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

async function readRawBody(req, maxBytes = 1024 * 1024) {
  let raw = '';
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error('请求体过大');
    raw += chunk;
  }
  return raw;
}

async function readBody(req) {
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体必须是 JSON');
  }
}

const initialState = () => ({
  users: {},
  sessions: {},
  events: {},
  opportunities: {
    opp_demo_001: {
      id: 'opp_demo_001',
      buyer: { id: 'buyer_demo_001', name: '美国 · 饮料品牌', market: 'US' },
      seller: { id: 'seller_demo_001', name: '贵州示例茶企' },
      fields: {
        product: '有机饮品级贵州抹茶',
        quantity: '500 kg/月以上',
        certification: 'USDA Organic',
        sample_required: true,
        oem_required: true
      },
      fit_score: 72,
      intent_score: 81,
      conversation_score: 58,
      decision: 'AI_NURTURING',
      status: '待确认',
      evidence_ids: ['ev_demo_001'],
      updated_at: now()
    }
  },
  threads: {},
  messages: {},
  runs: {},
  steps: {},
  checkpoints: {},
  approvals: {},
  idempotency: {},
  traces: []
});

let state;
let persistTimer;

async function persist() {
  await mkdir(SERVER_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persist().catch(console.error), 20);
}

async function loadState() {
  if (!existsSync(STATE_FILE)) {
    state = initialState();
    await persist();
    return;
  }
  try {
    state = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    state.events ||= {};
    state.users ||= {};
    state.sessions ||= {};
  } catch {
    state = initialState();
    await persist();
  }
}

function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(String(password), salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, digest] = stored.split(':');
    return timingSafeEqual(scryptSync(String(password), salt, 64), Buffer.from(digest, 'hex'));
  } catch {
    return false;
  }
}

function tokenFor(user) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    role: user.role,
    exp: Date.now() + SESSION_DAYS * 86400000
  })).toString('base64url');
  const signature = createHmac('sha256', process.env.AUTH_SECRET || 'change-me-in-production')
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function userFromRequest(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = state.sessions[token];
  if (!session || session.expires_at < Date.now()) return null;
  return state.users[session.user_id] || null;
}

const publicUser = user => ({
  id: user.id,
  email: user.email,
  role: user.role,
  profile: user.profile,
  created_at: user.created_at
});

function resolveOpportunity(payload) {
  if (payload.opportunity_id && state.opportunities[payload.opportunity_id]) return state.opportunities[payload.opportunity_id];
  if (payload.thread_id && state.threads[payload.thread_id]) return state.opportunities[state.threads[payload.thread_id].opportunity_id];
  return null;
}

function canAccess(user, opportunity) {
  if (!user || !opportunity) return false;
  if (user.role === 'INTERNAL') return true;
  if (opportunity.id === 'opp_demo_001') return user.role === 'SELLER' || user.role === 'BUYER';
  if (user.role === 'BUYER') return opportunity.buyer?.id === user.id;
  if (user.role === 'SELLER') return opportunity.seller?.id === user.id;
  return false;
}

function projectOpportunity(opportunity, role) {
  if (role === 'BUYER') {
    const safe = guardBuyerOutput(JSON.stringify({
      product: opportunity.fields?.product,
      quantity: opportunity.fields?.quantity
    }), { approved: true });
    return {
      id: opportunity.id,
      buyer: opportunity.buyer,
      fields: safe.allowed ? {
        product: opportunity.fields?.product,
        quantity: opportunity.fields?.quantity,
        certification: opportunity.fields?.certification
      } : {},
      status: opportunity.status,
      decision: opportunity.decision
    };
  }
  if (role === 'SELLER') return { ...opportunity, internal_notes: undefined, risk_topics: undefined };
  return opportunity;
}

function changedFieldsFromMessage(content) {
  const text = String(content || '').toLowerCase();
  const fields = [];
  if (/预算|budget|价格|price|报价/.test(text)) fields.push('budget');
  if (/交期|到货|delivery|date|q[1-4]|月份|deadline/.test(text)) fields.push('delivery_date');
  if (/数量|吨|kg|公斤|采购量|quantity|volume/.test(text)) fields.push('quantity');
  if (/认证|有机|organic|fda|jas|证书|certificate/.test(text)) fields.push('certification');
  if (/规格|目数|包装|spec|mesh|package/.test(text)) fields.push('specification');
  return [...new Set(fields)];
}

function isAcknowledgement(content) {
  return /^(thanks|thank you|谢谢|收到|好的|ok|okay|got it)[.!！。 ]*$/i.test(String(content || '').trim());
}

function handoffDecision(opportunity) {
  return decideHandoff(opportunity);
}

function getThread(opportunityId, party) {
  const found = Object.values(state.threads).find(thread => thread.opportunity_id === opportunityId && thread.party === party);
  if (found) return found;
  const thread = {
    thread_id: id('thread'),
    opportunity_id: opportunityId,
    party,
    channel: 'simulated',
    status: 'IDLE',
    created_at: now(),
    last_message_at: null
  };
  state.threads[thread.thread_id] = thread;
  return thread;
}

async function invokeLegacyCapability(capabilityId, opportunity, run, event) {
  const capability = CAPABILITIES.find(item => item.capability_id === capabilityId);
  if (!capability) return null;
  const changed = event.changed_fields || [];
  const result = {
    capability_id: capabilityId,
    capability_version: capability.version,
    run_status: 'DONE',
    changed_fields: changed,
    missing_evidence: [],
    evidence_refs: [],
    human_review_required: false,
    domain_result: {}
  };

  if (capabilityId === 'buyer.intent') result.domain_result.intent_score = opportunity.intent_score;
  if (capabilityId === 'supply.match') result.domain_result.fit_score = opportunity.fit_score;
  if (capabilityId === 'conversation.qualify') result.domain_result.conversation_score = opportunity.conversation_score;
  if (capabilityId === 'market.access') {
    result.domain_result.access_status = opportunity.fields?.certification ? 'REVIEW' : 'MORE_EVIDENCE';
    if (!opportunity.fields?.certification) {
      result.run_status = 'MORE_EVIDENCE';
      result.missing_evidence = ['certification'];
    }
  }
  if (capabilityId === 'reply.draft') {
    result.human_review_required = true;
    result.domain_result.draft = {
      status: 'DRAFT_READY',
      text: '您好，我们已收到贵方更新。以下内容为待人工确认草稿。'
    };
  }

  const step = {
    step_id: id('step'),
    run_id: run.run_id,
    sequence: Object.values(state.steps).filter(item => item.run_id === run.run_id).length + 1,
    step_type: 'CAPABILITY',
    capability_id: capabilityId,
    capability_version: capability.version,
    input_hash: hash({ opportunity_id: opportunity.id, event_id: event.event_id }),
    output_hash: hash(result),
    status: result.run_status,
    started_at: now(),
    completed_at: now(),
    evidence_refs: result.evidence_refs,
    result
  };
  state.steps[step.step_id] = step;
  return result;
}

async function invokeCapability(capabilityId, opportunity, run, event) {
  const result = await withRetry(
    () => invokeLegacyCapability(capabilityId, opportunity, run, event),
    {
      retries: 2,
      onRetry: (attempt, error) => state.traces.push({
        trace_id: id('trace'),
        run_id: run.run_id,
        span_type: 'RetrySpan',
        payload: { capability_id: capabilityId, attempt, error: error.message },
        timestamp: now()
      })
    }
  );
  if (capabilityId === 'supply.match') result.domain_result.real_matches = calculateMatch(opportunity, state.products || []);
  if (capabilityId === 'market.access') result.domain_result.access_evaluation = evaluateMarketAccess(opportunity, opportunity.seller_profile || {});
  const step = Object.values(state.steps).reverse().find(item => item.run_id === run.run_id && item.capability_id === capabilityId);
  if (step) {
    step.result = result;
    step.output_hash = hash(result);
  }
  return result;
}

async function createRun(payload, user) {
  const idem = String(payload.idempotency_key || '').trim();
  if (!idem) return { status: 400, body: { code: 'IDEMPOTENCY_KEY_REQUIRED', error: '必须提供 idempotency_key' } };
  if (state.idempotency[idem]) return { status: 200, body: state.idempotency[idem] };

  const opportunity = resolveOpportunity(payload);
  if (!opportunity) return { status: 422, body: { code: 'NEEDS_CONTEXT', message: '无法可靠绑定 Opportunity，禁止猜测。' } };
  if (!canAccess(user, opportunity)) return { status: 403, body: { error: '无权访问这笔 Opportunity' } };

  const role = user.role;
  const thread = payload.thread_id
    ? state.threads[payload.thread_id]
    : getThread(opportunity.id, role === 'BUYER' ? 'BUYER' : 'SELLER');
  const event = {
    event_id: id('evt'),
    event_type: payload.event_type || (role === 'BUYER' ? 'BUYER_MESSAGE' : 'SELLER_QUERY'),
    actor_role: role,
    actor_id: user.id,
    opportunity_id: opportunity.id,
    thread_id: thread.thread_id,
    payload,
    source: payload.source || 'api',
    timestamp: now(),
    idempotency_key: idem,
    created_at: now()
  };
  state.events[event.event_id] = event;

  const run = {
    run_id: id('run'),
    opportunity_id: opportunity.id,
    trigger_event_id: event.event_id,
    status: 'RUNNING',
    started_at: now(),
    completed_at: null,
    state_before: opportunity.status,
    state_after: null,
    capabilities_called: [],
    decision_before: opportunity.decision,
    decision_after: null,
    agent_version: AGENT_VERSION
  };
  state.runs[run.run_id] = run;
  state.traces.push({
    trace_id: id('trace'),
    run_id: run.run_id,
    span_type: 'EventRouteSpan',
    payload: { event_type: event.event_type, actor_role: role },
    timestamp: now()
  });

  const content = payload.message || payload.content || '';
  let changed = payload.changed_fields || (event.event_type === 'BUYER_MESSAGE' ? changedFieldsFromMessage(content) : []);
  if (event.event_type === 'BUYER_MESSAGE' && isAcknowledgement(content)) changed = [];
  const capabilities = event.event_type === 'BUYER_MESSAGE' && !changed.length
    ? []
    : (payload.capabilities || [...new Set(changed.flatMap(field => ROUTING_POLICY[field] || []))]);
  if (!capabilities.length && role === 'SELLER') capabilities.push('buyer.intent', 'supply.match', 'conversation.qualify');
  event.changed_fields = changed;

  for (const capabilityId of capabilities) {
    run.capabilities_called.push(capabilityId);
    const result = await invokeCapability(capabilityId, opportunity, run, event);
    if (result?.run_status === 'MORE_EVIDENCE') run.status = 'WAITING_EVIDENCE';
  }

  const decision = handoffDecision(opportunity);
  opportunity.decision = decision.decision;
  opportunity.updated_at = now();
  run.decision_after = decision.decision;
  run.state_after = opportunity.status;
  if (run.status === 'RUNNING') run.status = 'COMPLETED';

  if (event.event_type === 'BUYER_MESSAGE') {
    thread.last_message_at = now();
    thread.status = changed.length ? 'NEEDS_ANALYSIS' : 'REPLIED';
    state.messages[event.event_id] = { ...event, direction: 'INBOUND', content };
  }

  let approval = null;
  if (run.capabilities_called.includes('reply.draft')) {
    approval = {
      approval_id: id('approval'),
      opportunity_id: opportunity.id,
      run_id: run.run_id,
      action_type: 'BUYER_MESSAGE_DRAFT',
      payload: { content: '待人工确认：请根据已验证信息编辑回复。' },
      risk_summary: '涉及对外商业信息，必须人工确认。',
      status: 'PENDING',
      requested_by: user.id,
      approved_by: null,
      created_at: now(),
      approved_at: null
    };
    state.approvals[approval.approval_id] = approval;
    run.status = 'WAITING_APPROVAL';
  }

  const checkpoint = {
    checkpoint_id: id('cp'),
    run_id: run.run_id,
    opportunity_id: opportunity.id,
    step: run.capabilities_called.length,
    state: run.status,
    input_hash: hash(payload),
    output_hash: hash({ decision, opportunity }),
    created_at: now()
  };
  state.checkpoints[checkpoint.checkpoint_id] = checkpoint;
  run.completed_at = now();

  const response = {
    run,
    opportunity: projectOpportunity(opportunity, role),
    decision,
    changed_fields: changed,
    capabilities_called: run.capabilities_called,
    checkpoint_id: checkpoint.checkpoint_id,
    approval
  };
  state.idempotency[idem] = response;
  persistSoon();
  return { status: 201, body: response };
}

async function authHandler(req, res, path) {
  const payload = await readBody(req);
  if (req.method === 'POST' && path === '/api/v1/auth/register') {
    const role = ['SELLER', 'BUYER'].includes(payload.role) ? payload.role : null;
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    if (!role) return sendJson(res, 400, { error: 'role 必须是 SELLER 或 BUYER' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return sendJson(res, 400, { error: '请输入有效邮箱' });
    if (password.length < 8) return sendJson(res, 400, { error: '密码至少 8 位' });
    if (Object.values(state.users).some(user => user.email === email)) return sendJson(res, 409, { error: '该邮箱已注册' });

    const user = {
      id: id(role.toLowerCase()),
      email,
      role,
      password_hash: passwordHash(password),
      profile: {
        company_name: String(payload.company_name || ''),
        country: String(payload.country || ''),
        contact_name: '',
        verification_status: 'PENDING',
        profile_completion: 0
      },
      created_at: now(),
      last_login_at: null
    };
    state.users[user.id] = user;
    const token = tokenFor(user);
    state.sessions[token] = {
      user_id: user.id,
      expires_at: Date.now() + SESSION_DAYS * 86400000,
      created_at: now()
    };
    persistSoon();
    return sendJson(res, 201, {
      user: publicUser(user),
      token,
      next: role === 'SELLER' ? 'seller-onboarding' : 'buyer-onboarding'
    });
  }

  if (req.method === 'POST' && path === '/api/v1/auth/login') {
    const email = String(payload.email || '').trim().toLowerCase();
    const user = Object.values(state.users).find(item => item.email === email);
    if (!user || !verifyPassword(payload.password, user.password_hash)) return sendJson(res, 401, { error: '邮箱或密码错误' });
    const token = tokenFor(user);
    state.sessions[token] = {
      user_id: user.id,
      expires_at: Date.now() + SESSION_DAYS * 86400000,
      created_at: now()
    };
    user.last_login_at = now();
    persistSoon();
    return sendJson(res, 200, {
      user: publicUser(user),
      token,
      next: user.role === 'SELLER' ? 'seller-onboarding' : 'buyer-onboarding'
    });
  }

  if (req.method === 'GET' && path === '/api/v1/auth/me') {
    const user = userFromRequest(req);
    return user ? sendJson(res, 200, { user: publicUser(user) }) : sendJson(res, 401, { error: '未登录' });
  }

  if (req.method === 'POST' && path === '/api/v1/auth/logout') {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    delete state.sessions[token];
    persistSoon();
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: '认证接口不存在' });
}

function respond(res, result) {
  return sendJson(res, result.status, result.body);
}

let liveA2A6;
let approvalLiveExecutor;
let smartleadWebhookHandler;
let opportunityWorkspaceHandler;
let runtimeObservabilityHandler;

async function handleV1(req, res, path) {
  const payload = await readBody(req);
  const user = userFromRequest(req);

  if (req.method === 'GET' && path === '/api/v1/agent/capabilities') return sendJson(res, 200, CAPABILITIES);
  if (req.method === 'GET' && path === '/api/v1/internal/observability') return respond(res, runtimeObservabilityHandler({ user }));

  if (req.method === 'GET' && path === '/api/v1/opportunities') {
    if (!user) return sendJson(res, 401, { error: '请先登录' });
    const rows = Object.values(state.opportunities).filter(opportunity => canAccess(user, opportunity));
    return sendJson(res, 200, rows.map(opportunity => projectOpportunity(opportunity, user.role)));
  }

  const workspaceMatch = path.match(/^\/api\/v1\/opportunities\/([^/]+)\/workspace$/);
  if (req.method === 'GET' && workspaceMatch) {
    return respond(res, opportunityWorkspaceHandler({ opportunityId: workspaceMatch[1], user }));
  }

  const runMatch = path.match(/^\/api\/v1\/agent\/runs\/([^/]+)$/);
  if (req.method === 'GET' && runMatch) {
    const run = state.runs[runMatch[1]];
    if (!run) return sendJson(res, 404, { error: 'Run 不存在' });
    if (run.opportunity_id) {
      const opportunity = state.opportunities[run.opportunity_id];
      if (!canAccess(user, opportunity)) return sendJson(res, 404, { error: 'Run 不存在' });
    } else if (!user || !['SELLER', 'INTERNAL'].includes(user.role)) {
      return sendJson(res, 404, { error: 'Run 不存在' });
    }
    return sendJson(res, 200, user?.role === 'INTERNAL' ? run : { ...run, internal_debug: undefined });
  }

  if (req.method === 'POST' && path === '/api/v1/agent/runs') {
    if (!user) return sendJson(res, 401, { error: '请先登录后使用 Agent' });
    if (liveA2A6.isA2EventType(payload.event_type)) {
      const a2Payload = process.env.SMARTLEAD_CAMPAIGN_ID && !payload.campaign_id
        ? { ...payload, campaign_id: process.env.SMARTLEAD_CAMPAIGN_ID }
        : payload;
      return respond(res, await liveA2A6.runProactive(a2Payload, user));
    }
    if (payload.event_type === 'BUYER_MESSAGE') return respond(res, liveA2A6.runBuyerMessage(payload, user));
    return respond(res, await createRun(payload, user));
  }

  const msgMatch = path.match(/^\/api\/v1\/opportunities\/([^/]+)\/messages$/);
  if (req.method === 'POST' && msgMatch) {
    if (!user) return sendJson(res, 401, { error: '请先登录后使用 Agent' });
    return respond(res, liveA2A6.runBuyerMessage({
      ...payload,
      opportunity_id: msgMatch[1],
      event_type: 'BUYER_MESSAGE'
    }, user));
  }

  const threadsMatch = path.match(/^\/api\/v1\/opportunities\/([^/]+)\/threads$/);
  if (req.method === 'GET' && threadsMatch) {
    const opportunity = state.opportunities[threadsMatch[1]];
    if (!canAccess(user, opportunity)) return sendJson(res, 403, { error: '无权查看对话' });
    const party = user.role === 'BUYER' ? 'BUYER' : 'SELLER';
    const rows = Object.values(state.threads)
      .filter(thread => thread.opportunity_id === threadsMatch[1])
      .map(thread => user.role === 'INTERNAL' || thread.party === party
        ? thread
        : { thread_id: thread.thread_id, party: thread.party, status: thread.status });
    return sendJson(res, 200, rows);
  }

  const approvalMatch = path.match(/^\/api\/v1\/approvals\/([^/]+)$/);
  if (req.method === 'POST' && approvalMatch) {
    return respond(res, await approvalLiveExecutor({
      approvalId: approvalMatch[1],
      user,
      status: payload.status,
      editedPayload: payload.edited_payload
    }));
  }

  const traceMatch = path.match(/^\/api\/v1\/agent\/runs\/([^/]+)\/trace$/);
  if (req.method === 'GET' && traceMatch) {
    const run = state.runs[traceMatch[1]];
    const opportunity = run?.opportunity_id ? state.opportunities[run.opportunity_id] : null;
    if (!user || user.role !== 'INTERNAL' || !run || (opportunity && !canAccess(user, opportunity))) {
      return sendJson(res, 403, { error: '只有 INTERNAL 可以查看完整 Trace' });
    }
    return sendJson(res, 200, state.traces.filter(trace => trace.run_id === run.run_id));
  }

  const resumeMatch = path.match(/^\/api\/v1\/agent\/runs\/([^/]+)\/resume$/);
  if (req.method === 'POST' && resumeMatch) {
    const previous = state.runs[resumeMatch[1]];
    if (!user || !previous) return sendJson(res, 404, { error: 'Run 不存在或未登录' });
    if (!payload.idempotency_key) return sendJson(res, 400, { code: 'IDEMPOTENCY_KEY_REQUIRED', error: '恢复 Run 必须提供 idempotency_key' });

    if (previous.capabilities_called?.includes('qianpulse.a6.opportunity_progression')) {
      const opportunity = state.opportunities[previous.opportunity_id];
      if (!canAccess(user, opportunity)) return sendJson(res, 403, { error: '无权恢复这笔 Run' });
      const previousEvent = state.events[previous.trigger_event_id];
      return respond(res, liveA2A6.runBuyerMessage({
        ...(previousEvent?.payload || {}),
        ...payload,
        opportunity_id: previous.opportunity_id,
        source: 'resume'
      }, user));
    }

    if (previous.capabilities_called?.includes('qianpulse.a2.proactive_buyer_development')) {
      if (!['SELLER', 'INTERNAL'].includes(user.role)) return sendJson(res, 403, { error: '无权恢复主动拓展 Run' });
      const previousEvent = state.events[previous.trigger_event_id];
      const proactivePayload = {
        ...(previousEvent?.payload || {}),
        ...payload,
        event_type: previousEvent?.event_type || 'SELLER_PROACTIVE_DEVELOPMENT',
        source: 'resume'
      };
      if (process.env.SMARTLEAD_CAMPAIGN_ID && !proactivePayload.campaign_id) proactivePayload.campaign_id = process.env.SMARTLEAD_CAMPAIGN_ID;
      return respond(res, await liveA2A6.runProactive(proactivePayload, user));
    }

    const opportunity = state.opportunities[previous.opportunity_id];
    if (!canAccess(user, opportunity)) return sendJson(res, 403, { error: '无权恢复这笔 Run' });
    return respond(res, await createRun({
      ...payload,
      opportunity_id: previous.opportunity_id,
      event_type: 'MANUAL_RESUME'
    }, user));
  }

  return sendJson(res, 404, { error: '未找到 Agent 控制面接口' });
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const baseLoadState = loadState;
loadState = async function() {
  await baseLoadState();
  state.products ||= [{
    id: 'sku-matcha-demo',
    name: '贵州抹茶粉 · 饮品级',
    markets: 'US, JP, EU, UK, AU',
    certs: 'USDA Organic · HACCP · JAS',
    status: '已上架'
  }];
  try {
    const imported = await loadFreeOpportunities();
    for (const opportunity of imported) state.opportunities[opportunity.id] = opportunity;
    state.free_data_source = 'origin/Free';
  } catch (error) {
    state.free_data_source = 'fallback';
    state.free_data_error = error.message;
  }
};

await loadState();

// A3/A4/A5 refresh delegates to Free's authoritative Python implementation when
// its capability CLI is reachable; otherwise the bundled Node runners are used.
const pythonCapabilitiesOff = String(process.env.QIANPULSE_PYTHON_CAPABILITIES || '').toLowerCase() === 'off';
const pythonCapabilitiesOn = !pythonCapabilitiesOff && pythonCapabilitiesAvailable();
const dependencyRunners = pythonCapabilitiesOn
  ? createPythonDependencyRunners({ onFallback: message => console.warn('[capability]', message) })
  : undefined;

liveA2A6 = createLiveA2A6Runtime({
  getState: () => state,
  onMutate: persistSoon,
  providers: {
    trade_data: createTrademoProvider(),
    contact_data: createApolloProvider()
  },
  authorizeOpportunity: canAccess,
  now,
  id,
  hash,
  agentVersion: AGENT_VERSION,
  dependencyRunners
});

opportunityWorkspaceHandler = createOpportunityWorkspaceHandler({
  getState: () => state,
  canAccess
});
runtimeObservabilityHandler = createRuntimeObservabilityHandler({
  getState: () => state,
  now
});

const smartlead = createSmartleadProvider();
const a2OutreachExecutor = createA2FirstOutreachExecutor({
  getState: () => state,
  onMutate: persistSoon,
  smartlead,
  opportunityStore: liveA2A6.opportunityStore,
  now
});
approvalLiveExecutor = createApprovalLiveExecutor({
  getState: () => state,
  onMutate: persistSoon,
  smartlead,
  a2OutreachExecutor,
  now
});
smartleadWebhookHandler = createSmartleadLiveWebhookHandler({
  liveRuntime: liveA2A6,
  signingSecret: process.env.SMARTLEAD_WEBHOOK_SECRET
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        provider: process.env.DEEPSEEK_API_KEY ? 'deepseek-ready' : 'rules-fallback',
        agent_version: AGENT_VERSION,
        model: DEEPSEEK_MODEL,
        a2_a6_runtime: 'ready',
        python_capabilities: pythonCapabilitiesOn ? 'on' : 'off',
        smartlead: process.env.SMARTLEAD_API_KEY ? 'configured' : 'not-configured',
        smartlead_webhook: process.env.SMARTLEAD_WEBHOOK_SECRET ? 'configured' : 'not-configured'
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/v1/webhooks/smartlead') {
      const rawBody = await readRawBody(req);
      let body;
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return sendJson(res, 400, { code: 'INVALID_JSON' });
      }
      return respond(res, smartleadWebhookHandler({ rawBody, body, headers: req.headers }));
    }
    if (url.pathname.startsWith('/api/v1/auth/')) return authHandler(req, res, url.pathname);
    if (url.pathname.startsWith('/api/v1/')) return handleV1(req, res, url.pathname);
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

    const file = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^[/\\]+/, '');
    const filePath = join(ROOT, file);
    if (!filePath.startsWith(ROOT)) return sendJson(res, 403, { error: 'Forbidden' });
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' });
    res.end(content);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => console.log(`QianPulse Agent API: http://localhost:${PORT}`));
