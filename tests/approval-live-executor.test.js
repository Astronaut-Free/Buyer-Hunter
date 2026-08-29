import test from 'node:test';
import assert from 'node:assert/strict';
import { createApprovalLiveExecutor } from '../server/approval-live-executor.js';

function fixture() {
  const state = {
    approvals: {
      approval1: {
        approval_id: 'approval1',
        run_id: 'run1',
        action_type: 'BUYER_MESSAGE_DRAFT',
        payload: { draft: { content: 'Thanks. MOQ: 500 kg.' } },
        status: 'PENDING'
      }
    },
    runs: {
      run1: { run_id: 'run1', trigger_event_id: 'evt1' }
    },
    events: {
      evt1: {
        event_id: 'evt1',
        payload: {
          transport: {
            provider: 'smartlead',
            campaign_id: 123,
            lead_id: 789,
            reply_message_id: 'reply-abc',
            reply_email_time: '2026-08-29T05:00:00Z'
          }
        }
      }
    }
  };
  const sends = [];
  const smartlead = {
    async replyEmailThread(input) {
      sends.push(input);
      return { ok: true, provider_message_id: 'sent-1' };
    }
  };
  const execute = createApprovalLiveExecutor({
    getState: () => state,
    smartlead,
    now: () => '2026-08-29T05:01:00Z'
  });
  return { state, sends, execute, user: { id: 'internal-1', role: 'INTERNAL' } };
}

test('approved A6 draft sends through Smartlead once and records execution', async () => {
  const { state, sends, execute, user } = fixture();
  const first = await execute({ approvalId: 'approval1', user, status: 'APPROVED' });
  const second = await execute({ approvalId: 'approval1', user, status: 'APPROVED' });

  assert.equal(first.status, 200);
  assert.equal(first.body.execution.executed, true);
  assert.equal(second.status, 200);
  assert.equal(second.body.execution.replayed, true);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].campaignId, 123);
  assert.equal(sends[0].leadId, 789);
  assert.equal(sends[0].replyMessageId, 'reply-abc');
  assert.match(sends[0].emailBody, /MOQ: 500 kg/);
  assert.equal(state.approvals.approval1.execution_status, 'SENT');
});

test('edited approval sends edited draft', async () => {
  const { sends, execute, user } = fixture();
  const result = await execute({
    approvalId: 'approval1',
    user,
    status: 'EDITED',
    editedPayload: { draft: { content: 'Edited approved reply.' } }
  });
  assert.equal(result.status, 200);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].emailBody, 'Edited approved reply.');
});

test('rejected approval performs no external action', async () => {
  const { sends, execute, user } = fixture();
  const result = await execute({ approvalId: 'approval1', user, status: 'REJECTED' });
  assert.equal(result.status, 200);
  assert.equal(result.body.execution.status, 'REJECTED');
  assert.equal(sends.length, 0);
});

test('approval without Smartlead transport context fails closed', async () => {
  const { state, sends, execute, user } = fixture();
  delete state.events.evt1.payload.transport;
  const result = await execute({ approvalId: 'approval1', user, status: 'APPROVED' });
  assert.equal(result.status, 422);
  assert.equal(result.body.execution.status, 'TRANSPORT_CONTEXT_REQUIRED');
  assert.equal(sends.length, 0);
});

test('non-internal user cannot execute approval', async () => {
  const { sends, execute } = fixture();
  const result = await execute({ approvalId: 'approval1', user: { id: 'seller-1', role: 'SELLER' }, status: 'APPROVED' });
  assert.equal(result.status, 403);
  assert.equal(sends.length, 0);
});
