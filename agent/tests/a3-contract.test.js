import test from 'node:test';
import assert from 'node:assert/strict';
import { createPythonDependencyRunners } from '../skill-runtime/python-capability-runners.mjs';
import { A3_CAPABILITY_ID } from '../skill-runtime/capability-ids.js';
import { validateA3Envelope } from '../skill-runtime/validators.js';

test('A3 Python envelope satisfies the formal contract', async () => {
  const result = await createPythonDependencyRunners()[A3_CAPABILITY_ID]({
    opportunity_id: 'opp-a3-contract', evaluated_at: '2026-08-29T00:00:00Z',
    latest_buyer_message: { content: '', evidence_refs: [] }, opportunity_state: { fields: {} }
  });
  assert.equal(validateA3Envelope(result).valid, true);
  assert.equal(result.run_status, 'MORE_EVIDENCE');
  assert.equal(result.domain_result.window_status, 'UNKNOWN');
});
