import { createA2BatchPipeline } from './a2-batch.js';

export function createA2ProviderPipeline(options = {}) {
  const runBatch = createA2BatchPipeline(options);
  return async function runA2ProviderPipeline({ input, providers } = {}) {
    const batch = await runBatch({ input, providers, maxReady: 1, maxContactedCompanies: 1 });
    const selected = batch.candidates?.[0];
    if (!selected?.envelope) return batch.envelope;
    selected.envelope.domain_result.provider_trace = {
      ...batch.provider_trace,
      discovered_companies: batch.summary.discovered,
      selected_company_id: selected.buyer_company_id,
      contact_candidates: selected.contact ? 1 : 0
    };
    return selected.envelope;
  };
}
