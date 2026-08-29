import test from 'node:test';
import assert from 'node:assert/strict';
import { createPythonDependencyRunners } from '../skill-runtime/python-capability-runners.mjs';
import { A4_CAPABILITY_ID } from '../skill-runtime/capability-ids.js';
import { validateA4Envelope } from '../skill-runtime/validators.js';

test('A4 Python envelope satisfies the formal contract', async () => {
  const result = await createPythonDependencyRunners()[A4_CAPABILITY_ID]({
    opportunity_id: 'opp-a4-contract', evaluated_at: '2026-08-29T00:00:00Z',
    demand: { category_code: 'MATCHA', grade: 'beverage', quantity: '500 kg' }
  });
  assert.equal(validateA4Envelope(result).valid, true);
});
