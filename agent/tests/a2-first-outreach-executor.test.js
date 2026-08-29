import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentStateOpportunityStore } from '../server/agent-state-opportunity-store.js';
import { createA2FirstOutreachExecutor } from '../server/a2-first-outreach-executor.js';

function fixture({ validTemplate = true, returnedLeadId = 789 } = {}) {
  const state = {
    opportunities: {
      opp1: {
        id: 'opp1',
        buyer: { id: 'buyer1', name: 'Buyer One' },
        seller: { id: 'seller1' },
        status: 'READY_FOR_OUTREACH_APPROVAL',
        updated_at: '2026-08-29T00:00:00Z'
      }
    },
    approvals: {
      ap1: {
        approval_id: 'ap1',
        opportunity_id: 'opp1',
        run_id: 'run1',
        action_type: 'A2_OUTREACH_DRAFT',
        payload: {
          draft: { subject: 'Matcha supply inquiry', content: 'Hello buyer' },
          transport: {
            provider: 'smartlead',
            campaign_id: 12,
            lead: {
              email: 'buyer@example.com',
              first_name: 'Alex',
              company_name: 'Buyer One',
              custom_fields: { qianpulse_opportunity_id: 'opp1' }
            }
          }
        },
        status: 'PENDING'
      }
    }
  };
  const calls = [];
  const store = createAgentStateOpportunityStore({ getState: () => state, now: () => '2026-08-29T02:30:00Z' });
  const smartlead = {
    async getCampaignSequences(input) {
      calls.push({ type: 'sequences', input });
      return validTemplate
        ? { data: [{ subject: '{{qianpulse_subject}}', email_body: '{{qianpulse_body}}' }] }
        : { data: [{ subject: 'Static subject', email_body: 'Static body' }] };
    },
    async addLeadsToCampaign(input) {
      calls.push({ type: 'add', input });
      return returnedLeadId ? { lead_ids: [returnedLeadId] } : { added_count: 1 };
    },
    async getLeadByEmail(input) {
      calls.push({ type: 'lookup', input });
      return { id: 990 };
    }
  };
  const executor = createA2FirstOutreachExecutor({
    getState: () => state,
    smartlead,
    opportunityStore: store,
    now: () => '2026-08-29T02:30:00Z'
  });
  return { state, calls, store, executor };
}

test('approved A2 outreach validates campaign, adds personalized lead and binds Opportunity', async () => {
  const { state, calls, store, executor } = fixture();
  const result = await executor({ approvalId: 'ap1', user: { id: 'internal1', role: 'INTERNAL' }, status: 'APPROVED' });

  assert.equal(result.status, 200);
  assert.equal(result.body.execution.status, 'QUEUED_IN_SMARTLEAD');
  const add = calls.find(call => call.type === 'add').input;
  assert.equal(add.campaignId, 12);
  assert.equal(add.leads[0].custom_fields.qianpulse_subject, 'Matcha supply inquiry');
  assert.equal(add.leads[0].custom_fields.qianpulse_body, 'Hello buyer');
  assert.equal(add.settings.return_lead_ids, true);
  assert.equal(store.resolveExternalRef({ provider: 'smartlead', kind: 'lead', externalId: 789 }).id, 'opp1');
  assert.equal(state.opportunities.opp1.status, 'OUTREACH_QUEUED');
  assert.equal(state.approvals.ap1.execution_status, 'QUEUED_IN_SMARTLEAD');
});

test('A2 first outreach fails closed when campaign template lacks QianPulse tokens', async () => {
  const { calls, executor } = fixture({ validTemplate: false });
  const result = await executor({ approvalId: 'ap1', user: { id: 'internal1', role: 'INTERNAL' }, status: 'APPROVED' });

  assert.equal(result.status, 422);
  assert.equal(result.body.execution.status, 'CAMPAIGN_TEMPLATE_INVALID');
  assert.equal(calls.some(call => call.type === 'add'), false);
});

test('A2 first outreach falls back to lead lookup and replays idempotently', async () => {
  const { calls, executor } = fixture({ returnedLeadId: null });
  const first = await executor({ approvalId: 'ap1', user: { id: 'internal1', role: 'INTERNAL' }, status: 'EDITED', editedPayload: {
    draft: { subject: 'Edited subject', content: 'Edited body' },
    transport: { provider: 'smartlead', campaign_id: 12, lead: { email: 'buyer@example.com' } }
  } });
  const second = await executor({ approvalId: 'ap1', user: { id: 'internal1', role: 'INTERNAL' }, status: 'APPROVED' });

  assert.equal(first.status, 200);
  assert.equal(first.body.execution.lead_id, '990');
  assert.equal(second.status, 200);
  assert.equal(second.replayed, true);
  assert.equal(calls.filter(call => call.type === 'add').length, 1);
  assert.equal(calls.filter(call => call.type === 'lookup').length, 1);
});

test('A2 first outreach allows the seller owner and rejects unrelated sellers', async () => {
  const { executor } = fixture();
  const result = await executor({ approvalId: 'ap1', user: { id: 'seller1', role: 'SELLER' }, status: 'APPROVED' });
  assert.equal(result.status, 200);
  const other = fixture();
  const denied = await other.executor({ approvalId: 'ap1', user: { id: 'seller2', role: 'SELLER' }, status: 'APPROVED' });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'APPROVAL_FORBIDDEN');
});
