import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3407;

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

async function stopChild(child) {
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 1000))
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test('agent serves the portal and both navigation directions share one origin', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'qianpulse-portal-test-'));
  const child = spawn(process.execPath, ['server/bootstrap.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      AGENT_STATE_FILE: join(temp, 'agent-state.json'),
      AGENT_OUTCOMES_FILE: join(temp, 'agent-outcomes.json'),
      AGENT_OUTCOMES_META_FILE: join(temp, 'agent-outcomes.meta.json')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForHealth(child);

    const redirect = await fetch(`http://127.0.0.1:${PORT}/portal`, { redirect: 'manual' });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), '/portal/');

    const portal = await fetch(`http://127.0.0.1:${PORT}/portal/`);
    assert.equal(portal.status, 200);
    assert.match(await portal.text(), /nav-bridge\.js/);

    const bridge = await fetch(`http://127.0.0.1:${PORT}/portal/nav-bridge.js`);
    assert.equal(bridge.status, 200);
    const bridgeSource = await bridge.text();
    assert.match(bridgeSource, /location\.pathname\.startsWith\("\/portal\/"\)/);
    assert.match(bridgeSource, /wire\("heroCta", "#workspace"/);

    const workspace = await fetch(`http://127.0.0.1:${PORT}/`);
    assert.equal(workspace.status, 200);
    const workspaceSource = await workspace.text();
    assert.match(workspaceSource, /location\.origin\}\/portal\//);
    assert.match(workspaceSource, /installMessageAvatars/);
    assert.match(workspaceSource, /assets\/chat-bg-desktop\.png/);

    for (const asset of ['agent-avatar.png', 'user-avatar.png', 'chat-bg-desktop.png', 'chat-bg-mobile.png']) {
      const response = await fetch(`http://127.0.0.1:${PORT}/assets/${asset}`);
      assert.equal(response.status, 200, `${asset} should be publicly available to the workspace`);
      assert.equal(response.headers.get('content-type'), 'image/png');
    }
  } finally {
    await stopChild(child);
    await rm(temp, { recursive: true, force: true });
  }
});
