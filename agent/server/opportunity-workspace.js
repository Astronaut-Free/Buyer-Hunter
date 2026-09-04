const WORKSPACE_VERSION = '1.1.0';
import { A2_CAPABILITY_ID, A6_CAPABILITY_ID } from '../skill-runtime/capability-ids.js';

function array(value) {
  return Array.isArray(value) ? value : [];
}

function sortDesc(rows, field) {
  return [...rows].sort((left, right) => String(right?.[field] || '').localeCompare(String(left?.[field] || '')));
}

function compact(value) {
  if (Array.isArray(value)) return value.map(compact).filter(item => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, compact(item)])
  );
}

function relevantRuns(state, opportunityId) {
  return sortDesc(
    Object.values(state.runs || {}).filter(run =>
      run.opportunity_id === opportunityId || array(run.generated_opportunity_ids).includes(opportunityId)
    ),
    'started_at'
  );
}

function relevantApprovals(state, opportunityId) {
  return sortDesc(
    Object.values(state.approvals || {}).filter(approval => approval.opportunity_id === opportunityId),
    'created_at'
  );
}

function relevantMessages(state, opportunityId) {
  return sortDesc(
    Object.values(state.messages || {}).filter(message => message.opportunity_id === opportunityId),
    'timestamp'
  );
}

function relevantExternalRefs(state, opportunityId) {
  return Object.values(state.external_refs || {}).filter(ref => ref.opportunity_id === opportunityId);
}

function externalActionsForApprovals(state, approvals) {
  const ids = new Set(approvals.map(item => item.approval_id));
  return Object.entries(state.external_actions || {})
    .filter(([key]) => [...ids].some(id => key.includes(id)))
    .map(([key, value]) => ({ key, ...value }));
}

function latestA2Run(runs) {
  return runs.find(run => array(run.capabilities_called).includes(A2_CAPABILITY_ID)) || null;
}

function latestA6Run(runs) {
  return runs.find(run => array(run.capabilities_called).includes(A6_CAPABILITY_ID)) || null;
}

function pendingApproval(approvals) {
  return approvals.find(item => item.status === 'PENDING') || null;
}

function missingEvidenceForRun(state, runId) {
  if (!runId) return [];
  const missing = Object.values(state.steps || {})
    .filter(step => step.run_id === runId)
    .flatMap(step => array(step.result?.missing_evidence));
  return [...new Set(missing.filter(Boolean))];
}

function dependencyBlockers(opportunity) {
  const refresh = opportunity.a6?.dependency_refresh || {};
  const required = array(refresh.required);
  const refreshed = new Set(array(refresh.refreshed || refresh.completed));
  return required.filter(item => !refreshed.has(item));
}

function deriveBlockers({ state, opportunity, runs, approvals }) {
  const blockers = [];
  const pending = pendingApproval(approvals);
  if (pending) {
    blockers.push({
      type: 'HUMAN_APPROVAL',
      code: pending.action_type,
      approval_id: pending.approval_id,
      description: pending.risk_summary || '等待人工审批'
    });
  }

  const latestRun = runs[0] || null;
  if (latestRun?.status === 'WAITING_EVIDENCE' || opportunity.status === 'WAITING_EVIDENCE') {
    blockers.push({
      type: 'MISSING_EVIDENCE',
      code: 'WAITING_EVIDENCE',
      required: missingEvidenceForRun(state, latestRun?.run_id)
    });
  }

  const dependencies = dependencyBlockers(opportunity);
  if (dependencies.length) {
    blockers.push({
      type: 'DEPENDENCY_REFRESH',
      code: 'DEPENDENCIES_STALE',
      required: dependencies
    });
  }
  return blockers;
}

function deriveNextAction(opportunity, approvals) {
  const pending = pendingApproval(approvals);
  if (pending) {
    return {
      action: 'REVIEW_APPROVAL',
      approval_id: pending.approval_id,
      action_type: pending.action_type
    };
  }
  if (opportunity.a6?.next_action) return opportunity.a6.next_action;
  if (opportunity.status === 'READY_FOR_OUTREACH_APPROVAL') return { action: 'PREPARE_FIRST_OUTREACH_APPROVAL' };
  if (opportunity.status === 'OUTREACH_QUEUED') return { action: 'WAIT_FOR_BUYER_REPLY' };
  if (opportunity.status === 'WAITING_EVIDENCE') return { action: 'RESOLVE_MISSING_EVIDENCE' };
  return null;
}

function projectApproval(approval, role) {
  const base = {
    approval_id: approval.approval_id,
    action_type: approval.action_type,
    status: approval.status,
    execution_status: approval.execution_status || null,
    risk_summary: approval.risk_summary || null,
    created_at: approval.created_at || null,
    approved_at: approval.approved_at || null
  };
  if (role === 'INTERNAL') return { ...base, requested_by: approval.requested_by || null, approved_by: approval.approved_by || null, payload: approval.payload || null };
  return base;
}

function projectRun(run, role) {
  const base = {
    run_id: run.run_id,
    status: run.status,
    capabilities_called: array(run.capabilities_called),
    started_at: run.started_at || null,
    completed_at: run.completed_at || null,
    state_after: run.state_after || null,
    decision_after: run.decision_after || null
  };
  if (role === 'INTERNAL') return { ...base, trigger_event_id: run.trigger_event_id || null, error: run.error || null };
  return base;
}

