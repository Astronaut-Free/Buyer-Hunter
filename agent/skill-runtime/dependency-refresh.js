import { DEFAULT_SKILL_RUNNERS, runAffectedSkills } from '../orchestration/skill-dependency-gate.js';

// Compatibility API used by direct refresh events and the A6 orchestrator.
// The gate owns input hashing, freshness, ordering, and Python delegation.
export const DEFAULT_DEPENDENCY_RUNNERS = DEFAULT_SKILL_RUNNERS;

export async function runInvalidatedDependencies(options = {}) {
  const fieldObservations = options.fieldObservations || {
    updates: options.event?.payload?.field_updates
      ? Object.entries(options.event.payload.field_updates).map(([field, after]) => ({ field, after }))
      : (options.event?.changed_fields || []).filter(item => item?.after !== undefined),
    mentions: (options.event?.changed_fields || [])
      .filter(item => item?.after === undefined)
      .map(item => typeof item === 'string' ? { field: item } : item)
  };
  const result = await runAffectedSkills({
    capabilities: options.capabilities,
    opportunity: options.opportunity,
    event: options.event,
    sellerContext: options.sellerContext,
    fieldObservations,
    skillResults: options.dependencyResults,
    runners: options.runners || DEFAULT_SKILL_RUNNERS,
    generatedAt: options.generatedAt
  });
  return { ...result, dependency_results: result.skill_results };
}
