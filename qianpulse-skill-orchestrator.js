import {
  createA2BatchPipeline,
  runA6Skill,
  enrichA6Envelope,
  applyA6DependencyGate
} from './skill-runtime/index.js';
import { createOpportunitySeeds } from './opportunity-seeder.js';
import { createMemoryOpportunityStore } from './opportunity-store.js';

export function createQianPulseSkillOrchestrator({
  providers = {},
  opportunityStore = createMemoryOpportunityStore(),
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

  function runBuyerProgression({
    opportunityId,
    event,
    sellerContext = {},
    dependencyResults = {},
    refreshedCapabilities = []
  } = {}) {
    const opportunity = opportunityStore.get(opportunityId);
    if (!opportunity) {
      return {
        run_status: 'BLOCKED',
        code: 'NEEDS_CONTEXT',
        missing_evidence: ['opportunity_id'],
        opportunity: null,
        envelope: null
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

    const baseEnvelope = runA6Skill({
      opportunity_id: opportunity.id,
      trigger_event: {
        event_id: event?.event_id || null,
        event_type: event?.event_type || 'BUYER_MESSAGE',
        timestamp: event?.timestamp || clock()
      },
      latest_buyer_message: latestBuyerMessage,
      field_updates: event?.payload?.field_updates || {},
      opportunity_state: {
        stage: opportunity.stage || 'CONTACTED',
        fields: opportunity.fields || {}
      },
      seller_context: sellerContext,
      a3_result: dependencyResults.a3 || null,
      a4_result: dependencyResults.a4 || null,
      a5_result: dependencyResults.a5 || null
    });
    const enriched = enrichA6Envelope(baseEnvelope, {
      sellerContext,
      opportunityState: { stage: opportunity.stage || 'CONTACTED', fields: opportunity.fields || {} }
    });
    const envelope = applyA6DependencyGate(enriched, { refreshedCapabilities });
    const updated = opportunityStore.applyA6Envelope({ opportunityId, envelope, at: clock() });
    return { run_status: envelope.run_status, envelope, opportunity: updated };
  }

  return { opportunityStore, runProactiveDevelopment, runBuyerProgression };
}
