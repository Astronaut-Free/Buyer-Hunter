import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3397;

async function waitForHealth(child) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (response.ok) return { response, body: await response.json() };
      lastError = new Error(`health status ${response.status}: ${await response.text()}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error('server health timeout');
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
    child.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});
