import { createHash } from 'node:crypto';

function stableOpportunityId(seedKey) {
  const digest = createHash('sha256').update(String(seedKey)).digest('hex').slice(0, 16);
  return `opp_a2_${digest}`;
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

export function createMemoryOpportunityStore(initial = []) {
  const byId = new Map();
  const bySeed = new Map();
  const externalRefs = new Map();

  function put(value) {
    if (!value?.id) throw new Error('opportunity.id required');
    byId.set(value.id, value);
    if (value.seed_key) bySeed.set(value.seed_key, value.id);
    return value;
  }

  for (const item of Array.isArray(initial) ? initial : Object.values(initial || {})) {
    if (item?.id) put({ ...item });
  }

  function upsertSeed(seed = {}) {
    if (!seed.seed_key) throw new Error('seed.seed_key required');
    const existingId = bySeed.get(seed.seed_key);
    const existing = existingId ? byId.get(existingId) : null;
    const id = existing?.id || seed.id || stableOpportunityId(seed.seed_key);
    const createdAt = existing?.created_at || seed.created_at || new Date().toISOString();
    const next = {
      ...(existing || {}),
      ...seed,
      id,
      stage: existing?.stage || seed.stage || 'CONTACTED',
      created_at: createdAt,
      updated_at: seed.updated_at || new Date().toISOString(),
      evidence_ids: unique([...(existing?.evidence_ids || []), ...(seed.evidence_ids || [])])
    };
    return put(next);
  }

  function upsertSeeds(seeds = []) {
    return (seeds || []).map(upsertSeed);
  }

  function get(opportunityId) {
    return byId.get(opportunityId) || null;
  }

  function list() {
    return [...byId.values()];
  }

  function bindExternalRef({ opportunityId, provider, kind = 'lead', externalId, metadata = {} } = {}) {
    if (!get(opportunityId)) throw new Error('Opportunity not found');
    if (!provider || !externalId) throw new Error('provider and externalId required');
    const key = `${provider}:${kind}:${externalId}`;
    const value = { opportunity_id: opportunityId, provider, kind, external_id: String(externalId), metadata };
    externalRefs.set(key, value);
    const opportunity = get(opportunityId);
    opportunity.external_refs = { ...(opportunity.external_refs || {}), [key]: value };
    opportunity.updated_at = new Date().toISOString();
    return value;
  }

  function resolveExternalRef({ provider, kind = 'lead', externalId } = {}) {
    if (!provider || externalId === undefined || externalId === null) return null;
    const ref = externalRefs.get(`${provider}:${kind}:${externalId}`);
    return ref ? get(ref.opportunity_id) : null;
  }

  function applyA6Envelope({ opportunityId, envelope, at = new Date().toISOString() } = {}) {
    const opportunity = get(opportunityId);
    if (!opportunity) throw new Error('Opportunity not found');
    if (!envelope?.domain_result) throw new Error('A6 envelope domain_result required');
    const result = envelope.domain_result;
    const changedBusinessFields = result.field_observations?.updates || result.changed_business_fields || [];
    const appliedFieldUpdates = {};
    const pendingStructuredExtraction = [];
    opportunity.fields ||= {};

    for (const change of changedBusinessFields) {
      if (!change?.field) continue;
      if (!Object.prototype.hasOwnProperty.call(change, 'after') || change.after === null || change.after === undefined) continue;
      opportunity.fields[change.field] = change.after;
      appliedFieldUpdates[change.field] = change.after;
    }

    opportunity.a6 = {
      run_status: envelope.run_status,
      buyer_reply: result.buyer_reply || null,
      next_action: result.next_action || null,
      execution_mode: result.next_action?.execution_mode || result.execution_mode || null,
      decision_state: result.decision_state || null,
      communication_brief: result.communication_brief || null,
      dependency_refresh: result.dependency_refresh || null,
      outcome: result.outcome || null,
      applied_field_updates: appliedFieldUpdates,
      pending_structured_extraction: unique(pendingStructuredExtraction),
      updated_at: at
    };
    opportunity.evidence_ids = unique([...(opportunity.evidence_ids || []), ...(envelope.evidence_refs || []), ...(result.evidence_refs || [])]);

    if (envelope.run_status === 'DONE') {
      if (result.stage_transition?.after || result.stage?.after) opportunity.stage = result.stage_transition?.after || result.stage.after;
      if (result.outcome?.type || result.outcome?.outcome) opportunity.status = result.outcome?.type || result.outcome.outcome;
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
    return opportunity;
  }

  return { upsertSeed, upsertSeeds, get, list, bindExternalRef, resolveExternalRef, applyA6Envelope };
}
