import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3402;

async function waitForHealth(child) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (response.ok) return;
      lastError = new Error(`health status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error('server health timeout');
}

async function spawnServer({ inviteCode }) {
  const stateFile = join(ROOT, 'server', `agent-state.auth-${process.pid}.json`);
  await writeFile(stateFile, JSON.stringify({
    users: {}, sessions: {}, events: {}, threads: {}, messages: {}, runs: {}, steps: {},
    checkpoints: {}, approvals: {}, idempotency: {}, traces: {}, opportunities: {}
  }));
  const env = {
    ...process.env,
    PORT: String(PORT),
    AUTH_SECRET: 'qianpulse-ci-secret',
    DEEPSEEK_MODEL: 'deepseek-chat',
    AGENT_STATE_FILE: stateFile
  };
  if (inviteCode !== undefined) env.INTERNAL_INVITE_CODE = inviteCode;
  const child = spawn(process.execPath, ['server/bootstrap.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  await waitForHealth(child);
  return { child, stateFile, getStderr: () => stderr };
}

async function register(payload) {
  return fetch(`http://127.0.0.1:${PORT}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

test('INTERNAL registration requires a matching invite code', async () => {
  const { child, stateFile, getStderr } = await spawnServer({ inviteCode: 'qianpulse-ci-invite' });
  try {
    const wrong = await register({
      role: 'INTERNAL', email: 'internal@qianpulse.test', password: 'password123', invite_code: 'nope'
    });
    assert.equal(wrong.status, 403);
    assert.deepEqual(await wrong.json(), { error: '邀请码无效' });

    const missing = await register({
      role: 'INTERNAL', email: 'internal@qianpulse.test', password: 'password123'
    });
    assert.equal(missing.status, 403);
    assert.deepEqual(await missing.json(), { error: '邀请码无效' });

    const ok = await register({
      role: 'INTERNAL', email: 'internal@qianpulse.test', password: 'password123',
      invite_code: 'qianpulse-ci-invite'
    });
    assert.equal(ok.status, 201);
    const body = await ok.json();
    assert.equal(body.user.role, 'INTERNAL');
    assert.equal(body.next, 'workspace');

    // The INTERNAL token can read the shared opportunity list (canAccess).
    const list = await fetch(`http://127.0.0.1:${PORT}/api/v1/opportunities`, {
      headers: { authorization: `Bearer ${body.token}` }
    });
    assert.equal(list.status, 200);
  } catch (error) {
    throw new Error(`${error.message}\nserver stderr:\n${getStderr()}`);
  } finally {
    child.kill('SIGKILL');
    await rm(stateFile, { force: true });
  }
});

test('INTERNAL registration stays closed without INTERNAL_INVITE_CODE', async () => {
  const { child, stateFile, getStderr } = await spawnServer({});
  try {
    const res = await register({
      role: 'INTERNAL', email: 'internal@qianpulse.test', password: 'password123',
      invite_code: 'anything'
    });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'INTERNAL 注册未开放' });
  } catch (error) {
    throw new Error(`${error.message}\nserver stderr:\n${getStderr()}`);
  } finally {
    child.kill('SIGKILL');
    await rm(stateFile, { force: true });
  }
});
