import {
  createA2BatchPipeline,
  runA6Skill,
  enrichA6Envelope,
  applyA6DependencyGate,
  runInvalidatedDependencies,
  DEFAULT_DEPENDENCY_RUNNERS,
  extractA6FieldUpdates
} from './skill-runtime/index.js';
import { createOpportunitySeeds } from './opportunity-seeder.js';
import { createMemoryOpportunityStore } from './opportunity-store.js';

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))];
}

export function createQianPulseSkillOrchestrator({
  providers = {},
  opportunityStore = createMemoryOpportunityStore(),
  dependencyRunners = DEFAULT_DEPENDENCY_RUNNERS,
  clock = () => new Date().toISOString()
} = {}) {
  const runA2Batch = createA2BatchPipeline();

  async function runProactiveDevelopment({ input, seller, product, maxReady, maxContactedCompanies } = {}) {
    const batchResult = await runA2Batch({
      input,
      providers,
      maxReady,
      maxContactedCompanies
    });
    const seeds = createOpportunitySeeds({
      batchResult,
      seller: seller || input?.seller,
      product,
      createdAt: clock()
    });
    const opportunities = opportunityStore.upsertSeeds(seeds);
    return {
      run_status: batchResult.status,
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
    const refresh = await runInvalidatedDependencies({
      capabilities,
      opportunity,
      event,
      sellerContext,
      dependencyResults: {},
      runners: dependencyRunners
    });
    const statuses = refresh.executions.map(item => item.run_status);
    const runStatus = statuses.includes('ERROR') ? 'ERROR'
      : statuses.includes('BLOCKED') ? 'BLOCKED'
        : statuses.includes('MORE_EVIDENCE') ? 'MORE_EVIDENCE' : 'DONE';
    return { run_status: runStatus, opportunity, ...refresh };
  }

  async function runBuyerProgression({
    opportunityId,
    event,
    sellerContext = {},
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
        dependency_refresh: null
      };
    }

    const rawMessage = event?.payload?.message || event?.payload?.content || event?.content || '';
    const latestBuyerMessage = typeof rawMessage === 'string'
      ? { content: rawMessage, evidence_ref: event?.evidence_ref || null }
      : {
          ...rawMessage,
          evidence_ref: rawMessage?.evidence_ref || event?.evidence_ref || null,
          evidence_refs: rawMessage?.evidence_refs || event?.evidence_refs || []
        };
    const structuredFieldExtraction = extractA6FieldUpdates(
      latestBuyerMessage.content || '',
      event?.payload?.field_updates || {}
    );
    const fieldUpdates = structuredFieldExtraction.updates;
    const opportunityState = {
      stage: opportunity.stage || 'CONTACTED',
      fields: opportunity.fields || {}
    };

    function executeA6(results) {
      return runA6Skill({
        opportunity_id: opportunity.id,
        trigger_event: {
          event_id: event?.event_id || null,
          event_type: event?.event_type || 'BUYER_MESSAGE',
          timestamp: event?.timestamp || clock()
        },
        latest_buyer_message: latestBuyerMessage,
        field_updates: fieldUpdates,
        opportunity_state: opportunityState,
        seller_context: sellerContext,
        a3_result: results.a3 || null,
        a4_result: results.a4 || null,
        a5_result: results.a5 || null
      });
    }

    const firstEnvelope = executeA6(dependencyResults);
    const invalidated = firstEnvelope?.domain_result?.invalidated_capabilities || [];
    const alreadyRefreshed = new Set(refreshedCapabilities || []);
    const toRefresh = autoRefreshDependencies
      ? invalidated.filter(capabilityId => !alreadyRefreshed.has(capabilityId))
      : [];

    const refresh = toRefresh.length
      ? await runInvalidatedDependencies({
          capabilities: toRefresh,
          opportunity,
          event: {
            ...event,
            changed_fields: firstEnvelope?.domain_result?.changed_business_fields || [],
            payload: {
              ...(event?.payload || {}),
              field_updates: fieldUpdates
            }
          },
          sellerContext,
          dependencyResults,
          runners: dependencyRunners
        })
      : {
          executions: [],
          dependency_results: { ...(dependencyResults || {}) },
          refreshed_capabilities: [],
          missing_evidence: []
        };

    const mergedResults = refresh.dependency_results;
    const mergedRefreshed = unique([...(refreshedCapabilities || []), ...(refresh.refreshed_capabilities || [])]);
    const baseEnvelope = refresh.executions.length ? executeA6(mergedResults) : firstEnvelope;
    const enriched = enrichA6Envelope(baseEnvelope, {
      sellerContext,
      opportunityState
    });
    const gated = applyA6DependencyGate(enriched, { refreshedCapabilities: mergedRefreshed });
    const envelope = {
      ...gated,
      missing_evidence: unique([...(gated.missing_evidence || []), ...(refresh.missing_evidence || [])]),
      domain_result: gated?.domain_result ? {
        ...gated.domain_result,
        structured_field_extraction: structuredFieldExtraction,
        dependency_refresh: {
          ...(gated.domain_result.dependency_refresh || { required: [], completed: [] }),
          attempted: toRefresh,
          executions: refresh.executions.map(result => ({
            capability_id: result.capability_id,
            run_status: result.run_status,
            missing_evidence: result.missing_evidence || []
          }))
        }
      } : gated.domain_result
    };
    const updated = opportunityStore.applyA6Envelope({ opportunityId, envelope, at: clock() });
    return {
      run_status: envelope.run_status,
      envelope,
      opportunity: updated,
      structured_field_extraction: structuredFieldExtraction,
      dependency_refresh: {
        attempted: toRefresh,
        refreshed_capabilities: mergedRefreshed,
        executions: refresh.executions,
        missing_evidence: refresh.missing_evidence
      }
    };
  }

  return { opportunityStore, runProactiveDevelopment, runCapabilityRefresh, runBuyerProgression };
}
