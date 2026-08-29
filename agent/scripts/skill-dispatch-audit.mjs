/**
 * Skill dispatch audit — answers "can the A2-A6 skills be dispatched normally?"
 *
 *   node agent/scripts/skill-dispatch-audit.mjs [--json]
 *
 * Checks, in order:
 *   1. registry     every QIANPULSE_SKILL_REGISTRY entry is enabled + versioned
 *   2. routing       every event type resolves to a non-empty capability list
 *   3. envelope      each capability runs on a fixture and returns a valid envelope
 *   4. e2e           A2 -> Opportunity -> buyer reply -> A6 dispatches through the
 *                    live runtime and records one AgentStep per dispatched capability
 *   5. python        A3/A4/A5 delegate to Free's Python capability CLI (or fall back)
 *
 * Exits non-zero if any check fails. `--json` prints the machine-readable report.
 */
import {
  QIANPULSE_SKILL_REGISTRY,
  QIANPULSE_EVENT_ROUTING,
  resolveQianPulseSkillCapabilities,
  runA2Skill,
  runA3PurchaseTiming,
  runA4SupplyMatch,
  runA5TradeRisk,
  runA6Skill,
  validateCapabilityEnvelope,
  validateA2Envelope,
  validateA6Envelope,
} from '../skill-runtime/index.js';
import { createLiveA2A6Runtime } from '../server/a2a6-live-runtime.js';
import { createPythonDependencyRunners, pythonCapabilitiesAvailable } from '../skill-runtime/python-capability-runners.mjs';

const jsonOnly = process.argv.includes('--json');
const report = { checks: {}, capabilities: [], ok: true };
const fail = (msg) => { report.ok = false; if (!jsonOnly) console.error('  ✗ ' + msg); };
const pass = (msg) => { if (!jsonOnly) console.log('  ✓ ' + msg); };

// ---- 1. registry ----------------------------------------------------------
if (!jsonOnly) console.log('\n[1] registry');
const registered = new Set();
for (const entry of QIANPULSE_SKILL_REGISTRY) {
  registered.add(entry.capability_id);
  if (entry.enabled !== true) fail(`${entry.capability_id} not enabled`);
  else if (!entry.version) fail(`${entry.capability_id} missing version`);
  else pass(`${entry.capability_id} v${entry.version} enabled`);
}
report.checks.registry = report.ok;

// ---- 2. routing ---------------------------------------------------------
if (!jsonOnly) console.log('\n[2] event routing');
let routingOk = true;
for (const eventType of Object.keys(QIANPULSE_EVENT_ROUTING)) {
  const resolved = resolveQianPulseSkillCapabilities(eventType, { hasBuyerReply: eventType === 'BUYER_MESSAGE' });
  if (!resolved.length) { fail(`${eventType} resolves to nothing`); routingOk = false; }
  else if (resolved.some((c) => !registered.has(c))) { fail(`${eventType} -> unregistered ${resolved}`); routingOk = false; }
  else pass(`${eventType} -> ${resolved.join(', ')}`);
}
report.checks.routing = routingOk;

// ---- 3. per-capability envelope ---------------------------------------
if (!jsonOnly) console.log('\n[3] capability envelopes');
const A2_INPUT = {
  seller: { seller_id: 's1', company_id: 'c1', product_id: 'p1', company_name: 'Guizhou Tea', product_name: 'Matcha' },
  target: { countries: ['US'], product_keywords: ['matcha'] },
  buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] },
  constraints: { max_candidates: 5, language: 'en', contact_limit_per_company: 1 },
  execution: { channel: 'email', human_gate: true },
  buyer_company: { buyer_company_id: 'b1', legal_or_display_name: 'US Importer', country: 'US', domain: 'buyer.example', sells_or_uses_product: true, why_fit: 'imports matcha', evidence_refs: ['ev1'], product_evidence: ['ev2'] },
  buyer_fit: { product_relevance: 'yes', evidence_refs: ['ev1', 'ev2'], why_fit: 'imports matcha' },
  contact: { buyer_company_id: 'b1', name: 'Dana', work_email: 'p@buyer.example', role_reason: 'procurement' },
};
const DEP_INPUT = {
  opportunity_id: 'opp-audit',
  latest_buyer_message: { content: 'We need 20 tons shipped to Los Angeles by Q1 2026, organic certified.' },
  field_updates: { quantity: '20 tons', destination: 'Los Angeles' },
  changed_fields: ['quantity', 'destination', 'certification', 'delivery_date'],
  opportunity_state: { stage: 'QUALIFYING', fields: {} },
  seller_context: { capacity: '8000 kg/mo', delivery: '20 days', certifications: ['USDA Organic'], allowed_markets: ['Los Angeles', 'US'] },
};
const cases = [
  ['qianpulse.a2.proactive_buyer_development', () => runA2Skill(A2_INPUT), validateA2Envelope],
  ['qianpulse.a3.purchase_timing', () => runA3PurchaseTiming(DEP_INPUT), validateCapabilityEnvelope],
  ['qianpulse.a4.supply_match', () => runA4SupplyMatch(DEP_INPUT), validateCapabilityEnvelope],
  ['qianpulse.a5.trade_risk', () => runA5TradeRisk(DEP_INPUT), validateCapabilityEnvelope],
  ['qianpulse.a6.opportunity_progression', () => runA6Skill(DEP_INPUT), validateA6Envelope],
];
for (const [id, run, validate] of cases) {
  const record = { capability_id: id, dispatched: false, envelope_valid: false, run_status: null, step_recorded: false };
  try {
    const env = run();
    record.dispatched = true;
    record.run_status = env.run_status;
    const v = validate(env);
    record.envelope_valid = v.valid;
    if (!v.valid) fail(`${id} invalid envelope: ${v.errors.join('; ')}`);
    else pass(`${id} -> ${env.run_status} (envelope valid)`);
  } catch (err) {
    fail(`${id} threw: ${err.message}`);
  }
  report.capabilities.push(record);
}
report.checks.envelopes = report.capabilities.every((c) => c.dispatched && c.envelope_valid);

