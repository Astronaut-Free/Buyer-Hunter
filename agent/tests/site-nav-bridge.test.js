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
    this.parentNode = {
      replaceChild: (replacement) => { nodes[id] = replacement; }
    };
  }
  cloneNode() { return new FakeElement(this.id, this.nodes); }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this.attributes[name] = value; }
  async click() { await this.listeners.click?.({ preventDefault() {} }); }
}

async function runBridge({ token = '', authOk = true } = {}) {
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
    assign(url) { assigned.push(url); }
  };
  const context = {
    console,
    location,
    window: { location },
    document: {
      readyState: 'complete',
      getElementById(id) { return nodes[id] || null; },
      querySelector() { return null; }
    },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      removeItem(key) { storage.delete(key); }
    },
    async fetch(url, options) {
      fetchCalls.push({ url, options });
      return { ok: authOk };
    }
  };
  vm.runInNewContext(source, context);
  await nodes.qpHeroStart.click();
  return { assigned, fetchCalls, storage };
}

test('workspace CTA sends signed-out users to login without entering workspace', async () => {
  const result = await runBridge();
  assert.deepEqual(result.assigned, ['http://127.0.0.1:3317/workspace/#auth']);
  assert.equal(result.fetchCalls.length, 0);
});

test('workspace CTA enters workspace only after the session is verified', async () => {
  const result = await runBridge({ token: 'valid-token' });
  assert.deepEqual(result.assigned, ['http://127.0.0.1:3317/workspace/#workspace']);
  assert.equal(result.fetchCalls[0].url, 'http://127.0.0.1:3317/api/v1/auth/me');
  assert.equal(result.fetchCalls[0].options.headers.Authorization, 'Bearer valid-token');
});

test('workspace CTA clears an expired session and sends the user to login', async () => {
  const result = await runBridge({ token: 'expired-token', authOk: false });
  assert.deepEqual(result.assigned, ['http://127.0.0.1:3317/workspace/#auth']);
  assert.equal(result.storage.has('qianpulse-auth-token'), false);
  assert.equal(result.storage.has('qianpulse-auth-user'), false);
});
