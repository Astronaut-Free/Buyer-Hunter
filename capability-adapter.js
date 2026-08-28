export async function withRetry(operation, { retries = 2, onRetry = () => {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try { return await operation(attempt); } catch (error) { lastError = error; if (attempt < retries) { onRetry(attempt + 1, error); await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1))); } }
  }
  throw lastError;
}

export function createCapabilityAdapter({ calculateMatch, evaluateMarketAccess }) {
  return async function invoke(capabilityId, context) {
    return withRetry(async () => {
      if (capabilityId === 'supply.match') return { run_status: 'DONE', domain_result: { matches: calculateMatch(context.opportunity, context.products || []) } };
      if (capabilityId === 'market.access') { const result = evaluateMarketAccess(context.opportunity, context.sellerProfile || {}); return { run_status: result.verified ? 'DONE' : 'MORE_EVIDENCE', missing_evidence: result.missing, domain_result: result }; }
      if (capabilityId === 'reply.draft') return { run_status: 'DONE', human_review_required: true, domain_result: { draft: context.draft } };
      return { run_status: 'DONE', domain_result: {} };
    });
  };
}
