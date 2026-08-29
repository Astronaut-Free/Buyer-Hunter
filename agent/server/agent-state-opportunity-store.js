import { createHash } from 'node:crypto';
import { capabilitySlot } from '../skill-runtime/capability-ids.js';

function stableOpportunityId(seedKey) {
  const digest = createHash('sha256').update(String(seedKey)).digest('hex').slice(0, 16);
  return `opp_a2_${digest}`;
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

export function createAgentStateOpportunityStore({
  getState,
  onMutate = () => {},
  now = () => new Date().toISOString()
} = {}) {
  if (typeof getState !== 'function') throw new Error('getState required');

  function state() {
    const value = getState();
    if (!value || typeof value !== 'object') throw new Error('Agent state unavailable');
    value.opportunities ||= {};
    value.opportunity_seed_index ||= {};
    value.external_refs ||= {};
    return value;
  }

  function touch() {
    onMutate();
  }

  function get(opportunityId) {
    return state().opportunities[opportunityId] || null;
  }

  function list() {
    return Object.values(state().opportunities);
  }

  function upsertSeed(seed = {}) {
    if (!seed.seed_key) throw new Error('seed.seed_key required');
    const currentState = state();
    const indexedId = currentState.opportunity_seed_index[seed.seed_key];
    const existing = indexedId ? currentState.opportunities[indexedId] : null;
    const id = existing?.id || seed.id || stableOpportunityId(seed.seed_key);
    const next = {
      ...(existing || {}),
      ...seed,
      id,
      seed_key: seed.seed_key,
      stage: existing?.stage || seed.stage || 'CONTACTED',
      created_at: existing?.created_at || seed.created_at || now(),
      updated_at: seed.updated_at || now(),
      evidence_ids: unique([...(existing?.evidence_ids || []), ...(seed.evidence_ids || [])])
    };
    currentState.opportunities[id] = next;
    currentState.opportunity_seed_index[seed.seed_key] = id;
    touch();
    return next;
  }

  function upsertSeeds(seeds = []) {
    return (seeds || []).map(upsertSeed);
  }

  function bindExternalRef({ opportunityId, provider, kind = 'lead', externalId, metadata = {} } = {}) {
    const currentState = state();
    const opportunity = currentState.opportunities[opportunityId];
    if (!opportunity) throw new Error('Opportunity not found');
    if (!provider || externalId === undefined || externalId === null || externalId === '') throw new Error('provider and externalId required');
    const key = `${provider}:${kind}:${externalId}`;
    const value = {
      opportunity_id: opportunityId,
      provider,
      kind,
      external_id: String(externalId),
      metadata,
      updated_at: now()
    };
    currentState.external_refs[key] = value;
    opportunity.external_refs = { ...(opportunity.external_refs || {}), [key]: value };
    opportunity.updated_at = now();
    touch();
    return value;
  }

  function resolveExternalRef({ provider, kind = 'lead', externalId } = {}) {
    if (!provider || externalId === undefined || externalId === null) return null;
    const currentState = state();
    const ref = currentState.external_refs[`${provider}:${kind}:${externalId}`];
    return ref ? currentState.opportunities[ref.opportunity_id] || null : null;
  }

  function applyA6Envelope({ opportunityId, envelope, at = now() } = {}) {
    const currentState = state();
    const opportunity = currentState.opportunities[opportunityId];
    if (!opportunity) throw new Error('Opportunity not found');
    if (!envelope?.domain_result) throw new Error('A6 envelope domain_result required');
    const result = envelope.domain_result;
    const changedBusinessFields = result.changed_business_fields || [];
    const appliedFieldUpdates = {};
    const pendingStructuredExtraction = [];
    opportunity.fields ||= {};

    for (const change of changedBusinessFields) {
      if (!change?.field) continue;
      if (change.needs_structured_extraction) {
        pendingStructuredExtraction.push(change.field);
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(change, 'after') || change.after === null || change.after === undefined) continue;
      opportunity.fields[change.field] = change.after;
      appliedFieldUpdates[change.field] = change.after;
    }

    opportunity.a6 = {
      run_status: envelope.run_status,
      buyer_reply: result.buyer_reply || null,
      next_action: result.next_action || null,
      execution_mode: result.execution_mode || null,
      dependency_refresh: result.dependency_refresh || null,
      outcome: result.outcome || null,
      applied_field_updates: appliedFieldUpdates,
      pending_structured_extraction: unique(pendingStructuredExtraction),
      updated_at: at
    };
    opportunity.evidence_ids = unique([
      ...(opportunity.evidence_ids || []),
      ...(envelope.evidence_refs || []),
      ...(result.evidence_refs || [])
    ]);

    if (envelope.run_status === 'DONE') {
      if (result.stage?.after) opportunity.stage = result.stage.after;
      if (result.outcome?.outcome) opportunity.status = result.outcome.outcome;
      else if (result.next_action?.action === 'HUMAN_TAKEOVER') opportunity.status = 'HUMAN_TAKEOVER';
      else opportunity.status = 'ACTIVE';
    } else if (envelope.run_status === 'MORE_EVIDENCE') {
      opportunity.status = 'WAITING_EVIDENCE';
    } else if (envelope.run_status === 'BLOCKED') {
      opportunity.status = 'BLOCKED';
    } else if (envelope.run_status === 'ERROR') {
      opportunity.status = 'ERROR';
    }

    opportunity.updated_at = at;
    touch();
    return opportunity;
  }

  function applyCapabilityEnvelope({ opportunityId, envelope, at = now() } = {}) {
    const currentState = state();
    const opportunity = currentState.opportunities[opportunityId];
    if (!opportunity) throw new Error('Opportunity not found');
    if (!envelope?.capability_id || !envelope?.domain_result) throw new Error('Capability envelope required');
    const slot = capabilitySlot(envelope.capability_id);
    if (!slot) throw new Error('Only A3/A4/A5 refresh envelopes are supported');
    opportunity[slot] = {
      run_status: envelope.run_status,
      capability_version: envelope.capability_version,
      result: envelope.domain_result,
      missing_evidence: envelope.missing_evidence || [],
      evidence_refs: envelope.evidence_refs || [],
      updated_at: at
    };
    opportunity.evidence_ids = unique([...(opportunity.evidence_ids || []), ...(envelope.evidence_refs || [])]);
    opportunity.updated_at = at;
    touch();
    return opportunity;
  }

  return {
    upsertSeed,
    upsertSeeds,
    get,
    list,
    bindExternalRef,
    resolveExternalRef,
    applyCapabilityEnvelope,
    applyA6Envelope
  };
}
