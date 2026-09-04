import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpportunityWorkspace } from '../server/opportunity-workspace.js';

function stateFixture() {
  return {
    opportunities: {
      opp1: {
        id: 'opp1',
        source: 'A2_PROACTIVE_BUYER_DEVELOPMENT',
        origin: 'A2_PROACTIVE',
        seller: { id: 'seller1', name: 'Guizhou Tea' },
        buyer: { id: 'buyer1', name: 'US Buyer', country: 'US' },
        product: { id: 'p1', name: 'Matcha' },
        fields: {
          product: 'Matcha',
          demand_title: 'Organic matcha supply',
          quantity: '500 kg/month',
          certification: 'USDA Organic',
          destination: 'US'
        },
        decision: 'VERIFY_FIRST',
        opportunity_score: 82,
        truth_score: 76,
        fit_score: 72,
        intent_score: 81,
        conversation_score: 58,
        component_scores: { timing: 84, market_access: 67 },
        why_now: ['进口量连续增长', '当前供应商出现变化'],
        gaps: ['delivery_capacity'],
        supply_match: { verdict: 'CONDITIONAL', fit_score: 72, summary: '认证匹配，交期待核验' },
        market_access: {
          status: 'MORE_EVIDENCE',
          market: 'US',
          required: ['USDA Organic'],
          missing: ['FDA facility registration'],
          evidence_refs: ['ev-market-1']
        },
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
        thread_id: 'thread1',
        opportunity_id: 'opp1',
        direction: 'INBOUND',
        channel: 'email',
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

test('seller workspace combines V2 business projection, A2, A6, approvals, blockers and Smartlead binding', () => {
  const workspace = createOpportunityWorkspace({ state: stateFixture(), opportunityId: 'opp1', role: 'SELLER' });

  assert.equal(workspace.workspace_version, '1.1.0');
  assert.equal(workspace.opportunity.id, 'opp1');
  assert.equal(workspace.opportunity.origin, 'A2_PROACTIVE');
  assert.equal(workspace.opportunity.decision, 'VERIFY_FIRST');
  assert.equal(workspace.opportunity.fields.destination, 'US');
  assert.equal(workspace.score.opportunity, 82);
  assert.equal(workspace.score.truth, 76);
  assert.equal(workspace.score.timing, 84);
  assert.equal(workspace.score.market_access, 67);
  assert.equal(workspace.score.rank, 91);
  assert.deepEqual(workspace.why_now, ['进口量连续增长', '当前供应商出现变化']);
  assert.deepEqual(workspace.gaps, ['delivery_capacity']);
  assert.equal(workspace.supply_match.fit_score, 72);
  assert.equal(workspace.market_access.status, 'MORE_EVIDENCE');
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
  assert.equal(workspace.activity.messages[0].channel, 'email');
  assert.equal(workspace.activity.messages[0].thread_id, 'thread1');
});

test('internal workspace exposes approval payload and detailed run fields', () => {
  const workspace = createOpportunityWorkspace({ state: stateFixture(), opportunityId: 'opp1', role: 'INTERNAL' });

  assert.equal(workspace.approvals[0].requested_by, 'system');
  assert.equal(workspace.approvals[0].payload.draft.content, '20 days');
  assert.equal(workspace.activity.runs[0].trigger_event_id, 'evt1');
  assert.equal(workspace.activity.external_actions[0].key, 'approval:approval1:smartlead-reply');
  assert.equal(workspace.a2.outreach.subject, 'Matcha supply inquiry');
  assert.equal(workspace.market_access.market, 'US');
});

test('buyer workspace hides seller intelligence, evidence refs, message content and external ids', () => {
  const workspace = createOpportunityWorkspace({ state: stateFixture(), opportunityId: 'opp1', role: 'BUYER' });

  assert.equal(workspace.opportunity.seller, undefined);
  assert.equal(workspace.opportunity.priority, undefined);
  assert.deepEqual(workspace.opportunity.fields, {
    product: 'Matcha',
    quantity: '500 kg/month',
    certification: 'USDA Organic'
  });
  assert.equal(workspace.score.opportunity, undefined);
  assert.equal(workspace.score.truth, undefined);
  assert.equal(workspace.why_now, undefined);
  assert.equal(workspace.gaps, undefined);
  assert.equal(workspace.supply_match, undefined);
  assert.equal(workspace.market_access, undefined);
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
