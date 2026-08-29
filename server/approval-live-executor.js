import { executeApprovedSmartleadReply } from '../external-action-executor.js';

function stateIdempotencyStore(getState) {
  return {
    has(key) {
      const state = getState();
      state.external_action_idempotency ||= {};
      return Object.prototype.hasOwnProperty.call(state.external_action_idempotency, key);
    },
    get(key) {
      const state = getState();
      state.external_action_idempotency ||= {};
      return state.external_action_idempotency[key];
    },
    set(key, value) {
      const state = getState();
      state.external_action_idempotency ||= {};
      state.external_action_idempotency[key] = value;
      return value;
    }
  };
}

function draftContent(payload = {}) {
  if (typeof payload === 'string') return payload;
  if (typeof payload.content === 'string') return payload.content;
  if (typeof payload.draft === 'string') return payload.draft;
  if (typeof payload.draft?.content === 'string') return payload.draft.content;
  return '';
}

export function createApprovalLiveExecutor({
  getState,
  onMutate = () => {},
  smartlead,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof getState !== 'function') throw new Error('getState required');
  const idempotencyStore = stateIdempotencyStore(getState);

  return async function approveAndExecute({ approvalId, user, status, editedPayload } = {}) {
    const state = getState();
    state.approvals ||= {};
    state.runs ||= {};
    state.events ||= {};
    state.external_actions ||= {};

    if (!user || user.role !== 'INTERNAL') return { status: 403, body: { code: 'INTERNAL_REQUIRED' } };
    const approval = state.approvals[approvalId];
    if (!approval) return { status: 404, body: { code: 'APPROVAL_NOT_FOUND' } };
    if (!['APPROVED', 'EDITED', 'REJECTED'].includes(status)) return { status: 400, body: { code: 'INVALID_APPROVAL_STATUS' } };

    approval.status = status;
    approval.approved_by = user.id;
    approval.approved_at = now();
    if (status === 'EDITED' && editedPayload) approval.payload = editedPayload;

    if (status === 'REJECTED') {
      const result = { executed: false, status: 'REJECTED' };
      state.external_actions[`approval:${approvalId}`] = result;
      onMutate();
      return { status: 200, body: { approval, execution: result } };
    }

    const run = state.runs[approval.run_id];
    const event = run ? state.events[run.trigger_event_id] : null;
    const transport = approval.payload?.transport || event?.payload?.transport || null;
    if (!transport || transport.provider !== 'smartlead') {
      const result = { executed: false, status: 'TRANSPORT_CONTEXT_REQUIRED' };
      state.external_actions[`approval:${approvalId}`] = result;
      onMutate();
      return { status: 422, body: { approval, execution: result } };
    }

    const emailBody = draftContent(approval.payload);
    if (!emailBody) {
      const result = { executed: false, status: 'DRAFT_REQUIRED' };
      state.external_actions[`approval:${approvalId}`] = result;
      onMutate();
      return { status: 422, body: { approval, execution: result } };
    }

    try {
      const execution = await executeApprovedSmartleadReply({
        smartlead,
        approval,
        executionMode: approval.execution_mode || 'APPROVAL',
        campaignId: transport.campaign_id,
        leadId: transport.lead_id,
        emailBody,
        replyMessageId: transport.reply_message_id,
        replyEmailTime: transport.reply_email_time || now(),
        idempotencyKey: `approval:${approvalId}:smartlead-reply`,
        idempotencyStore
      });
      state.external_actions[`approval:${approvalId}`] = {
        ...execution,
        provider: 'smartlead',
        campaign_id: transport.campaign_id,
        lead_id: transport.lead_id,
        updated_at: now()
      };
      if (execution.executed || execution.replayed) approval.execution_status = 'SENT';
      else approval.execution_status = execution.status;
      onMutate();
      return { status: execution.executed || execution.replayed ? 200 : 422, body: { approval, execution } };
    } catch (error) {
      const execution = { executed: false, status: 'EXECUTION_ERROR', error: error.message };
      state.external_actions[`approval:${approvalId}`] = execution;
      approval.execution_status = 'ERROR';
      onMutate();
      return { status: 502, body: { approval, execution } };
    }
  };
}
