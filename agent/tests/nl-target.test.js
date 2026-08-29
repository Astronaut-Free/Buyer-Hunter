import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNlTarget, buildNlTargetPayload } from '../skill-runtime/nl-target-parser.js';
import { createDeepSeekClient } from '../providers/deepseek.js';
import { ProviderHttpError } from '../providers/http.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('parses Chinese country/product/type intents', () => {
  const parsed = parseNlTarget('我想进入德国和荷兰的抹茶市场，找进口商和茶饮连锁');
  assert.deepEqual(parsed.countries, ['de', 'nl']);
  assert.deepEqual(parsed.product_keywords, ['matcha']);
  assert.deepEqual(parsed.company_types, ['importer', 'tea chain']);
});

test('parses English intents', () => {
  const parsed = parseNlTarget('Find blueberry distributors and supermarkets in the UK and France');
  assert.deepEqual(parsed.countries, ['fr', 'gb']);
  assert.deepEqual(parsed.product_keywords, ['blueberry']);
  assert.deepEqual(parsed.company_types, ['distributor', 'supermarket']);
});

test('extracts constraints (certification / MOQ / payment)', () => {
  const parsed = parseNlTarget('德国抹茶进口商，需要 USDA Organic，MOQ 500kg，信用证付款');
  assert.match(parsed.constraints.certification, /usda/i);
  assert.equal(parsed.constraints.moq, '500');
  assert.ok(parsed.constraints.payment_terms);
});

test('unknown input yields empty arrays (never invents)', () => {
  const parsed = parseNlTarget('帮我想想怎么卖');
  assert.deepEqual(parsed.countries, []);
  assert.deepEqual(parsed.product_keywords, []);
  assert.deepEqual(parsed.company_types, []);
});

test('EU token expands to the EU market code', () => {
  const parsed = parseNlTarget('想进入欧洲的红茶市场');
  assert.ok(parsed.countries.includes('eu'));
  assert.ok(parsed.product_keywords.includes('tea'));
});

test('buildNlTargetPayload shapes the canonical /runs payload', () => {
  const parsed = parseNlTarget('德国抹茶进口商');
  const payload = buildNlTargetPayload({
    parsed,
    source: 'rules',
    seller: { company_name: 'Guizhou Tea' },
    now: () => 1724900000000
  });
  assert.equal(payload.event_type, 'SELLER_PROACTIVE_DEVELOPMENT');
  assert.match(payload.idempotency_key, /^nl_1724900000000_[0-9a-f]{8}$/);
  assert.equal(payload.input.target.countries[0], 'de');
  assert.equal(payload.input.target.product_keywords[0], 'matcha');
  assert.deepEqual(payload.input.buyer_profile.company_types, ['importer']);
  assert.equal(payload.input.execution.human_gate, true);
});

test('deepseek client posts JSON-mode chat and parses the reply', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"countries":["DE"],"product_keywords":["matcha"],"company_types":["importer"],"hs_codes":["210120"],"constraints":{"moq":"500kg"}}' } }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const client = createDeepSeekClient({ apiKey: 'test-key', fetchImpl });
  const parsed = await client.parseTarget('enter the german matcha market');
  assert.deepEqual(parsed.countries, ['DE']);
  assert.deepEqual(parsed.product_keywords, ['matcha']);
  // header names are case-insensitive; assert the value, not the key's casing
  assert.equal(new Headers(calls[0].options.headers).get('authorization'), 'Bearer test-key');
  assert.equal(JSON.parse(calls[0].options.body).response_format.type, 'json_object');
});

test('deepseek client surfaces malformed output for the rules fallback', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'Sure! Here is your target...' } }]
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const client = createDeepSeekClient({ apiKey: 'test-key', fetchImpl });
  await assert.rejects(() => client.parseTarget('anything'), SyntaxError);
});

test('deepseek client throws ProviderHttpError on network failure and requires a key', () => {
  assert.throws(() => createDeepSeekClient({ apiKey: '' }), /DEEPSEEK_API_KEY is required/);
  const fetchImpl = async () => { throw new ProviderHttpError('network down'); };
  const client = createDeepSeekClient({ apiKey: 'test-key', fetchImpl });
  assert.rejects(() => client.parseTarget('anything'), /network down/);
});

test('POST /api/v1/agent/nl-targets parses via rules and enforces auth', async () => {
  const port = 3404;
  const stateFile = join(ROOT, 'server', `agent-state.nl-${process.pid}.json`);
  await writeFile(stateFile, JSON.stringify({
    users: {}, sessions: {}, events: {}, threads: {}, messages: {}, runs: {}, steps: {},
    checkpoints: {}, approvals: {}, idempotency: {}, traces: {}, opportunities: {}, collection_runs: {}
  }));
  const child = spawn(process.execPath, ['server/bootstrap.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      AUTH_SECRET: 'qianpulse-ci-secret',
      DEEPSEEK_MODEL: 'deepseek-chat',
      // this case asserts the deterministic rule parser, so drop any real key
      // the developer machine exports -- otherwise the route reaches DeepSeek
      // and legitimately answers with parsed_source='deepseek'
      DEEPSEEK_API_KEY: '',
      AGENT_STATE_FILE: stateFile
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  const base = `http://127.0.0.1:${port}`;
  const post = (url, token, body) => fetch(`${base}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 40 && !ready; attempt += 1) {
      if (child.exitCode !== null) break;
      try { ready = (await fetch(`${base}/api/health`)).ok; } catch { /* not up */ }
      if (!ready) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`server not healthy; stderr: ${stderr}`);

    // unauthenticated -> 401
    const anon = await post('/api/v1/agent/nl-targets', null, { text: '德国抹茶进口商' });
    assert.equal(anon.status, 401);

    // register a SELLER and a BUYER
    const sellerRes = await post('/api/v1/auth/register', null, {
      role: 'SELLER', email: 'seller@nl.test', password: 'password123'
    });
    assert.equal(sellerRes.status, 201);
    const sellerToken = (await sellerRes.json()).token;

    const buyerRes = await post('/api/v1/auth/register', null, {
      role: 'BUYER', email: 'buyer@nl.test', password: 'password123'
    });
    const buyerToken = (await buyerRes.json()).token;

    // BUYER role -> 403
    const forbidden = await post('/api/v1/agent/nl-targets', buyerToken, { text: '德国抹茶进口商' });
    assert.equal(forbidden.status, 403);

    // empty text -> 400
    const empty = await post('/api/v1/agent/nl-targets', sellerToken, { text: '   ' });
    assert.equal(empty.status, 400);

    // rules path -> canonical payload (no DEEPSEEK_API_KEY set)
    const ok = await post('/api/v1/agent/nl-targets', sellerToken, {
      text: '我想进入德国抹茶市场，找进口商',
      seller: { company_name: 'Guizhou Tea', product_id: 'p1', product_name: 'Matcha' }
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.parsed_source, 'rules');
    assert.equal(body.event_type, 'SELLER_PROACTIVE_DEVELOPMENT');
    assert.deepEqual(body.input.target.countries, ['de']);
    assert.deepEqual(body.input.target.product_keywords, ['matcha']);
    assert.deepEqual(body.input.buyer_profile.company_types, ['importer']);

    // unparseable -> 422 with the partial parse for guidance
    const bad = await post('/api/v1/agent/nl-targets', sellerToken, { text: '随便聊聊' });
    assert.equal(bad.status, 422);
    assert.ok((await bad.json()).parsed);
  } catch (error) {
    throw new Error(`${error.message}\nserver stderr:\n${stderr}`);
  } finally {
    child.kill('SIGKILL');
    await rm(stateFile, { force: true });
  }
});