// ---- 4. live-runtime e2e --------------------------------------------
if (!jsonOnly) console.log('\n[4] live runtime dispatch (A2 -> reply -> A6)');
let counter = 0;
const state = { opportunities: {}, users: {}, sessions: {}, runs: {}, steps: {}, checkpoints: {}, approvals: {}, events: {} };
const user = { id: 'seller-audit', role: 'SELLER', profile: { company_name: 'Guizhou Tea' } };
const e2ePythonOn = String(process.env.QIANPULSE_PYTHON_CAPABILITIES || '').toLowerCase() !== 'off' && pythonCapabilitiesAvailable();
const runtime = createLiveA2A6Runtime({
  getState: () => state,
  onMutate: () => {},
  now: () => '2026-08-29T00:00:00Z',
  id: (p) => `${p}-${++counter}`,
  authorizeOpportunity: (a, o) => a?.role === 'INTERNAL' || (a?.role === 'SELLER' && o.seller?.id === a.id),
  providers: {
    trade_data: { async searchBuyers() { return { companies: [{ buyer_company_id: 'bc1', legal_or_display_name: 'Pacific Importers', country: 'US', domain: 'pac.example', sells_or_uses_product: true, buyer_type: 'importer', why_fit: 'customs records show 22 matcha shipments', number_of_shipments: 22, evidence_refs: ['ev_c'], product_evidence: ['ev_p'], trade_evidence: ['ev_t'] }] }; } },
    contact_data: { async findDecisionMakers() { return [{ buyer_company_id: 'bc1', name: 'Dana Lee', title: 'Procurement Manager', work_email: 'p@pac.example', email_status: 'verified', source_refs: ['ev_ct'] }]; } },
  },
  dependencyRunners: e2ePythonOn ? createPythonDependencyRunners() : undefined,
});

try {
  const a2 = await runtime.runProactive({
    event_type: 'SELLER_PROACTIVE_DEVELOPMENT', idempotency_key: 'audit-a2', max_ready: 1,
    input: { seller: { seller_id: 'seller-audit', product_id: 'p1', company_name: 'Guizhou Tea', product_name: 'Matcha' }, target: { countries: ['US'], product_keywords: ['matcha'] }, buyer_profile: { company_types: ['importer'], buyer_roles: ['Procurement Manager'] }, constraints: { max_candidates: 5, language: 'en', contact_limit_per_company: 1 }, execution: { channel: 'email', human_gate: true } },
  }, user);
  if (a2.status !== 201) throw new Error(`A2 run status ${a2.status}`);
  const oppId = a2.body.generated_opportunity_ids[0];
  if (!oppId) throw new Error('A2 produced no opportunity');
  const a2Steps = Object.values(state.steps).filter((s) => s.run_id === a2.body.run.run_id).map((s) => s.capability_id);
  const a2rec = report.capabilities.find((c) => c.capability_id === 'qianpulse.a2.proactive_buyer_development');
  a2rec.step_recorded = a2Steps.includes('qianpulse.a2.proactive_buyer_development');
  pass(`A2 dispatched -> opportunity ${oppId}, steps: ${a2Steps.join(', ')}`);

  const reply = runtime.runBuyerMessage({
    opportunity_id: oppId, idempotency_key: 'audit-reply',
    message: 'Thanks. We would need 20 tons per year shipped to Los Angeles. What is your lead time?',
    source_message_id: 'm1', evidence_ref: 'email:m1', seller_context: { delivery: '20 days', capacity: '8000 kg/mo' },
  }, user);
  if (reply.status !== 201) throw new Error(`A6 run status ${reply.status}`);
  const called = reply.body.run.capabilities_called || [];
  const replySteps = Object.values(state.steps).filter((s) => s.run_id === reply.body.run.run_id).map((s) => s.capability_id);
  for (const rec of report.capabilities) {
    if (rec.capability_id === 'qianpulse.a2.proactive_buyer_development') continue;
    if (replySteps.includes(rec.capability_id)) rec.step_recorded = true;
  }
  const cpCount = Object.keys(state.checkpoints).length;
  if (!replySteps.includes('qianpulse.a6.opportunity_progression')) throw new Error('A6 step not recorded');
  if (cpCount < 2) throw new Error(`expected >=2 checkpoints, got ${cpCount}`);
  pass(`A6 dispatched -> ${reply.body.envelope.run_status}, capabilities_called: ${called.join(', ')}`);
  pass(`checkpoints recorded: ${cpCount}`);
  if (e2ePythonOn) {
    const a4Step = Object.values(state.steps).find((s) => s.run_id === reply.body.run.run_id && s.capability_id === 'qianpulse.a4.supply_match');
    const src = a4Step?.result?.domain_result?.source;
    if (src !== 'python') throw new Error(`A4 refresh step source=${src}, expected python`);
    pass(`A4 refresh in live cycle used Free's Python implementation (source: ${src})`);
    report.summary_e2e_a4_source = src;
  }
  report.checks.e2e = true;
} catch (err) {
  fail(`e2e: ${err.message}`);
  report.checks.e2e = false;
}

