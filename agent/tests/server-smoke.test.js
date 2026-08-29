import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3397;
const STATE_FILE = join(ROOT, 'server', 'agent-state.json');

async function waitForHealth(child, port = PORT) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return { response, body: await response.json() };
      lastError = new Error(`health status ${response.status}: ${await response.text()}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error('server health timeout');
}

async function stopChild(child) {
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 1000))
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test('server boots and health endpoint is usable', async () => {
  const child = spawn(process.execPath, ['server/bootstrap.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      AUTH_SECRET: 'qianpulse-ci-secret',
      DEEPSEEK_MODEL: 'deepseek-chat'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  try {
    const { body } = await waitForHealth(child);
    assert.equal(body.ok, true);
    assert.equal(body.agent_version, 'qianpulse-agent-0.2.0');
    assert.equal(body.model, 'deepseek-chat');
  } catch (error) {
    error.message = `${error.message}\nserver stderr:\n${stderr}`;
    throw error;
  } finally {
    await stopChild(child);
  }
});

test('HTTP signed Smartlead webhook creates A6 approval, Workspace exposes state, approval sends reply, and observability reflects the flow', async () => {
  const qianpulsePort = 3398;
  const webhookSecret = 'http-e2e-webhook-secret';
  const internalToken = 'http-e2e-internal-token';
  const smartleadCalls = [];

  const smartleadServer = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, `http://${req.headers.host}`);
    smartleadCalls.push({ method: req.method, pathname: url.pathname, query: Object.fromEntries(url.searchParams), raw });

    if (req.method === 'GET' && url.pathname === '/api/v1/campaigns/all-leads-activities') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        data: [{
          lead_id: 789,
          campaign_id: 123,
          activities: [{
            stats_id: 7788,
            message_id: 'sent-1',
            sent_time: '2026-08-29T03:00:00.000Z',
            reply_details: {
              message_id: 'buyer-reply-1',
              time: '2026-08-29T03:10:00.000Z',
              reply_email_body: 'What is your delivery lead time?'
            }
          }]
        }],
        hasMore: false
      }));
    }

    if (req.method === 'POST' && url.pathname === '/api/v1/campaigns/123/reply-email-thread') {
      const body = JSON.parse(raw || '{}');
      assert.equal(body.email_stats_id, '7788');
      assert.equal(body.reply_message_id, 'buyer-reply-1');
      assert.match(body.email_body, /Lead time: 20 days/);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: true, message: 'Reply sent successfully' }));
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise(resolve => smartleadServer.listen(0, '127.0.0.1', resolve));
  const smartleadPort = smartleadServer.address().port;

  const state = {
    users: {
      internal1: { id: 'internal1', email: 'internal@qianpulse.test', role: 'INTERNAL', profile: {}, created_at: '2026-08-29T03:00:00Z' }
    },
    sessions: {
      [internalToken]: { user_id: 'internal1', expires_at: Date.now() + 3600000, created_at: '2026-08-29T03:00:00Z' }
    },
    events: {},
    opportunities: {
      opp_http_001: {
        id: 'opp_http_001',
        seller: { id: 'seller1', name: 'Guizhou Tea' },
        buyer: { id: 'buyer1', name: 'US Buyer', country: 'US' },
        product: { id: 'matcha-1', name: 'MATCHA' },
        seller_context: { delivery: '20 days', moq: '500 kg', capacity: '5 tons/month', seller_sku: { sku: 'matcha-001' }, seller_policy: { allowed_markets: ['US'], payment_terms: ['T/T'] }, evidence_refs: ['seller:delivery-policy:1', 'seller:moq:1', 'seller:capacity:1', 'seller:sku:1', 'seller:policy:1', 'reg:US:1'] },
        stage: 'CONTACTED',
        status: 'ACTIVE',
        evidence_ids: ['ev-seed'],
        updated_at: '2026-08-29T03:00:00Z'
      }
    },
    opportunity_seed_index: {},
    external_refs: {
      'smartlead:lead:789': {
        opportunity_id: 'opp_http_001',
        provider: 'smartlead',
        kind: 'lead',
        external_id: '789',
        metadata: { campaign_id: 123 },
        updated_at: '2026-08-29T03:00:00Z'
      }
    },
    threads: {},
    messages: {},
    runs: {},
    steps: {},
    checkpoints: {},
    approvals: {},
    idempotency: {},
    traces: [],
    external_actions: {},
    external_action_idempotency: {}
  };
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));

  const child = spawn(process.execPath, ['server/bootstrap.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(qianpulsePort),
      AUTH_SECRET: 'qianpulse-ci-secret',
      DEEPSEEK_MODEL: 'deepseek-chat',
      SMARTLEAD_API_KEY: 'smart-key',
      SMARTLEAD_WEBHOOK_SECRET: webhookSecret,
      SMARTLEAD_BASE_URL: `http://127.0.0.1:${smartleadPort}/api/v1`,
      SMARTLEAD_REPLY_MODE: 'stats_id'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  try {
    await waitForHealth(child, qianpulsePort);

    const webhookBody = {
      event: 'EMAIL_REPLIED',
      timestamp: '2026-08-29T03:10:00.000Z',
      campaign_id: 123,
      lead_id: 789,
      lead: { id: 789, email: 'buyer@example.com' },
      reply: {
        body: 'What is your delivery lead time?',
        message_id: 'buyer-reply-1',
        received_at: '2026-08-29T03:10:00.000Z'
      }
    };
    const rawBody = JSON.stringify(webhookBody);
    const signature = `sha256=${createHmac('sha256', webhookSecret).update(rawBody).digest('hex')}`;
    const webhookResponse = await fetch(`http://127.0.0.1:${qianpulsePort}/api/v1/webhooks/smartlead`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'http-e2e-request-1',
        'x-smartlead-signature': signature
      },
      body: rawBody
    });
    const webhookResult = await webhookResponse.json();
    assert.equal(webhookResponse.status, 202);
    assert.equal(webhookResult.status, 'PROCESSED');
    assert.equal(webhookResult.opportunity_id, 'opp_http_001');
    assert.ok(webhookResult.approval?.approval_id);
    assert.match(webhookResult.approval.payload.draft.content, /Lead time: 20 days/);

    const workspaceResponse = await fetch(`http://127.0.0.1:${qianpulsePort}/api/v1/opportunities/opp_http_001/workspace`, {
      headers: { authorization: `Bearer ${internalToken}` }
    });
    const workspace = await workspaceResponse.json();
    assert.equal(workspaceResponse.status, 200);
    assert.equal(workspace.workspace_version, '1.0.0');
    assert.equal(workspace.opportunity.id, 'opp_http_001');
    assert.equal(workspace.a6.buyer_intent.primary, 'DELIVERY_REQUEST');
    assert.equal(workspace.integration.smartlead_bound, true);
    assert.equal(workspace.approvals[0].status, 'PENDING');
    assert.equal(workspace.next_action.action, 'REVIEW_APPROVAL');
    assert.ok(workspace.blockers.some(item => item.type === 'HUMAN_APPROVAL'));

    const approvalResponse = await fetch(`http://127.0.0.1:${qianpulsePort}/api/v1/approvals/${webhookResult.approval.approval_id}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${internalToken}`
      },
      body: JSON.stringify({ status: 'APPROVED' })
    });
    const approvalResult = await approvalResponse.json();
    assert.equal(approvalResponse.status, 200);
    assert.equal(approvalResult.execution.status, 'SENT');
    assert.equal(approvalResult.approval.execution_status, 'SENT');

    const completedWorkspaceResponse = await fetch(`http://127.0.0.1:${qianpulsePort}/api/v1/opportunities/opp_http_001/workspace`, {
      headers: { authorization: `Bearer ${internalToken}` }
    });
    const completedWorkspace = await completedWorkspaceResponse.json();
    assert.equal(completedWorkspaceResponse.status, 200);
    assert.equal(completedWorkspace.approvals[0].status, 'APPROVED');
    assert.equal(completedWorkspace.approvals[0].execution_status, 'SENT');
    assert.equal(completedWorkspace.activity.external_actions[0].status, 'SENT');

    const observabilityResponse = await fetch(`http://127.0.0.1:${qianpulsePort}/api/v1/internal/observability`, {
      headers: { authorization: `Bearer ${internalToken}` }
    });
    const observability = await observabilityResponse.json();
    assert.equal(observabilityResponse.status, 200);
    assert.equal(observability.observability_version, '1.0.0');
    assert.equal(observability.totals.opportunities >= 1, true);
    assert.equal(observability.funnel.a6_runs, 1);
    assert.equal(observability.funnel.buyer_replied, 1);
    assert.equal(observability.integrations.smartlead_bound_leads, 1);
    assert.equal(observability.execution.external_action_status.SENT, 1);

    const deniedObservability = await fetch(`http://127.0.0.1:${qianpulsePort}/api/v1/internal/observability`);
    assert.equal(deniedObservability.status, 401);

    assert.equal(smartleadCalls.filter(call => call.pathname === '/api/v1/campaigns/all-leads-activities').length, 1);
    assert.equal(smartleadCalls.filter(call => call.pathname === '/api/v1/campaigns/123/reply-email-thread').length, 1);
  } catch (error) {
    error.message = `${error.message}\nserver stderr:\n${stderr}`;
    throw error;
  } finally {
    await stopChild(child);
    await new Promise(resolve => smartleadServer.close(resolve));
    await rm(STATE_FILE, { force: true });
  }
});
