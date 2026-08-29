import { createHash } from 'node:crypto';
import { A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID, capabilitySlot } from '../skill-runtime/capability-ids.js';
import { createPythonDependencyRunners } from '../skill-runtime/python-capability-runners.mjs';

// A3/A4/A5 domain semantics are authoritative in Python. The server injects
// this same adapter after its availability probe; direct callers get the
// adapter too, while an explicitly empty runner map still fails closed.
export const DEFAULT_SKILL_RUNNERS = Object.freeze(createPythonDependencyRunners());

const ORDER = new Map([[A3_CAPABILITY_ID, 0], [A4_CAPABILITY_ID, 1], [A5_CAPABILITY_ID, 2]]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

export function hashSkillInput(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function eventFieldUpdates(event = {}) {
  return event?.payload?.field_updates || event?.field_updates || {};
}

function normalizedMessage(event = {}) {
  const raw = event?.payload?.message || event?.payload?.content || event?.content || '';
  if (typeof raw === 'string') return { content: raw, evidence_ref: event?.evidence_ref || null, evidence_refs: event?.evidence_refs || [] };
  return {
    ...(raw || {}),
    content: raw?.content || '',
    evidence_ref: raw?.evidence_ref || event?.evidence_ref || null,
    evidence_refs: raw?.evidence_refs || event?.evidence_refs || []
  };
}

export function buildAffectedSkillInput({ capabilityId, opportunity, event, sellerContext = {}, fieldObservations = {} } = {}) {
  const message = normalizedMessage(event);
  const explicitUpdates = eventFieldUpdates(event);
  const observedUpdates = Object.fromEntries((fieldObservations.updates || []).map(item => [item.field, item.after]));
  const fieldUpdates = { ...observedUpdates, ...explicitUpdates };
  const changedFields = [...new Set([
    ...(fieldObservations.updates || []),
    ...(fieldObservations.mentions || []),
    ...Object.keys(explicitUpdates).map(field => ({ field }))
  ].map(item => typeof item === 'string' ? item : item?.field).filter(Boolean))];
  const fields = { ...(opportunity?.fields || {}), ...fieldUpdates };
  const seller = sellerContext || {};
  const mandatoryCertifications = fields.mandatory_certifications
    || (fields.certification ? [fields.certification] : []);
  const category = fields.category_code || fields.product || opportunity?.product?.category_code
    || opportunity?.product?.name || seller.category_code || seller.product || null;
  return {
    capability_id: capabilityId,
    opportunity_id: opportunity?.id,
    evaluated_at: event?.timestamp || event?.payload?.evaluated_at || new Date().toISOString(),
    published_at: fields.published_at || null,
    deadline_at: fields.deadline_at || fields.delivery_date || null,
    observed_at: fields.observed_at || null,
    last_updated_at: fields.last_updated_at || null,
    latest_buyer_message: message,
    field_updates: fieldUpdates,
    changed_fields: changedFields,
    opportunity_state: {
      status: opportunity?.status || 'ACTIVE',
      stage: opportunity?.stage || 'CONTACTED',
      fields
    },
    seller_context: seller,
    demand: {
      product: fields.product || category,
      category_code: category,
      demand_title: fields.demand_title,
      specification: fields.specification,
      grade: fields.grade,
      quantity: fields.quantity,
      quantity_raw: fields.quantity_raw || fields.quantity,
      quantity_unit: fields.quantity_unit,
      mandatory_certifications: mandatoryCertifications,
      destination_market: fields.destination_market || fields.destination,
      delivery_deadline: fields.delivery_date || fields.deadline_at,
      packaging: fields.packaging,
      oem: fields.oem_required,
      sample: fields.sample_required,
      target_price: fields.target_price
    },
    buyer_country: opportunity?.buyer?.market || fields.buyer_country || null,
    destination_market: fields.destination_market || fields.destination || null,
    product: {
      category_code: category,
      mandatory_certifications: mandatoryCertifications
    },
    seller_catalog: seller.seller_catalog || seller.catalog || null,
    seller_sku: seller.seller_sku || {},
    seller_policy: seller.seller_policy || seller,
    regulatory_evidence: seller.regulatory_evidence || [],
    payment_terms: fields.payment_terms || null,
    delivery_terms: fields.delivery_terms || null,
    evidence_refs: event?.evidence_refs || []
  };
}

export function isSkillResultFresh(result, inputHash) {
  return Boolean(result && inputHash && result.input_hash === inputHash && result.run_status !== 'ERROR');
}

function runtimeError(capabilityId, inputHash, generatedAt, error) {
  return {
    capability_id: capabilityId,
    capability_version: 'runtime-error',
    run_status: 'ERROR',
    changed_fields: [],
    missing_evidence: [`runtime:${capabilityId}`],
    evidence_refs: [],
    human_review_required: true,
    domain_result: {},
    generated_at: generatedAt(),
    input_hash: inputHash,
    error: { code: 'CAPABILITY_RUNTIME_UNAVAILABLE', message: error?.message || `No runner for ${capabilityId}` }
  };
}

/** Run affected skills sequentially so the trace is deterministic A3→A4→A5. */
export async function runAffectedSkills({
  capabilities = [],
  opportunity,
  event,
  sellerContext = {},
  fieldObservations = {},
  skillResults = {},
  runners = DEFAULT_SKILL_RUNNERS,
  generatedAt = () => new Date().toISOString()
} = {}) {
  const executions = [];
  const mergedResults = { ...(skillResults || {}) };
  const inputHashes = {};
  const refreshedCapabilities = [];
  const missingEvidence = [];
  const ordered = [...new Set(capabilities || [])].sort((left, right) => (ORDER.get(left) ?? 99) - (ORDER.get(right) ?? 99));

  for (const capabilityId of ordered) {
    const key = capabilitySlot(capabilityId);
    const input = buildAffectedSkillInput({ capabilityId, opportunity, event, sellerContext, fieldObservations });
    const inputHash = hashSkillInput(input);
    inputHashes[capabilityId] = inputHash;
    const existing = key ? mergedResults[key] : null;
    if (isSkillResultFresh(existing, inputHash)) {
      refreshedCapabilities.push(capabilityId);
      continue;
    }

    const runner = runners?.[capabilityId];
    let result;
    if (typeof runner !== 'function') {
      result = runtimeError(capabilityId, inputHash, generatedAt, null);
    } else {
      try {
        const value = await runner(input);
        result = { ...(value || {}), generated_at: value?.generated_at || generatedAt(), input_hash: value?.input_hash || inputHash };
      } catch (error) {
        result = runtimeError(capabilityId, inputHash, generatedAt, error);
      }
    }
    executions.push(result);
    if (key) mergedResults[key] = result;
    if (['DONE', 'NOT_APPLICABLE', 'BLOCKED'].includes(result?.run_status)) refreshedCapabilities.push(capabilityId);
    if (result?.run_status === 'MORE_EVIDENCE') {
      missingEvidence.push(...(result.missing_evidence || []).map(item => `${capabilityId}:${item}`));
    }
    if (result?.run_status === 'ERROR') missingEvidence.push(`runtime:${capabilityId}`);
  }

  return {
    executions,
    skill_results: mergedResults,
    dependency_results: mergedResults,
    input_hashes: inputHashes,
    refreshed_capabilities: [...new Set(refreshedCapabilities)],
    missing_evidence: [...new Set(missingEvidence)]
  };
}

export function applySkillDependencyGate(envelope = {}, { skillResults = {}, inputHashes = {} } = {}) {
  if (!envelope?.domain_result || ['BLOCKED', 'ERROR'].includes(envelope.run_status)) return envelope;
  const affected = envelope.domain_result.affected_skills || [];
  const errors = [];
  const stale = [];
  const completed = [];
  for (const capabilityId of affected) {
    const key = capabilitySlot(capabilityId);
    const result = key ? skillResults[key] : null;
    if (result?.run_status === 'ERROR') errors.push(result);
    else if (isSkillResultFresh(result, inputHashes[capabilityId])) completed.push(capabilityId);
    else stale.push(capabilityId);
  }
  if (errors.length) {
    return {
      ...envelope,
      run_status: 'ERROR',
      error: { code: 'DEPENDENCY_RUNTIME_ERROR', message: errors.map(item => item.error?.message || item.capability_id).join('; ') },
      human_review_required: true,
      domain_result: { ...envelope.domain_result, communication_brief: null, dependency_refresh: { required: [], completed, stale, errors: errors.map(item => item.capability_id) } }
    };
  }
  if (!stale.length) {
    return { ...envelope, domain_result: { ...envelope.domain_result, dependency_refresh: { required: [], completed, stale: [] } } };
  }
  const currentAction = envelope.domain_result.next_action || {};
  const highRisk = currentAction.execution_mode === 'HUMAN' || currentAction.action === 'HUMAN_TAKEOVER';
  return {
    ...envelope,
    run_status: 'MORE_EVIDENCE',
    missing_evidence: [...new Set([...(envelope.missing_evidence || []), ...stale.map(id => `refresh:${id}`)])],
    domain_result: {
      ...envelope.domain_result,
      communication_brief: null,
      next_action: highRisk ? {
        ...currentAction,
        prerequisites: [...new Set([...(currentAction.prerequisites || []), 'refresh_affected_skills'])]
      } : {
        action: 'WAIT', reason: '受影响的专业能力结果尚未按当前输入刷新', owner: 'AGENT', execution_mode: 'AUTO',
        prerequisites: ['refresh_affected_skills'], success_condition: 'all affected skills are fresh', stop_condition: 'dependency error', due_at: null
      },
      decision_state: highRisk ? 'HUMAN' : 'VERIFY',
      dependency_refresh: { required: stale, completed, stale }
    }
  };
}

export { capabilitySlot as affectedSkillResultSlot };
