import test from 'node:test';
import assert from 'node:assert/strict';
import { createPythonDependencyRunners } from '../skill-runtime/python-capability-runners.mjs';
import { A3_CAPABILITY_ID } from '../skill-runtime/capability-ids.js';

for (const fixture of [
  { name: 'missing runtime', options: { pythonBin: 'python-not-installed-qianpulse' } },
  { name: 'timeout', options: { pythonBin: process.execPath, cliPath: process.execPath, timeoutMs: 1 } }
]) {
  test(`Python ${fixture.name} returns ERROR and never Node semantics`, async () => {
    const result = await createPythonDependencyRunners(fixture.options)[A3_CAPABILITY_ID]({
      opportunity_id: 'opp-failure', evaluated_at: '2026-08-29T00:00:00Z'
    });
    assert.equal(result.run_status, 'ERROR');
    assert.equal(result.error.code, 'CAPABILITY_RUNTIME_UNAVAILABLE');
    assert.deepEqual(result.domain_result, {});
  });
}
