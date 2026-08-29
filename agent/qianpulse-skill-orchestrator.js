import {
  A6_CAPABILITY_ID,
  A6_VERSION,
  createA2BatchPipeline,
  runA6Skill,
  validateA6Envelope
} from './skill-runtime/index.js';
import {
  DEFAULT_SKILL_RUNNERS,
  applySkillDependencyGate,
  buildAffectedSkillInput,
  hashSkillInput,
  runAffectedSkills
} from './orchestration/skill-dependency-gate.js';
import { A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID } from './skill-runtime/capability-ids.js';
import { createOpportunitySeeds } from './opportunity-seeder.js';
import { createMemoryOpportunityStore } from './opportunity-store.js';

function normalizeBuyerMessage(event = {}) {
  const raw = event?.payload?.message || event?.payload?.content || event?.content || '';
  if (typeof raw === 'string') return { content: raw, evidence_ref: event?.evidence_ref || null, evidence_refs: event?.evidence_refs || [] };
  return {
    ...(raw || {}),
    content: raw?.content || '',
    evidence_ref: raw?.evidence_ref || event?.evidence_ref || null,
    evidence_refs: raw?.evidence_refs || event?.evidence_refs || []
  };
}

function dependencyMetadata(refresh) {
  return refresh.executions.map(result => ({
    capability_id: result.capability_id,
    run_status: result.run_status,
    input_hash: result.input_hash,
    generated_at: result.generated_at,
    missing_evidence: result.missing_evidence || []
  }));
}

function fieldUpdateProjection(fieldObservations = {}) {
  return {
    updates: Object.fromEntries((fieldObservations.updates || []).map(item => [item.field, item.after])),
    field_observations: fieldObservations
  };
}

