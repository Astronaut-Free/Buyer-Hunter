import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeObservability } from '../server/runtime-observability.js';
import { createRuntimeObservabilityHandler } from '../server/runtime-observability-handler.js';

function fixture() {
  return {
    opportunities: {
      opp1: { id: 'opp1', status: 'OUTREACH_QUEUED' },
      opp2: { id: 'opp2', status: 'WAITING_EVIDENCE' }
    },
    runs: {
      run1: {
        run_id: 'run1',
        opportunity_id: null,
        generated_opportunity_ids: ['opp1'],
        status: 'COMPLETED',
        capabilities_called: ['qianpulse.a2.proactive_buyer_development'],
        started_at: '2026-08-29T03:00:00Z',
        completed_at: '2026-08-29T03:00:01Z'
      },
      run2: {
        run_id: 'run2',
        opportunity_id: 'opp1',
        status: 'WAITING_APPROVAL',
        capabilities_called: ['qianpulse.a6.opportunity_progression'],
        started_at: '2026-08-29T03:10:00Z'
      },
      run3: {
        run_id: 'run3',
        opportunity_id: 'opp2',
        status: 'FAILED',
        capabilities_called: ['qianpulse.a6.opportunity_progression'],
        error: { code: 'A6_RUNTIME_ERROR', message: 'provider failed' },
        started_at: '2026-08-29T03:11:00Z',
        completed_at: '2026-08-29T03:11:01Z'
      }
    },
    events: {
      evt1: { event_id: 'evt1', source: 'smartlead' }
    },
    messages: {
      msg1: { event_id: 'msg1', opportunity_id: 'opp1', direction: 'INBOUND' }
    },
    approvals: {
      ap1: {
        approval_id: 'ap1',
        opportunity_id: 'opp1',
        action_type: 'BUYER_MESSAGE_DRAFT',
        status: 'PENDING',
        created_at: '2026-08-29T03:10:30Z'
      }
    },
    external_actions: {
      sent: { status: 'SENT', provider: 'smartlead', updated_at: '2026-08-29T03:10:40Z' },
      failed: { status: 'EXECUTION_ERROR', provider: 'smartlead', error: 'timeout', updated_at: '2026-08-29T03:11:20Z' }
    },
    external_refs: {
      lead1: { opportunity_id: 'opp1', provider: 'smartlead', kind: 'lead', external_id: '789' }
    },
    traces: [{ trace_id: 'trace1' }],
    free_data_source: 'origin/Free'
  };
}

test('runtime observability computes execution, funnel and safety metrics from state', () => {
  const snapshot = createRuntimeObservability(fixture(), { now: () => '2026-08-29T04:00:00Z' });

  assert.equal(snapshot.observability_version, '1.0.0');
  assert.equal(snapshot.generated_at, '2026-08-29T04:00:00Z');
  assert.equal(snapshot.totals.opportunities, 2);
  assert.equal(snapshot.totals.runs, 3);
  assert.equal(snapshot.totals.pending_approvals, 1);
  assert.equal(snapshot.execution.run_status.FAILED, 1);
  assert.equal(snapshot.execution.capability_calls['qianpulse.a6.opportunity_progression'], 2);
  assert.equal(snapshot.funnel.a2_runs, 1);
  assert.equal(snapshot.funnel.a6_runs, 2);
  assert.equal(snapshot.funnel.smartlead_bound, 1);
  assert.equal(snapshot.funnel.buyer_replied, 1);
  assert.equal(snapshot.safety.failed_runs, 1);
  assert.equal(snapshot.safety.failed_external_actions, 1);
  assert.equal(snapshot.integrations.free_data_source, 'origin/Free');
  assert.equal(snapshot.recent.failures[0].type, 'EXTERNAL_ACTION');
});

test('runtime observability handler requires INTERNAL role', () => {
  const handler = createRuntimeObservabilityHandler({ getState: () => fixture(), now: () => '2026-08-29T04:00:00Z' });

  assert.equal(handler({ user: null }).status, 401);
  assert.equal(handler({ user: { id: 'seller1', role: 'SELLER' } }).status, 403);
  const result = handler({ user: { id: 'internal1', role: 'INTERNAL' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.totals.opportunities, 2);
  assert.equal(result.body.safety.failed_runs, 1);
});
