import test from 'node:test';
import assert from 'node:assert/strict';
import { runA2Skill } from '../skill-runtime/a2.js';
import { runA6Skill } from '../skill-runtime/a6.js';
import { createMockProviders } from '../skill-runtime/mock-providers.js';

const baseTarget = {
  seller: { seller_id: 'seller_001', company_id: 'company_001', product_id: 'matcha_001' },
  target: { countries: ['US'], product_keywords: ['matcha powder'] },
  buyer_profile: { company_types: ['importer'], buyer_roles: ['procurement'] },
  constraints: { max_candidates: 20, language: 'en', contact_limit_per_company: 2 },
  execution: { channel: 'email', human_gate: true }
};

test('golden path: A2 produces READY from evidence-backed company and bound contact', async () => {
  const providers = createMockProviders();
  const discovery = await providers.trade_data.search_buyers(baseTarget.target);
  const buyer = discovery.companies[0];
  const [contact] = await providers.contact_data.search_people({ buyer_company_id: buyer.buyer_company_id });
  const result = runA2Skill({ ...baseTarget, buyer_company: buyer, buyer_fit: buyer, contact });
  assert.equal(result.run_status, 'DONE');
  assert.equal(result.domain_result.outreach_readiness.status, 'READY');
  assert.equal(result.human_review_required, true);
});

test('golden path: buyer reply transitions from A2 world into A6 progression', () => {
  const result = runA6Skill({
    opportunity_id: 'opp_demo_001',
    latest_buyer_message: { content: 'We are interested. Please send more information.' },
    opportunity_state: { stage: 'CONTACTED', fields: {} },
    seller_execution_policy: { approved_materials: [{ title: 'Approved catalog', approved: true }] }
  });
  assert.equal(result.domain_result.stage_transition.after, 'REPLIED');
  assert.equal(result.domain_result.next_action.action, 'SEND_MATERIAL');
  assert.equal(result.domain_result.next_action.execution_mode, 'APPROVAL');
  assert.equal(result.domain_result.communication_brief.approved_assets.length, 1);
});