export function createQianPulseSkillOrchestrator({
  providers = {},
  opportunityStore = createMemoryOpportunityStore(),
  // A3/A4/A5 defaults are Python CLI adapters. Callers can inject test or
  // server-probed adapters, but no Node domain implementation is used.
  dependencyRunners = DEFAULT_SKILL_RUNNERS,
  clock = () => new Date().toISOString()
} = {}) {
  const runA2Batch = createA2BatchPipeline();

  async function runProactiveDevelopment({ input, seller, product, maxReady, maxContactedCompanies } = {}) {
    // A2 preflight: A4/A5 gate every candidate's outreach readiness before the
    // batch runs, via the same authoritative dependency runners A6 uses
    // (Python CLI adapters). A buyer-message context is not involved, so the
    // preflight passes only structured context plus the target market.
    const dependencyContextId = `a2-preflight:${seller?.seller_id || input?.seller?.seller_id || 'seller'}:${input?.seller?.product_id || 'product'}`;
    const sellerContext = input?.seller_context || seller?.seller_context || seller || input?.seller || {};
    const supplied = input?.dependencies || {};
    const evaluatedAt = clock();
    const dependencies = {
      ...supplied,
      a4: supplied.a4 || await dependencyRunners[A4_CAPABILITY_ID]({
        opportunity_id: dependencyContextId,
        evaluated_at: evaluatedAt,
        changed_fields: [],
        seller_context: sellerContext
      }),
      a5: supplied.a5 || await dependencyRunners[A5_CAPABILITY_ID]({
        opportunity_id: dependencyContextId,
        evaluated_at: evaluatedAt,
        changed_fields: [],
        buyer_country: input?.target?.countries?.[0] || null,
        destination_market: input?.target?.countries?.[0] || null,
        seller_policy: sellerContext,
        seller_sku: {}
      })
    };
    const batchResult = await runA2Batch({ input: { ...input, dependencies }, providers, maxReady, maxContactedCompanies });
    const seeds = createOpportunitySeeds({
      batchResult,
      seller: seller || input?.seller,
      product,
      createdAt: clock()
    });
    const opportunities = opportunityStore.upsertSeeds(seeds);
    return {
      run_status: batchResult.envelope?.run_status || batchResult.status,
      envelope: batchResult.envelope,
      batch_result: batchResult,
      opportunity_seeds: seeds,
      opportunities
    };
  }

  async function runCapabilityRefresh({ opportunityId, capabilities = [], event, sellerContext = {} } = {}) {
    const opportunity = opportunityStore.get(opportunityId);
    if (!opportunity) {
      return { run_status: 'BLOCKED', code: 'NEEDS_CONTEXT', executions: [], missing_evidence: ['opportunity_id'] };
    }
    const fieldObservations = {
      updates: Object.entries(event?.payload?.field_updates || event?.field_updates || {})
        .map(([field, after]) => ({ field, after })),
      mentions: []
    };
    const refresh = await runAffectedSkills({
      capabilities,
      opportunity,
      event,
      sellerContext,
      fieldObservations,
      skillResults: {},
      runners: dependencyRunners,
      generatedAt: clock
    });
    for (const execution of refresh.executions) {
      if (typeof opportunityStore.applyCapabilityEnvelope === 'function') {
        opportunityStore.applyCapabilityEnvelope({ opportunityId, envelope: execution, at: clock() });
      }
    }
    const statuses = refresh.executions.map(item => item.run_status);
    const runStatus = statuses.includes('ERROR') ? 'ERROR'
      : statuses.includes('BLOCKED') ? 'BLOCKED'
        : statuses.includes('MORE_EVIDENCE') ? 'MORE_EVIDENCE' : 'DONE';
    return { run_status: runStatus, opportunity: opportunityStore.get(opportunityId), ...refresh };
  }

  async function runBuyerProgression({
    opportunityId,
    event,
    sellerContext = {},
    sellerExecutionPolicy = {},
    dependencyResults = {},
    refreshedCapabilities = [],
    autoRefreshDependencies = true
  } = {}) {
    const opportunity = opportunityStore.get(opportunityId);
    if (!opportunity) {
      return {
        run_status: 'BLOCKED',
        code: 'NEEDS_CONTEXT',
        missing_evidence: ['opportunity_id'],
        opportunity: null,
        envelope: null,
        analysis_envelope: null,
        dependency_refresh: null,
        trace: []
      };
    }

    const latestBuyerMessage = normalizeBuyerMessage(event);
    const evaluatedAt = event?.timestamp || clock();
    const opportunityState = {
      status: opportunity.status || 'ACTIVE',
      stage: opportunity.stage || 'CONTACTED',
      fields: opportunity.fields || {}
    };
    const commonInput = {
      opportunity_id: opportunity.id,
      evaluated_at: evaluatedAt,
      trigger_event: {
        event_id: event?.event_id || null,
        event_type: event?.event_type || 'BUYER_MESSAGE',
        timestamp: evaluatedAt,
        evidence_ref: event?.evidence_ref || latestBuyerMessage.evidence_ref || null,
        human_approved: Boolean(event?.human_approved || event?.payload?.human_approved)
      },
      conversation_context: { latest_message: latestBuyerMessage },
      opportunity_state: opportunityState,
      seller_execution_policy: sellerExecutionPolicy,
      field_updates: event?.payload?.field_updates || event?.field_updates || {}
    };

    const analysisEnvelope = runA6Skill({ ...commonInput, pass: 'ANALYSIS', skill_results: dependencyResults });
    const affectedSkills = analysisEnvelope.domain_result?.affected_skills || [];
    const fieldObservations = analysisEnvelope.domain_result?.field_observations || { updates: [], mentions: [] };
    let refresh;
    if (autoRefreshDependencies) {
      refresh = await runAffectedSkills({
        capabilities: affectedSkills,
        opportunity,
        event,
        sellerContext,
        fieldObservations,
        skillResults: dependencyResults,
        runners: dependencyRunners,
        generatedAt: clock
      });
    } else {
      const inputHashes = Object.fromEntries(affectedSkills.map(capabilityId => {
        const skillInput = buildAffectedSkillInput({ capabilityId, opportunity, event, sellerContext, fieldObservations });
        return [capabilityId, hashSkillInput(skillInput)];
      }));
      refresh = {
        executions: [],
        skill_results: { ...dependencyResults },
        dependency_results: { ...dependencyResults },
        input_hashes: inputHashes,
        refreshed_capabilities: [...refreshedCapabilities],
        missing_evidence: []
      };
    }

    // Persist each refreshed specialist result immediately. A6 is still the
    // only writer of progression state, while A3/A4/A5 remain queryable on
    // the Opportunity for direct refresh and audit consumers.
    for (const execution of refresh.executions) {
      if (typeof opportunityStore.applyCapabilityEnvelope === 'function') {
        opportunityStore.applyCapabilityEnvelope({ opportunityId, envelope: execution, at: clock() });
      }
    }

    const finalEnvelope = runA6Skill({
      ...commonInput,
      pass: 'FINAL',
      skill_results: refresh.skill_results
    });
    const gated = applySkillDependencyGate(finalEnvelope, {
      skillResults: refresh.skill_results,
      inputHashes: refresh.input_hashes
    });
    const envelope = {
      ...gated,
      missing_evidence: [...new Set([...(gated.missing_evidence || []), ...(refresh.missing_evidence || [])])],
      domain_result: gated.domain_result ? {
        ...gated.domain_result,
        dependency_refresh: {
          ...(gated.domain_result.dependency_refresh || { required: [], completed: [], stale: [] }),
          attempted: refresh.executions.map(item => item.capability_id),
          executions: dependencyMetadata(refresh)
        }
      } : gated.domain_result
    };
    const validation = validateA6Envelope(envelope);
    if (!validation.valid) {
      envelope.run_status = 'ERROR';
      envelope.error = { code: 'A6_CONTRACT_INVALID', message: validation.errors.join('; ') };
      envelope.human_review_required = true;
      if (envelope.domain_result) envelope.domain_result.communication_brief = null;
    }

    const updated = envelope.run_status === 'ERROR'
      ? opportunityStore.get(opportunityId)
      : opportunityStore.applyA6Envelope({ opportunityId, envelope, at: clock() });
    const trace = [
      { capability_id: A6_CAPABILITY_ID, capability_version: A6_VERSION, phase: 'ANALYSIS', result: analysisEnvelope },
      ...refresh.executions.map(result => ({
        capability_id: result.capability_id,
        capability_version: result.capability_version,
        phase: 'REFRESH',
        input_hash: result.input_hash,
        result
      })),
      { capability_id: A6_CAPABILITY_ID, capability_version: A6_VERSION, phase: 'FINAL', result: envelope }
    ];

    return {
      run_status: envelope.run_status,
      envelope,
      analysis_envelope: analysisEnvelope,
      opportunity: updated,
      field_observations: fieldObservations,
      structured_field_extraction: fieldUpdateProjection(fieldObservations),
      dependency_refresh: {
        attempted: refresh.executions.map(item => item.capability_id),
        refreshed_capabilities: refresh.refreshed_capabilities,
        executions: refresh.executions,
        input_hashes: refresh.input_hashes,
        missing_evidence: refresh.missing_evidence
      },
      trace
    };
  }

  return { opportunityStore, runProactiveDevelopment, runCapabilityRefresh, runBuyerProgression };
}
