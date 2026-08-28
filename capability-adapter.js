import { A2_CAPABILITY_ID, A6_CAPABILITY_ID, runA2Skill, runA6Skill } from './skill-runtime/index.js';

export async function withRetry(operation, { retries = 2, onRetry = () => {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        onRetry(attempt + 1, error);
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

export function createCapabilityAdapter({
  calculateMatch,
  evaluateMarketAccess,
  runA2 = runA2Skill,
  runA6 = runA6Skill
} = {}) {
  return async function invoke(capabilityId, context = {}) {
    return withRetry(async () => {
      if (capabilityId === A2_CAPABILITY_ID) return runA2(context);
      if (capabilityId === A6_CAPABILITY_ID) return runA6(context);

      if (capabilityId === 'supply.match') {
        const matches = typeof calculateMatch === 'function'
          ? calculateMatch(context.opportunity, context.products || [])
          : [];
        return { run_status: 'DONE', domain_result: { matches } };
      }

      if (capabilityId === 'market.access') {
        if (typeof evaluateMarketAccess !== 'function') {
          return { run_status: 'MORE_EVIDENCE', missing_evidence: ['market_access_engine'], domain_result: {} };
        }
        const result = evaluateMarketAccess(context.opportunity, context.sellerProfile || {});
        return {
          run_status: result.verified ? 'DONE' : 'MORE_EVIDENCE',
          missing_evidence: result.missing,
          domain_result: result
        };
      }

      if (capabilityId === 'reply.draft') {
        return {
          run_status: 'DONE',
          human_review_required: true,
          domain_result: { draft: context.draft }
        };
      }

      return { run_status: 'DONE', domain_result: {} };
    });
  };
}