// ---- 5. python capability delegation --------------------------------
if (!jsonOnly) console.log('\n[5] python capability delegation (A3/A4/A5 -> Free)');
const pyForcedOff = String(process.env.QIANPULSE_PYTHON_CAPABILITIES || '').toLowerCase() === 'off';
const pyAvailable = !pyForcedOff && pythonCapabilitiesAvailable();
report.python = { available: pyAvailable, capabilities: {} };
try {
  const pyCtx = {
    opportunity_id: 'opp-py', changed_fields: ['quantity', 'destination'],
    opportunity_state: { stage: 'QUALIFYING', fields: { product: 'MATCHA', demand_title: 'bulk matcha', quantity: '500 kg', destination: 'US', age_days: '6' } },
    field_updates: { quantity: '2 tons', destination: 'US' },
    seller_context: { capacity: '8000 kg/mo', allowed_markets: ['US'] },
    latest_buyer_message: { content: 'we need 2 tons to US', evidence_ref: 'email:m1' },
  };
  const runners = pyAvailable
    ? createPythonDependencyRunners()
    : createPythonDependencyRunners({ pythonBin: 'python-disabled-for-audit' });
  const expected = pyAvailable ? 'python' : 'node-fallback';
  for (const id of ['qianpulse.a3.purchase_timing', 'qianpulse.a4.supply_match', 'qianpulse.a5.trade_risk']) {
    const env = runners[id](pyCtx);
    const src = env.domain_result?.source;
    report.python.capabilities[id] = { source: src, run_status: env.run_status };
    if (src !== expected) fail(`${id} source=${src}, expected ${expected}`);
    else pass(`${id} -> ${env.run_status} (source: ${src})`);
  }
  // when python is on, prove A4 carries Free's per-SKU verdict
  if (pyAvailable) {
    const a4 = runners['qianpulse.a4.supply_match'](pyCtx);
    const ok = ['HAS_MATCH', 'CONDITIONAL_ONLY', 'NO_MATCH'].includes(a4.domain_result?.supply_pool_status);
    if (!ok) fail('A4 python result missing supply_pool_status from Free supply_demand_fit');
    else pass(`A4 python verdict: ${a4.domain_result.supply_pool_status} / ${a4.domain_result.best_verdict}`);
  }
  report.checks.python = report.ok;
} catch (err) {
  fail(`python: ${err.message}`);
  report.checks.python = false;
}

// ---- summary -------------------------------------------------------
report.summary = {
  registry: report.checks.registry,
  routing: report.checks.routing,
  envelopes: report.checks.envelopes,
  e2e: report.checks.e2e,
  python: report.checks.python,
  python_available: pyAvailable,
  dispatched: report.capabilities.filter((c) => c.dispatched).length,
  total: report.capabilities.length,
};
if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('\n' + '─'.repeat(60));
  console.log(report.ok ? 'SKILL DISPATCH: OK' : 'SKILL DISPATCH: FAILURES');
  for (const c of report.capabilities) {
    console.log(`  ${c.capability_id.padEnd(42)} dispatch=${c.dispatched} envelope=${c.envelope_valid} step=${c.step_recorded} (${c.run_status})`);
  }
}
process.exit(report.ok ? 0 : 1);
