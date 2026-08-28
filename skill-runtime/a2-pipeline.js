import { runA2Skill, evaluateBuyerFit } from './a2.js';

function rank(fit = {}) {
  return fit.confidence === 'high' ? 3 : fit.confidence === 'medium' ? 2 : 1;
}

function domainOf(company = {}) {
  const raw = company.domain || company.website || company.company_url || company.raw?.domain || company.raw?.website || '';
  return String(raw).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim();
}

export function createA2ProviderPipeline({ runA2 = runA2Skill, evaluateFit = evaluateBuyerFit } = {}) {
  return async function runA2ProviderPipeline({ input, providers } = {}) {
    if (!input) throw new Error('A2 input required');
    const initial = runA2(input);
    if (['BLOCKED', 'NOT_APPLICABLE', 'ERROR'].includes(initial.run_status)) return initial;
    if (initial.missing_evidence?.some(item => String(item).startsWith('target.') || String(item).startsWith('buyer_profile.'))) return initial;
    if (!providers?.trade_data?.searchBuyers) throw new Error('trade_data.searchBuyers provider required');

    const target = initial.domain_result?.target_definition || {};
    const discovered = await providers.trade_data.searchBuyers({
      countries: target.countries || [],
      product_keywords: target.product_keywords || [],
      hs_codes: target.hs_codes || [],
      page_size: input.constraints?.max_candidates || 20
    });
    const candidates = discovered.companies || [];
    if (!candidates.length) return runA2({ ...input, buyer_company: null });

    const ranked = candidates
      .map(company => ({ company, fit: evaluateFit(company) }))
      .sort((a, b) => rank(b.fit) - rank(a.fit));
    const selected = ranked[0];
    const domain = domainOf(selected.company);
    if (!domain || !providers.contact_data?.findDecisionMakers) {
      return runA2({ ...input, buyer_company: selected.company, buyer_fit: selected.fit });
    }

    const contacts = await providers.contact_data.findDecisionMakers({
      domain,
      titles: target.decision_maker_roles || [],
      locations: target.countries || [],
      limit: input.constraints?.contact_limit_per_company || 3
    });
    const contact = (contacts || []).find(item => item.work_email) || contacts?.[0] || null;
    if (contact) contact.buyer_company_id = selected.company.buyer_company_id || selected.company.id;
    const result = runA2({ ...input, buyer_company: selected.company, buyer_fit: selected.fit, contact });
    result.domain_result.provider_trace = {
      discovered_companies: candidates.length,
      selected_company_id: selected.company.buyer_company_id || selected.company.id || null,
      contact_candidates: contacts?.length || 0
    };
    return result;
  };
}
