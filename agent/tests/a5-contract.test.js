import test from 'node:test';
import assert from 'node:assert/strict';
import { createPythonDependencyRunners } from '../skill-runtime/python-capability-runners.mjs';
import { A5_CAPABILITY_ID } from '../skill-runtime/capability-ids.js';
import { validateA5Envelope } from '../skill-runtime/validators.js';

test('A5 Python envelope satisfies the formal contract', async () => {
  const result = await createPythonDependencyRunners()[A5_CAPABILITY_ID]({
    opportunity_id: 'opp-a5-contract', evaluated_at: '2026-08-29T00:00:00Z', buyer_country: 'US'
  });
  assert.equal(validateA5Envelope(result).valid, true);
  assert.equal(result.domain_result.destination_market, null);
});
