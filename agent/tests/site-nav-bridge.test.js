import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BRIDGE = fileURLToPath(new URL('../../site/nav-bridge.js', import.meta.url));

class FakeElement {
  constructor(id, nodes) {
    this.id = id;
    this.nodes = nodes;
    this.tagName = 'BUTTON';
    this.listeners = {};
    this.attributes = {};
    this.disabled = false;
    this.className = '';
    this.classList = {
      values: new Set(),
      add: value => this.classList.values.add(value),
      remove: value => this.classList.values.delete(value)
    };
    this.parentNode = {
      replaceChild: (replacement) => { nodes[id] = replacement; }
    };
  }
  cloneNode() { return new FakeElement(this.id, this.nodes); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this.attributes[name] = value; }
  async click() { await this.listeners.click?.({ preventDefault() {} }); }
}

async function runBridge({ token = '', authOk = true, targetId = 'qpHeroStart', locationOverrides = {} } = {}) {
  const source = await readFile(BRIDGE, 'utf8');
  const nodes = {};
  for (const id of ['loginButton', 'qpLogin', 'qpHeroStart', 'qpGlassStart']) {
    nodes[id] = new FakeElement(id, nodes);
  }
  const storage = new Map(token ? [['qianpulse-auth-token', token], ['qianpulse-auth-user', '{}']] : []);
  const assigned = [];
  const fetchCalls = [];
  const location = {
    protocol: 'http:', hostname: '127.0.0.1', port: '3317', origin: 'http://127.0.0.1:3317', pathname: '/opportunities.html',
    assign(url) { assigned.push(url); },
    ...locationOverrides
  };
  const context = {
    console,
    location,
    window: { location },
    document: {
      readyState: 'complete',
      getElementById(id) { return nodes[id] || null; },
      querySelector() { return null; },
      createElement() { return new FakeElement('', nodes); },
      body: { appendChild(node) { nodes[node.id] = node; } }
    },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      removeItem(key) { storage.delete(key); }
    },
    async fetch(url, options) {
      fetchCalls.push({ url, options });
      return { ok: authOk };
    },
    setTimeout() { return 1; },
    clearTimeout() {}
  };
  vm.runInNewContext(source, context);
  await nodes[targetId].click();
  return { assigned, fetchCalls, storage, node: nodes.qpHeroStart, notice: nodes.qianpulseLoginNotice };
}

test('login button opened from a local HTML file reaches the running login page', async () => {
  const result = await runBridge({
    targetId: 'qpLogin',
    locationOverrides: { protocol: 'file:', hostname: '', port: '', origin: 'null', pathname: '/local/opportunities.html' }
  });
  assert.deepEqual(result.assigned, ['http://127.0.0.1:3317/workspace/#auth']);
});

test('production proxy keeps login and workspace on the public site origin', async () => {
  const result = await runBridge({
    targetId: 'qpLogin',
    locationOverrides: {
      protocol: 'http:',
      hostname: 'qianpulse.example',
      port: '4180',
      origin: 'http://qianpulse.example:4180',
      pathname: '/opportunities.html'
    }
  });
  assert.deepEqual(result.assigned, ['http://qianpulse.example:4180/workspace/#auth']);
});

test('workspace CTA prompts signed-out users to log in without navigating', async () => {
  const result = await runBridge();
  assert.deepEqual(result.assigned, []);
  assert.equal(result.fetchCalls.length, 0);
  assert.equal(result.node.disabled, false);
  assert.equal(result.notice.textContent, '请先登录帐号');
  assert.equal(result.notice.classList.values.has('is-visible'), true);
});

test('workspace CTA enters workspace only after the session is verified', async () => {
  const result = await runBridge({ token: 'valid-token' });
  assert.deepEqual(result.assigned, ['http://127.0.0.1:3317/workspace/#workspace']);
  assert.equal(result.fetchCalls[0].url, 'http://127.0.0.1:3317/api/v1/auth/me');
  assert.equal(result.fetchCalls[0].options.headers.Authorization, 'Bearer valid-token');
  assert.equal(result.notice, undefined);
});

test('workspace CTA clears an expired session and shows the login prompt', async () => {
  const result = await runBridge({ token: 'expired-token', authOk: false });
  assert.deepEqual(result.assigned, []);
  assert.equal(result.storage.has('qianpulse-auth-token'), false);
  assert.equal(result.storage.has('qianpulse-auth-user'), false);
  assert.equal(result.notice.textContent, '请先登录帐号');
});
