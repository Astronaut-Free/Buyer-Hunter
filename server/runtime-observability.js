const OBSERVABILITY_VERSION = '1.0.0';

function values(object) {
  return Object.values(object || {});
}

function countBy(rows, selector) {
  const result = {};
  for (const row of rows) {
    const key = selector(row) || 'UNKNOWN';
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function sortRecent(rows, field, limit = 20) {
  return [...rows]
    .sort((left, right) => String(right?.[field] || '').localeCompare(String(left?.[field] || '')))
    .slice(0, limit);
}

function hasCapability(run, capabilityId) {
  return Array.isArray(run.capabilities_called) && run.capabilities_called.includes(capabilityId);
}

function relevantOpportunityIdsFromMessages(messages) {
  return new Set(messages.filter(message => message.direction === 'INBOUND').map(message => message.opportunity_id).filter(Boolean));
}

function executionFailures(actions) {
  const failureStatuses = new Set([
    'EXECUTION_ERROR',
    'CAMPAIGN_TEMPLATE_INVALID',
    'SMARTLEAD_LEAD_ID_REQUIRED',
    'BLOCKED_BY_OUTPUT_GUARD',
    'TRANSPORT_CONTEXT_REQUIRED',
    'DRAFT_REQUIRED'
  ]);
  return actions.filter(action => failureStatuses.has(action.status));
}

export function createRuntimeObservability(state = {}, { now = () => new Date().toISOString() } = {}) {
  const opportunities = values(state.opportunities);
  const runs = values(state.runs);
  const approvals = values(state.approvals);
  const events = values(state.events);
  const messages = values(state.messages);
  const actions = values(state.external_actions);
  const traces = Array.isArray(state.traces) ? state.traces : [];
  const externalRefs = values(state.external_refs);

  const inboundOpportunityIds = relevantOpportunityIdsFromMessages(messages);
  const a2Runs = runs.filter(run => hasCapability(run, 'qianpulse.a2.proactive_buyer_development'));
  const a6Runs = runs.filter(run => hasCapability(run, 'qianpulse.a6.opportunity_progression'));
  const failedRuns = runs.filter(run => run.status === 'FAILED');
  const failedActions = executionFailures(actions);
  const pendingApprovals = approvals.filter(approval => approval.status === 'PENDING');
  const sentActions = actions.filter(action => action.status === 'SENT' || action.status === 'QUEUED_IN_SMARTLEAD');

  const capabilityCalls = {};
  for (const run of runs) {
    for (const capabilityId of Array.isArray(run.capabilities_called) ? run.capabilities_called : []) {
      capabilityCalls[capabilityId] = (capabilityCalls[capabilityId] || 0) + 1;
    }
  }

  const recentFailures = [
    ...failedRuns.map(run => ({
      type: 'RUN',
      id: run.run_id,
      status: run.status,
      code: run.error?.code || null,
      message: run.error?.message || null,
      timestamp: run.completed_at || run.started_at || null
    })),
    ...failedActions.map(action => ({
      type: 'EXTERNAL_ACTION',
      id: action.lead_id || action.provider || null,
      status: action.status,
      code: action.code || null,
      message: action.error || null,
      timestamp: action.updated_at || null
    }))
  ].sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || ''))).slice(0, 20);

  const smartleadRefs = externalRefs.filter(ref => ref.provider === 'smartlead' && ref.kind === 'lead');
  const smartleadWebhookEvents = events.filter(event => event.source === 'smartlead');

  return {
    observability_version: OBSERVABILITY_VERSION,
    generated_at: now(),
    totals: {
      opportunities: opportunities.length,
      runs: runs.length,
      events: events.length,
      messages: messages.length,
      approvals: approvals.length,
      pending_approvals: pendingApprovals.length,
      external_actions: actions.length,
      traces: traces.length
    },
    execution: {
      run_status: countBy(runs, run => run.status),
      capability_calls: capabilityCalls,
      approval_status: countBy(approvals, approval => approval.status),
      approval_types: countBy(approvals, approval => approval.action_type),
      external_action_status: countBy(actions, action => action.status),
      external_action_providers: countBy(actions, action => action.provider)
    },
    funnel: {
      opportunities_created: opportunities.length,
      a2_runs: a2Runs.length,
      ready_for_outreach: opportunities.filter(opportunity => opportunity.status === 'READY_FOR_OUTREACH_APPROVAL').length,
      outreach_queued: opportunities.filter(opportunity => opportunity.status === 'OUTREACH_QUEUED').length,
      smartlead_bound: smartleadRefs.length,
      buyer_replied: inboundOpportunityIds.size,
      a6_runs: a6Runs.length,
      reply_approvals: approvals.filter(approval => approval.action_type === 'BUYER_MESSAGE_DRAFT').length,
      external_actions_sent_or_queued: sentActions.length
    },
    safety: {
      waiting_evidence: runs.filter(run => run.status === 'WAITING_EVIDENCE').length,
      waiting_approval: runs.filter(run => run.status === 'WAITING_APPROVAL').length,
      blocked_runs: runs.filter(run => run.status === 'BLOCKED').length,
      failed_runs: failedRuns.length,
      failed_external_actions: failedActions.length,
      smartlead_webhook_events: smartleadWebhookEvents.length,
      duplicate_replays: actions.filter(action => action.replayed === true).length
    },
    integrations: {
      free_data_source: state.free_data_source || null,
      smartlead_bound_leads: smartleadRefs.length,
      smartlead_webhook_events: smartleadWebhookEvents.length
    },
    recent: {
      runs: sortRecent(runs, 'started_at', 10).map(run => ({
        run_id: run.run_id,
        opportunity_id: run.opportunity_id || null,
        status: run.status,
        capabilities_called: run.capabilities_called || [],
        started_at: run.started_at || null,
        completed_at: run.completed_at || null
      })),
      pending_approvals: sortRecent(pendingApprovals, 'created_at', 10).map(approval => ({
        approval_id: approval.approval_id,
        opportunity_id: approval.opportunity_id,
        action_type: approval.action_type,
        status: approval.status,
        created_at: approval.created_at || null
      })),
      failures: recentFailures
    }
  };
}

export { OBSERVABILITY_VERSION };