function projectMessages(messages, role) {
  return messages.slice(0, 20).map(message => ({
    event_id: message.event_id,
    thread_id: message.thread_id || null,
    direction: message.direction || null,
    channel: message.channel || null,
    timestamp: message.timestamp || null,
    source: message.source || null,
    ...(role === 'BUYER' ? {} : { content: message.content || '' })
  }));
}

function projectExternalRefs(refs, role) {
  if (role === 'BUYER') return refs.map(ref => ({ provider: ref.provider, kind: ref.kind, bound: true }));
  return refs.map(ref => ({
    provider: ref.provider,
    kind: ref.kind,
    external_id: ref.external_id,
    metadata: ref.metadata || {},
    updated_at: ref.updated_at || null
  }));
}

function projectFields(fields, role) {
  const source = fields && typeof fields === 'object' ? fields : {};
  if (role === 'BUYER') {
    return {
      product: source.product || null,
      quantity: source.quantity || null,
      certification: source.certification || null
    };
  }
  return source;
}

function normalizeWhyNow(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

function intelligenceProjection(opportunity, role) {
  if (role === 'BUYER') return {};
  return {
    why_now: normalizeWhyNow(opportunity.why_now),
    gaps: array(opportunity.gaps),
    component_scores: opportunity.component_scores || null,
    supply_match: opportunity.supply_match || null,
    supplier_intelligence: opportunity.supplier_intelligence || null,
    market_access: opportunity.market_access || opportunity.a5?.market_access || opportunity.a6?.market_access || null
  };
}

export function createOpportunityWorkspace({ state, opportunityId, role = 'SELLER' } = {}) {
  if (!state || typeof state !== 'object') throw new Error('state required');
  const opportunity = state.opportunities?.[opportunityId];
  if (!opportunity) return null;

  const runs = relevantRuns(state, opportunityId);
  const approvals = relevantApprovals(state, opportunityId);
  const messages = relevantMessages(state, opportunityId);
  const refs = relevantExternalRefs(state, opportunityId);
  const actions = externalActionsForApprovals(state, approvals);
  const latestA2 = latestA2Run(runs);
  const latestA6 = latestA6Run(runs);
  const intelligence = intelligenceProjection(opportunity, role);

  const workspace = {
    workspace_version: WORKSPACE_VERSION,
    opportunity: {
      id: opportunity.id,
      source: opportunity.source || null,
      origin: opportunity.origin || null,
      decision: opportunity.decision || null,
      status: opportunity.status || null,
      stage: opportunity.stage || null,
      buyer: opportunity.buyer || null,
      seller: role === 'BUYER' ? undefined : opportunity.seller || null,
      product: opportunity.product || opportunity.fields?.product || null,
      fields: projectFields(opportunity.fields, role),
      priority: role === 'BUYER' ? undefined : opportunity.priority || null,
      updated_at: opportunity.updated_at || null
    },
    score: {
      opportunity: role === 'BUYER' ? undefined : opportunity.opportunity_score ?? null,
      truth: role === 'BUYER' ? undefined : opportunity.truth_score ?? null,
      timing: role === 'BUYER' ? undefined : opportunity.component_scores?.timing ?? opportunity.timing_score ?? null,
      market_access: role === 'BUYER' ? undefined : opportunity.component_scores?.market_access ?? opportunity.market_access_score ?? null,
      rank: opportunity.a2?.rank_score ?? null,
      fit: opportunity.fit_score ?? opportunity.a2?.buyer_fit?.score ?? null,
      intent: opportunity.intent_score ?? opportunity.a6?.buyer_reply?.intent?.score ?? null,
      conversation: opportunity.conversation_score ?? null
    },
    ...intelligence,
    a2: role === 'BUYER' ? undefined : {
      status: latestA2?.status || (opportunity.a2 ? 'COMPLETED' : null),
      outreach_status: opportunity.status === 'READY_FOR_OUTREACH_APPROVAL'
        ? 'WAITING_APPROVAL'
        : opportunity.status === 'OUTREACH_QUEUED'
          ? 'QUEUED'
          : null,
      buyer_fit: opportunity.a2?.buyer_fit || null,
      outreach: role === 'INTERNAL' ? opportunity.a2?.outreach || null : undefined,
      latest_run_id: latestA2?.run_id || null
    },
    a6: {
      status: latestA6?.status || opportunity.a6?.run_status || null,
      buyer_intent: opportunity.a6?.buyer_reply?.intent || null,
      next_action: opportunity.a6?.next_action || null,
      dependency_refresh: opportunity.a6?.dependency_refresh || null,
      outcome: opportunity.a6?.outcome || null,
      latest_run_id: latestA6?.run_id || null
    },
    next_action: deriveNextAction(opportunity, approvals),
    blockers: deriveBlockers({ state, opportunity, runs, approvals }),
    approvals: approvals.map(item => projectApproval(item, role)),
    activity: {
      runs: runs.slice(0, 20).map(item => projectRun(item, role)),
      messages: projectMessages(messages, role),
      external_actions: role === 'INTERNAL' ? actions : actions.map(action => ({ status: action.status || null, provider: action.provider || null, updated_at: action.updated_at || null }))
    },
    integration: {
      external_refs: projectExternalRefs(refs, role),
      smartlead_bound: refs.some(ref => ref.provider === 'smartlead' && ref.kind === 'lead')
    },
    evidence: {
      count: array(opportunity.evidence_ids).length,
      refs: role === 'BUYER' ? undefined : array(opportunity.evidence_ids)
    },
    outcome: opportunity.a6?.outcome || opportunity.outcome || null
  };

  return compact(workspace);
}

export { WORKSPACE_VERSION };
