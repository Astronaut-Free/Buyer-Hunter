import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpportunityWorkspace } from '../server/opportunity-workspace.js';

function stateFixture() {
  return {
    opportunities: {
      opp1: {
        id: 'opp1',
        source: 'A2_PROACTIVE_BUYER_DEVELOPMENT',
        seller: { id: 'seller1', name: 'Guizhou Tea' },
        buyer: { id: 'buyer1', name: 'US Buyer', country: 'US' },
        product: { id: 'p1', name: 'Matcha' },
        status: 'WAITING_EVIDENCE',
        stage: 'QUALIFYING',
        a2: {
          rank_score: 91,
          buyer_fit: { confidence: 'high', why_fit: 'imports tea ingredients' },
          outreach: { subject: 'Matcha supply inquiry', content: 'Hello buyer' }
        },
        a6: {
          run_status: 'MORE_EVIDENCE',
          buyer_reply: { intent: { primary: 'DELIVERY_REQUEST', confidence: 'high' } },
          next_action: { action: 'WAIT', reason: 'refresh dependencies' },
          dependency_refresh: {
            required: ['qianpulse.a4.supply_match', 'qianpulse.a5.market_access'],
            refreshed: ['qianpulse.a5.market_access']
          },
          outcome: null
        },
        evidence_ids: ['ev1', 'ev2'],
        updated_at: '2026-08-29T03:20:00Z'
      }
    },
    runs: {
      a2run: {
        run_id: 'a2run',
        opportunity_id: null,
        generated_opportunity_ids: ['opp1'],
        status: 'COMPLETED',
        capabilities_called: ['qianpulse.a2.proactive_buyer_development'],
        started_at: '2026-08-29T03:00:00Z',
        completed_at: '2026-08-29T03:00:01Z'
      },
      a6run: {
        run_id: 'a6run',
        opportunity_id: 'opp1',
        trigger_event_id: 'evt1',
        status: 'WAITING_EVIDENCE',
        capabilities_called: ['qianpulse.a6.opportunity_progression'],
        started_at: '2026-08-29T03:10:00Z',
        completed_at: '2026-08-29T03:10:01Z',
        decision_after: { action: 'WAIT' }
      }
    },
    steps: {
      step1: {
        step_id: 'step1',
        run_id: 'a6run',
        result: { missing_evidence: ['delivery_capacity'] }
      }
    },
    approvals: {
      approval1: {
        approval_id: 'approval1',
        opportunity_id: 'opp1',
        run_id: 'a6run',
        action_type: 'BUYER_MESSAGE_DRAFT',
        status: 'PENDING',
        risk_summary: '对外发送前需要人工确认',
        payload: { draft: { content: '20 days' } },
        requested_by: 'system',
        created_at: '2026-08-29T03:11:00Z'
      }
    },
    messages: {
      evt1: {
        event_id: 'evt1',
        opportunity_id: 'opp1',
        direction: 'INBOUND',
        source: 'smartlead',
        content: 'What is your delivery time?',
        timestamp: '2026-08-29T03:10:00Z'
      }
    },
    external_refs: {
      'smartlead:lead:789': {
        opportunity_id: 'opp1',
        provider: 'smartlead',
        kind: 'lead',
        external_id: '789',
        metadata: { campaign_id: 123 },
        updated_at: '2026-08-29T03:01:00Z'
      }
    },
    external_actions: {
      'approval:approval1:smartlead-reply': {
        status: 'WAITING_APPROVAL',
        provider: 'smartlead',
        updated_at: '2026-08-29T03:11:00Z'
      }
    }
  };
}

test('seller workspace combines A2, A6, approvals, blockers and Smartlead binding', () => {
  const workspace = createOpportunityWorkspace({ state: stateFixture(), opportunityId: 'opp1', role: 'SELLER' });

  assert.equal(workspace.workspace_version, '1.0.0');
  assert.equal(workspace.opportunity.id, 'opp1');
  assert.equal(workspace.score.rank, 91);
  assert.equal(workspace.a2.latest_run_id, 'a2run');
  assert.equal(workspace.a6.latest_run_id, 'a6run');
  assert.equal(workspace.a6.buyer_intent.primary, 'DELIVERY_REQUEST');
  assert.equal(workspace.integration.smartlead_bound, true);
  assert.equal(workspace.integration.external_refs[0].external_id, '789');
  assert.equal(workspace.evidence.count, 2);
  assert.deepEqual(workspace.evidence.refs, ['ev1', 'ev2']);
  assert.equal(workspace.next_action.action, 'REVIEW_APPROVAL');
  assert.ok(workspace.blockers.some(item => item.type === 'HUMAN_APPROVAL'));
  assert.ok(workspace.blockers.some(item => item.type === 'MISSING_EVIDENCE' && item.required.includes('delivery_capacity')));
  assert.ok(workspace.blockers.some(item => item.type === 'DEPENDENCY_REFRESH' && item.required.includes('qianpulse.a4.supply_match')));
  assert.equal(workspace.activity.messages[0].content, 'What is your delivery time?');
});

test('internal workspace exposes approval payload and detailed run fields', () => {
  const workspace = createOpportunityWorkspace({ state: stateFixture(), opportunityId: 'opp1', role: 'INTERNAL' });

  assert.equal(workspace.approvals[0].requested_by, 'system');
  assert.equal(workspace.approvals[0].payload.draft.content, '20 days');
  assert.equal(workspace.activity.runs[0].trigger_event_id, 'evt1');
  assert.equal(workspace.activity.external_actions[0].key, 'approval:approval1:smartlead-reply');
  assert.equal(workspace.a2.outreach.subject, 'Matcha supply inquiry');
});

test('buyer workspace hides seller internals, evidence refs, message content and external ids', () => {
  const workspace = createOpportunityWorkspace({ state: stateFixture(), opportunityId: 'opp1', role: 'BUYER' });

  assert.equal(workspace.opportunity.seller, undefined);
  assert.equal(workspace.a2, undefined);
  assert.equal(workspace.evidence.refs, undefined);
  assert.equal(workspace.activity.messages[0].content, undefined);
  assert.equal(workspace.integration.external_refs[0].external_id, undefined);
  assert.equal(workspace.integration.external_refs[0].bound, true);
  assert.equal(workspace.approvals[0].payload, undefined);
});

test('workspace returns null for unknown Opportunity', () => {
  const workspace = createOpportunityWorkspace({ state: stateFixture(), opportunityId: 'missing', role: 'SELLER' });
  assert.equal(workspace, null);
});
