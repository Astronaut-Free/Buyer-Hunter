import { createHmac, randomBytes } from 'node:crypto';
import { createQianPulseSkillOrchestrator } from '../qianpulse-skill-orchestrator.js';
import { composeReply } from '../services/reply-composer.js';
import { A6_CAPABILITY_ID } from '../skill-runtime/capability-ids.js';
import { createAgentStateOpportunityStore } from './agent-state-opportunity-store.js';
import { createA2OutreachApprovals } from './a2-outreach-approval.js';
import { applyA2EmailEvent, decideA2Followup } from '../skill-runtime/a2-state-machine.js';

const A2_EVENT_TYPES = new Set(['SELLER_PROACTIVE_DEVELOPMENT', 'SYSTEM_NEW_PROSPECT_SIGNAL', 'PRE_REPLY_FOLLOWUP_DUE']);

function defaultId(prefix) {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

function defaultHash(value) {
  return createHmac('sha256', 'qianpulse-integrity').update(JSON.stringify(value)).digest('hex');
}

function agentStatus(runStatus) {
  if (runStatus === 'MORE_EVIDENCE') return 'WAITING_EVIDENCE';
  if (runStatus === 'BLOCKED') return 'BLOCKED';
  if (runStatus === 'ERROR') return 'FAILED';
  return 'COMPLETED';
}

function ensureState(state) {
  state.events ||= {};
  state.runs ||= {};
  state.steps ||= {};
  state.checkpoints ||= {};
  state.approvals ||= {};
  state.idempotency ||= {};
  state.messages ||= {};
  state.threads ||= {};
  state.traces ||= [];
  return state;
}

function getOrCreateBuyerThread(state, opportunityId, id, now) {
  const existing = Object.values(state.threads).find(thread => thread.opportunity_id === opportunityId && thread.party === 'BUYER');
  if (existing) return existing;
  const thread = {
    thread_id: id('thread'),
    opportunity_id: opportunityId,
    party: 'BUYER',
    channel: 'email',
    status: 'IDLE',
    created_at: now(),
    last_message_at: null
  };
  state.threads[thread.thread_id] = thread;
  return thread;
}

function sellerFromAuthenticatedUser(user, inputSeller = {}) {
  return {
    ...inputSeller,
    seller_id: user.id,
    id: user.id,
    company_id: inputSeller.company_id || user.profile?.company_id || user.profile?.company_name || null,
    company_name: inputSeller.company_name || user.profile?.company_name || null
  };
}

export function createLiveA2A6Runtime({
  getState,
  onMutate = () => {},
  providers = {},
  authorizeOpportunity = () => true,
  now = () => new Date().toISOString(),
  id = defaultId,
  hash = defaultHash,
  agentVersion = 'qianpulse-agent-0.2.0',
  dependencyRunners = undefined
} = {}) {
  if (typeof getState !== 'function') throw new Error('getState required');

  const opportunityStore = createAgentStateOpportunityStore({ getState, onMutate, now });
  // dependencyRunners is optional: when omitted the orchestrator falls back to the
  // bundled Node A3/A4/A5 refresh runners (unchanged behaviour). server/index.js
  // injects Python-delegating runners when Free's capability CLI is available.
  const orchestrator = createQianPulseSkillOrchestrator({
    providers, opportunityStore, clock: now,
    ...(dependencyRunners ? { dependencyRunners } : {})
  });

  function currentState() {
    return ensureState(getState());
  }

  function replay(idempotencyKey) {
    const cached = currentState().idempotency[idempotencyKey];
    return cached ? { status: 200, body: cached, replayed: true } : null;
  }

  function requireIdempotency(payload = {}) {
    const key = String(payload.idempotency_key || '').trim();
    return key || null;
  }

  async function runProactive(payload = {}, user) {
    const idem = requireIdempotency(payload);
    if (!idem) return { status: 400, body: { code: 'IDEMPOTENCY_KEY_REQUIRED', error: '必须提供 idempotency_key' } };
    const cached = replay(idem);
    if (cached) return cached;
    if (!user || !['SELLER', 'INTERNAL'].includes(user.role)) return { status: 403, body: { code: 'SELLER_REQUIRED', error: '只有卖家或内部角色可以发起主动拓展' } };
    if (payload.event_type === 'PRE_REPLY_FOLLOWUP_DUE') {
      const followupResult = runPreReplyFollowup(payload, user);
      if (followupResult.status < 400) {
        currentState().idempotency[idem] = followupResult.body;
        onMutate();
      }
      return followupResult;
    }

    const state = currentState();
    const eventType = A2_EVENT_TYPES.has(payload.event_type) ? payload.event_type : 'SELLER_PROACTIVE_DEVELOPMENT';
    const event = {
      event_id: id('evt'),
      event_type: eventType,
      actor_role: user.role,
      actor_id: user.id,
      opportunity_id: null,
      payload,
      source: payload.source || 'api',
      timestamp: now(),
      idempotency_key: idem,
      created_at: now()
    };
    state.events[event.event_id] = event;

    const run = {
      run_id: id('run'),
      opportunity_id: null,
      trigger_event_id: event.event_id,
      status: 'RUNNING',
      started_at: now(),
      completed_at: null,
      state_before: null,
      state_after: null,
      capabilities_called: ['qianpulse.a2.proactive_buyer_development'],
      decision_before: null,
      decision_after: null,
      agent_version: agentVersion
    };
    state.runs[run.run_id] = run;

    try {
      const rawInput = payload.input || payload;
      const campaignId = payload.campaign_id || rawInput.execution?.campaign_id || null;
      const input = {
        ...rawInput,
        execution: { ...(rawInput.execution || {}), campaign_id: campaignId }
      };
      const seller = sellerFromAuthenticatedUser(user, input.seller || payload.seller || {});
      const result = await orchestrator.runProactiveDevelopment({
        input: { ...input, seller },
        seller,
        product: payload.product,
        maxReady: payload.max_ready,
        maxContactedCompanies: payload.max_contacted_companies
      });

      run.status = agentStatus(result.run_status);
      run.generated_opportunity_ids = result.opportunities.map(item => item.id);
      run.state_after = { generated_opportunities: result.opportunities.length };
      run.completed_at = now();

      const step = {
        step_id: id('step'),
        run_id: run.run_id,
        sequence: 1,
        step_type: 'CAPABILITY',
        capability_id: 'qianpulse.a2.proactive_buyer_development',
        capability_version: '1.0.0',
        input_hash: hash({ event_id: event.event_id, seller_id: user.id, input }),
        output_hash: hash(result.envelope),
        status: result.run_status,
        started_at: run.started_at,
        completed_at: run.completed_at,
        evidence_refs: result.envelope?.evidence_refs || [],
        result: result.envelope
      };
      state.steps[step.step_id] = step;

      const approvals = campaignId ? createA2OutreachApprovals({
        state,
        run,
        opportunities: result.opportunities,
        envelope: result.envelope,
        campaignId,
        id,
        now,
        requestedBy: user.id
      }) : [];

      const checkpoint = {
        checkpoint_id: id('cp'),
        run_id: run.run_id,
        opportunity_id: null,
        step: 1,
        state: run.status,
        input_hash: step.input_hash,
        output_hash: step.output_hash,
        created_at: now()
      };
      state.checkpoints[checkpoint.checkpoint_id] = checkpoint;

      const response = {
        run,
        event,
        generated_opportunity_ids: run.generated_opportunity_ids,
        opportunities: result.opportunities,
        batch_result: result.batch_result,
        envelope: result.envelope,
        outreach_approvals: approvals,
        outreach_approval_required: approvals.some(item => item.status === 'PENDING'),
        checkpoint_id: checkpoint.checkpoint_id
      };
      state.idempotency[idem] = response;
      onMutate();
      return { status: 201, body: response };
    } catch (error) {
      run.status = 'FAILED';
      run.completed_at = now();
      run.error = { code: error.code || 'A2_RUNTIME_ERROR', message: error.message };
      onMutate();
      return { status: 502, body: { code: run.error.code, error: run.error.message, run } };
    }
  }

  function runBuyerMessage(payload = {}, user) {
    const idem = requireIdempotency(payload);
    if (!idem) return { status: 400, body: { code: 'IDEMPOTENCY_KEY_REQUIRED', error: '必须提供 idempotency_key' } };
    const cached = replay(idem);
    if (cached) return cached;

    const state = currentState();
    const opportunity = opportunityStore.get(payload.opportunity_id);
    if (!opportunity) return { status: 422, body: { code: 'NEEDS_CONTEXT', error: '无法可靠绑定 Opportunity' } };
    if (!authorizeOpportunity(user, opportunity, 'create_message')) return { status: 403, body: { code: 'FORBIDDEN', error: '无权访问这笔 Opportunity' } };

    const thread = payload.thread_id ? state.threads[payload.thread_id] : getOrCreateBuyerThread(state, opportunity.id, id, now);
    if (!thread || thread.opportunity_id !== opportunity.id) return { status: 422, body: { code: 'THREAD_MISMATCH', error: 'Thread 与 Opportunity 不匹配' } };

    const messageContent = payload.message || payload.content || '';
    const evidenceRef = payload.evidence_ref || `conversation:${opportunity.id}:${payload.source_message_id || idem}`;
    const event = {
      event_id: id('evt'),
      event_type: 'BUYER_MESSAGE',
      actor_role: user?.role || 'BUYER',
      actor_id: user?.id || null,
      opportunity_id: opportunity.id,
      thread_id: thread.thread_id,
      payload: {
        ...payload,
        message: typeof messageContent === 'string'
          ? { content: messageContent, evidence_ref: evidenceRef, source_message_id: payload.source_message_id || null }
          : { ...messageContent, evidence_ref: messageContent.evidence_ref || evidenceRef }
      },
      source: payload.source || 'api',
      timestamp: payload.timestamp || now(),
      evidence_ref: evidenceRef,
      idempotency_key: idem,
      created_at: now()
    };
    state.events[event.event_id] = event;

    const run = {
      run_id: id('run'),
      opportunity_id: opportunity.id,
      trigger_event_id: event.event_id,
      status: 'RUNNING',
      started_at: now(),
      completed_at: null,
      state_before: { status: opportunity.status, stage: opportunity.stage || 'CONTACTED' },
      state_after: null,
      capabilities_called: [A6_CAPABILITY_ID],
      decision_before: opportunity.a6?.next_action || null,
      decision_after: null,
      agent_version: agentVersion
    };
    state.runs[run.run_id] = run;

    try {
      const progression = orchestrator.runBuyerProgression({
        opportunityId: opportunity.id,
        event,
        sellerContext: payload.seller_context || {},
        sellerExecutionPolicy: payload.seller_execution_policy || opportunity.seller_execution_policy || {},
        dependencyResults: payload.dependency_results || {}
      });
      const envelope = progression.envelope;
      const capabilityTrace = progression.trace || [];
      progression.opportunity.a2 ||= {};
      progression.opportunity.a2.lifecycle_status = 'HANDED_OFF_A6';
      progression.opportunity.a2.outreach_state = 'REPLIED';
      progression.opportunity.a2.followup = { ...(progression.opportunity.a2.followup || {}), next_eligible_at: null };
      run.capabilities_called = capabilityTrace.map(item => item.capability_id).filter(Boolean);
      run.status = agentStatus(progression.run_status);
      run.state_after = { status: progression.opportunity.status, stage: progression.opportunity.stage || 'CONTACTED' };
      run.decision_after = envelope?.domain_result?.next_action || null;
      run.completed_at = now();

      thread.last_message_at = event.timestamp;
      thread.status = progression.run_status === 'MORE_EVIDENCE' ? 'NEEDS_ANALYSIS' : 'REPLIED';
      state.messages[event.event_id] = {
        ...event,
        direction: 'INBOUND',
        content: typeof messageContent === 'string' ? messageContent : messageContent.content || ''
      };

      const runSteps = capabilityTrace.map((entry, index) => {
        const result = entry.result;
        const capabilityStep = {
          step_id: id('step'),
          run_id: run.run_id,
          sequence: index + 1,
          step_type: 'CAPABILITY',
          phase: entry.phase,
          capability_id: entry.capability_id,
          capability_version: entry.capability_version || result?.capability_version || '1.0.0',
          input_hash: entry.input_hash || result?.input_hash || hash({ opportunity_id: opportunity.id, event_id: event.event_id, capability_id: entry.capability_id, phase: entry.phase }),
          output_hash: hash(result),
          status: result?.run_status || 'ERROR',
          started_at: run.started_at,
          completed_at: run.completed_at,
          evidence_refs: result?.evidence_refs || [],
          result
        };
        state.steps[capabilityStep.step_id] = capabilityStep;
        state.traces.push({
          trace_id: id('trace'), run_id: run.run_id, step_id: capabilityStep.step_id,
          sequence: capabilityStep.sequence, capability_id: capabilityStep.capability_id,
          phase: capabilityStep.phase, status: capabilityStep.status, created_at: now()
        });
        return capabilityStep;
      });
      const step = runSteps.at(-1);

      let approval = null;
      const communicationBrief = envelope?.domain_result?.communication_brief;
      const draft = composeReply({ communicationBrief });
      if (draft && envelope?.human_review_required && progression.run_status === 'DONE') {
        approval = {
          approval_id: id('approval'),
          opportunity_id: opportunity.id,
          run_id: run.run_id,
          action_type: 'BUYER_MESSAGE_DRAFT',
          payload: { draft, communication_brief: communicationBrief, transport: payload.transport || null },
          execution_mode: envelope.domain_result?.next_action?.execution_mode || 'APPROVAL',
          risk_summary: envelope.domain_result?.next_action?.reason || '对外发送前需要人工确认',
          status: 'PENDING',
          requested_by: user?.id || 'SYSTEM',
          approved_by: null,
          created_at: now(),
          approved_at: null
        };
        state.approvals[approval.approval_id] = approval;
        run.status = 'WAITING_APPROVAL';
      }

      const checkpoint = {
        checkpoint_id: id('cp'),
        run_id: run.run_id,
        opportunity_id: opportunity.id,
        step: step.sequence,
        state: run.status,
        input_hash: step.input_hash,
        output_hash: step.output_hash,
        created_at: now()
      };
      state.checkpoints[checkpoint.checkpoint_id] = checkpoint;

      const response = {
        run,
        event,
        opportunity: progression.opportunity,
        envelope,
        dependency_refresh: progression.dependency_refresh || null,
        structured_field_extraction: progression.structured_field_extraction || null,
        approval,
        checkpoint_id: checkpoint.checkpoint_id
      };
      state.idempotency[idem] = response;
      onMutate();
      return { status: 201, body: response };
    } catch (error) {
      run.status = 'FAILED';
      run.completed_at = now();
      run.error = { code: error.code || 'A6_RUNTIME_ERROR', message: error.message };
      onMutate();
      return { status: 500, body: { code: run.error.code, error: run.error.message, run } };
    }
  }

  function handleA2EmailEvent({ opportunityId, event, idempotencyKey } = {}) {
    const state = currentState();
    if (idempotencyKey && state.idempotency[idempotencyKey]) return { status: 200, body: state.idempotency[idempotencyKey], replayed: true };
    const opportunity = opportunityStore.get(opportunityId);
    if (!opportunity) return { status: 422, body: { code: 'OPPORTUNITY_REQUIRED' } };
    const applied = applyA2EmailEvent(opportunity, event, event.timestamp || now());
    if (!applied.applied) return { status: 200, body: { status: 'IGNORED' } };
    state.email_events ||= {};
    state.suppressions ||= {};
    const eventId = event.provider_event_id || idempotencyKey || id('email-event');
    state.email_events[eventId] = { ...event, opportunity_id: opportunityId, applied_at: now() };
    if (applied.suppression_reason) {
      const email = opportunity.contact?.work_email || opportunity.outreach?.email || '';
      const key = `${opportunity.seller?.id || ''}:${opportunity.buyer?.id || ''}:${email}:email`;
      state.suppressions[key] = { key, reason: applied.suppression_reason, permanent: true, created_at: now() };
    }
    const body = { status: 'PROCESSED', opportunity_id: opportunityId, lifecycle_status: opportunity.a2?.lifecycle_status, outreach_state: opportunity.a2?.outreach_state, suppression_reason: applied.suppression_reason };
    if (idempotencyKey) state.idempotency[idempotencyKey] = body;
    onMutate();
    return { status: 202, body };
  }

  function runPreReplyFollowup(payload = {}, user) {
    const opportunity = opportunityStore.get(payload.opportunity_id);
    if (!opportunity) return { status: 422, body: { code: 'OPPORTUNITY_REQUIRED' } };
    if (!authorizeOpportunity(user, opportunity, 'followup')) return { status: 403, body: { code: 'FORBIDDEN' } };
    const state = opportunity.a2?.followup || {};
    const decision = decideA2Followup({
      hasReply: opportunity.a2?.lifecycle_status === 'HANDED_OFF_A6' || opportunity.a2?.outreach_state === 'REPLIED',
      deliveryState: opportunity.a2?.outreach_state || state.last_delivery_state,
      suppression: { active: ['STOPPED'].includes(opportunity.a2?.lifecycle_status) },
      sendCount: state.send_count || 0, maxSendCount: state.max_send_count || 3,
      timeAllowed: payload.time_allowed === true, newSignal: payload.new_signal === true, buyerFitChanged: payload.buyer_fit_changed === true
    });
    if (decision.status === 'FOLLOW_UP') {
      opportunity.a2.followup = { ...state, outreach_round: Number(state.outreach_round || 1) + 1 };
      opportunity.a2.lifecycle_status = 'FOLLOWUP_DUE';
      opportunity.status = 'READY_FOR_OUTREACH_APPROVAL';
    } else if (decision.status === 'HANDOFF_A6') opportunity.a2.lifecycle_status = 'HANDED_OFF_A6';
    else if (decision.status === 'STOP') opportunity.a2.lifecycle_status = 'STOPPED';
    else if (decision.status === 'REFRESH_RESEARCH') opportunity.a2.lifecycle_status = 'RESEARCHING';
    onMutate();
    return { status: 200, body: { opportunity, decision } };
  }

  return {
    opportunityStore,
    orchestrator,
    isA2EventType: eventType => A2_EVENT_TYPES.has(eventType),
    runProactive,
    runBuyerMessage,
    runPreReplyFollowup,
    handleA2EmailEvent
  };
}
