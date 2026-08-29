import { runA2Skill, evaluateBuyerFit } from './a2.js';
import { generateA2OutreachDraft } from './a2-outreach.js';

function confidenceScore(value) {
  return value === 'high' ? 30 : value === 'medium' ? 20 : 10;
}

function companyRank(company = {}, fit = {}) {
  const shipments = Math.min(Number(company.number_of_shipments || 0), 100);
  const evidence = Math.min((fit.evidence_refs || []).length * 8, 32);
  const fitScore = confidenceScore(fit.confidence);
  const product = fit.product_relevance === 'yes' ? 25 : fit.product_relevance === 'unknown' ? 5 : 0;
  return fitScore + evidence + product + Math.min(shipments / 10, 10);
}

function domainOf(company = {}) {
  const raw = company.domain || company.website || company.company_url || company.raw?.domain || company.raw?.website || '';
  return String(raw).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].trim();
}

export function createA2BatchPipeline({ runA2 = runA2Skill, evaluateFit = evaluateBuyerFit, generateOutreach = generateA2OutreachDraft } = {}) {
  return async function runA2Batch({ input, providers, maxReady = 10, maxContactedCompanies } = {}) {
    if (!input) throw new Error('A2 input required');
    if (!providers?.trade_data?.searchBuyers) throw new Error('trade_data.searchBuyers provider required');

    const validation = runA2(input);
    const target = validation.domain_result?.target_definition || {};
    const targetMissing = (validation.missing_evidence || []).filter(item => String(item).startsWith('target.') || String(item).startsWith('buyer_profile.'));
    if (targetMissing.length) {
      return {
        status: 'MORE_EVIDENCE',
        target_definition: target,
        opportunity_candidates: [],
        summary: { discovered: 0, evaluated: 0, contacted_companies: 0, ready: 0 },
        missing_evidence: targetMissing
      };
    }

    const requestedMax = Math.min(Math.max(Number(input.constraints?.max_candidates) || 20, 1), 100);
    const readyLimit = Math.min(Math.max(Number(maxReady) || 10, 1), requestedMax);
    const contactLimit = Math.min(
      Math.max(Number(maxContactedCompanies) || readyLimit * 2, readyLimit),
      requestedMax
    );

    const discovery = await providers.trade_data.searchBuyers({
      countries: target.countries || [],
      product_keywords: target.product_keywords || [],
      hs_codes: target.hs_codes || [],
      page_size: requestedMax
    });
    const companies = (discovery.companies || []).slice(0, requestedMax);
    if (!companies.length) {
      return {
        status: 'NOT_APPLICABLE',
        target_definition: target,
        opportunity_candidates: [],
        summary: { discovered: 0, evaluated: 0, contacted_companies: 0, ready: 0 }
      };
    }

    const ranked = companies
      .map(company => {
        const fit = evaluateFit(company);
        return { company, fit, rank_score: companyRank(company, fit) };
      })
      .sort((a, b) => b.rank_score - a.rank_score);

    const candidates = [];
    let contactedCompanies = 0;
    let ready = 0;

    for (const item of ranked) {
      let contact = null;
      const domain = domainOf(item.company);
      if (
        contactedCompanies < contactLimit &&
        domain &&
        providers.contact_data?.findDecisionMakers &&
        item.fit.product_relevance === 'yes'
      ) {
        contactedCompanies += 1;
        const contacts = await providers.contact_data.findDecisionMakers({
          domain,
          titles: target.decision_maker_roles || [],
          locations: target.countries || [],
          limit: input.constraints?.contact_limit_per_company || 3
        });
        contact = (contacts || []).find(value => value.work_email) || contacts?.[0] || null;
        if (contact) contact.buyer_company_id = item.company.buyer_company_id || item.company.id;
      }

      const envelope = runA2({ ...input, buyer_company: item.company, buyer_fit: item.fit, contact });
      if (envelope.domain_result?.outreach_readiness?.status === 'READY') {
        const outreach = generateOutreach({
          seller: input.seller || {},
          target,
          buyerCompany: item.company,
          buyerFit: item.fit,
          contact: contact || {},
          language: input.constraints?.language || 'en'
        });
        if (outreach.status === 'READY') {
          envelope.domain_result.outreach = outreach.draft;
        } else {
          envelope.run_status = 'MORE_EVIDENCE';
          envelope.missing_evidence = [...new Set([...(envelope.missing_evidence || []), ...(outreach.missing_evidence || [])])];
          envelope.domain_result.outreach = null;
          envelope.domain_result.outreach_readiness = { status: 'MORE_EVIDENCE', reason: '外联 Draft 缺少证据或业务上下文' };
        }
      }

      const readiness = envelope.domain_result?.outreach_readiness?.status || 'MORE_EVIDENCE';
      candidates.push({
        buyer_company_id: item.company.buyer_company_id || item.company.id || null,
        rank_score: item.rank_score,
        readiness,
        envelope
      });
      if (readiness === 'READY' && envelope.domain_result?.outreach) ready += 1;
      if (ready >= readyLimit) break;
    }

    return {
      status: ready ? 'DONE' : 'MORE_EVIDENCE',
      target_definition: target,
      opportunity_candidates: candidates,
      summary: {
        discovered: companies.length,
        evaluated: candidates.length,
        contacted_companies: contactedCompanies,
        ready
      }
    };
  };
}
