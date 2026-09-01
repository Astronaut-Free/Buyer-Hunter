import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runA2Skill } from '../skill-runtime/a2.js';
import { runA6Skill } from '../skill-runtime/a6.js';
import { createPythonDependencyRunners } from '../skill-runtime/python-capability-runners.mjs';
import { A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID } from '../skill-runtime/capability-ids.js';

const SCHEMA = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../contracts/capability-result-envelope.schema.json', import.meta.url)), 'utf8',
));

/** Minimal draft-2020 check: required keys, run_status enum, array/bool/object types. */
function validate(env) {
  const errors = [];
  for (const key of SCHEMA.required) if (!(key in env)) errors.push(`missing ${key}`);
  const rs = SCHEMA.properties.run_status.enum;
  if (!rs.includes(env.run_status)) errors.push(`run_status ${JSON.stringify(env.run_status)} not in enum`);
  for (const key of ['changed_fields', 'missing_evidence', 'evidence_refs']) {
    if (!Array.isArray(env[key])) errors.push(`${key} must be array`);
  }
  if (typeof env.human_review_required !== 'boolean') errors.push('human_review_required must be boolean');
  if (typeof env.domain_result !== 'object' || env.domain_result === null) errors.push('domain_result must be object');
  return errors;
}

const A2_INPUT = {
  seller: { seller_id: 's1', company_id: 'c1', product_id: 'p1' },
  target: { countries: ['US'], product_keywords: ['matcha'] },
  buyer_profile: { company_types: ['importer'], buyer_roles: ['procurement'] },
  constraints: { max_candidates: 10, language: 'en', contact_limit_per_company: 1 },
  execution: { channel: 'email', human_gate: true },
};
const DEP_INPUT = {
  opportunity_id: 'opp-c',
  evaluated_at: '2026-08-29T00:00:00Z',
  latest_buyer_message: { content: 'We need 20 tons to Germany by Q1 2026, organic.' },
  field_updates: { quantity: '20 tons', destination: 'Germany' },
  changed_fields: ['quantity', 'destination', 'certification', 'delivery_date'],
  opportunity_state: { stage: 'QUALIFYING', fields: {} },
  seller_context: { capacity: '8000 kg/mo', certifications: ['USDA Organic'], allowed_markets: ['Germany'] },
};

const pythonRunners = createPythonDependencyRunners();

const cases = [
  ['A2', () => runA2Skill(A2_INPUT)],
  ['A3', () => pythonRunners[A3_CAPABILITY_ID](DEP_INPUT)],
  ['A4', () => pythonRunners[A4_CAPABILITY_ID](DEP_INPUT)],
  ['A5', () => pythonRunners[A5_CAPABILITY_ID](DEP_INPUT)],
  ['A6', () => runA6Skill(DEP_INPUT)],
];

for (const [name, run] of cases) {
  test(`${name} output conforms to capability-result-envelope schema`, async () => {
    const env = await run();
    assert.deepEqual(validate(env), [], `${name}: ${JSON.stringify(env).slice(0, 200)}`);
  });
}

test('schema run_status enum matches the Node guard set', async () => {
  const { CAPABILITY_STATUS } = await import('../skill-runtime/guards.js');
  assert.deepEqual(
    [...SCHEMA.properties.run_status.enum].sort(),
    [...Object.values(CAPABILITY_STATUS)].sort(),
  );
});
