import {
  A6_CAPABILITY_ID,
  A6_VERSION,
  createA2BatchPipeline,
  runA4SupplyMatch,
  runA5TradeRisk,
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
import { createOpportunitySeeds } from './opportunity-seeder.js';
import { createMemoryOpportunityStore } from './opportunity-store.js';

function normalizeBuyerMessage(event = {}) {
  const raw = event?.payload?.message || event?.payload?.content || event?.content || '';
  if (typeof raw === 'string') return { content: raw, evidence_ref: event?.evidence_ref || null };
  return {
    ...raw,
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

export function createQianPulseSkillOrchestrator({
  providers = {},
  opportunityStore = createMemoryOpportunityStore(),
  dependencyRunners = DEFAULT_SKILL_RUNNERS,
  clock = () => new Date().toISOString()
} = {}) {
  const runA2Batch = createA2BatchPipeline();

  async function runProactiveDevelopment({ input, seller, product, maxReady, maxContactedCompanies } = {}) {
    const dependencyContextId = `a2-preflight:${seller?.seller_id || input?.seller?.seller_id || 'seller'}:${input?.seller?.product_id || 'product'}`;
    const sellerContext = input?.seller_context || seller?.seller_context || seller || input?.seller || {};
    const dependencies = {
      a4: input?.dependencies?.a4 || runA4SupplyMatch({ opportunity_id: dependencyContextId, changed_fields: [], seller_context: sellerContext }),
      a5: input?.dependencies?.a5 || runA5TradeRisk({ opportunity_id: dependencyContextId, destination: input?.target?.countries?.[0] || null, changed_fields: [], seller_context: sellerContext }),
      ...(input?.dependencies || {})
    };
    // Temporary adapter: A4/A5 are invoked by the Agent here until candidate-scoped dependency runs are persisted independently.
    const batchResult = await runA2Batch({ input: { ...input, dependencies }, providers, maxReady, maxContactedCompanies });
    const seeds = createOpportunitySeeds({ batchResult, seller: seller || input?.seller, product, createdAt: clock() });
    const opportunities = opportunityStore.upsertSeeds(seeds);
    return { run_status: batchResult.envelope?.run_status || batchResult.status, envelope: batchResult.envelope, batch_result: batchResult, opportunity_seeds: seeds, opportunities };
  }

  function runBuyerProgression({
    opportunityId,
    event,
    sellerContext = {},
    sellerExecutionPolicy = {},
    dependencyResults = {},
    autoRefreshDependencies = true
  } = {}) {
    const opportunity = opportunityStore.get(opportunityId);
    if (!opportunity) {
      return {
        run_status: 'BLOCKED', code: 'NEEDS_CONTEXT', missing_evidence: ['opportunity_id'],
        opportunity: null, envelope: null, analysis_envelope: null, dependency_refresh: null, trace: []
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
      refresh = runAffectedSkills({
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
        executions: [], skill_results: { ...dependencyResults }, input_hashes: inputHashes,
        refreshed_capabilities: [], missing_evidence: []
      };
    }

    const finalEnvelope = runA6Skill({ ...commonInput, pass: 'FINAL', skill_results: refresh.skill_results });
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
      ? opportunity
      : opportunityStore.applyA6Envelope({ opportunityId, envelope, at: clock() });
    const trace = [
      { capability_id: A6_CAPABILITY_ID, capability_version: A6_VERSION, phase: 'ANALYSIS', result: analysisEnvelope },
      ...refresh.executions.map(result => ({ capability_id: result.capability_id, capability_version: result.capability_version, phase: 'REFRESH', input_hash: result.input_hash, result })),
      { capability_id: A6_CAPABILITY_ID, capability_version: A6_VERSION, phase: 'FINAL', result: envelope }
    ];

    return {
      run_status: envelope.run_status,
      envelope,
      analysis_envelope: analysisEnvelope,
      opportunity: updated,
      field_observations: fieldObservations,
      structured_field_extraction: {
        updates: Object.fromEntries(fieldObservations.updates.map(item => [item.field, item.after])),
        field_observations: fieldObservations
      },
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

  return { opportunityStore, runProactiveDevelopment, runBuyerProgression };
}
