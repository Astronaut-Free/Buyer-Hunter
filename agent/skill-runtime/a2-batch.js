import { runA2Skill } from './a2.js';
import { evaluateA2BuyerFit } from './a2-buyer-fit.js';
import { bindBuyerCompanyIdentity } from './a2-company-identity.js';
import { checkSuppression, isCompanyExcluded } from './a2-suppression.js';
import { generateA2OutreachDraft } from './a2-outreach.js';
import { makeCapabilityEnvelope } from './guards.js';
import { A2_CAPABILITY_ID } from './capability-ids.js';

const A2_VERSION = '1.1.0';

function integer(value, fallback, min, max) {
  return Math.min(Math.max(Number(value) || fallback, min), max);
}

function providerStatus(errors, calls) {
  if (!calls) return 'NOT_CALLED';
  if (!errors) return 'OK';
  return errors < calls ? 'PARTIAL' : 'ERROR';
}

function candidateResult({ company, fit, envelope, rank, status, errors = [], suppression = null } = {}) {
  return {
    candidate_id: `a2c_${company.buyer_company_key?.replace(/^buyer_/, '') || rank}`,
    buyer_company_id: company.buyer_company_id,
    buyer_company_key: company.buyer_company_key,
    buyer_company: company,
    buyer_fit: fit,
    development_priority: { score: fit.development_priority_score, score_components: fit.score_components, rank },
    contact: envelope?.domain_result?.contact || null,
    dependency_status: envelope?.domain_result?.dependencies || null,
    outreach_readiness: envelope?.domain_result?.outreach_readiness || { status: 'MORE_EVIDENCE', reason: status },
    outreach: envelope?.domain_result?.outreach || null,
    lifecycle: status,
    evidence_refs: envelope?.evidence_refs || fit.evidence_refs || [],
    errors,
    suppression,
    readiness: envelope?.domain_result?.outreach_readiness?.status || 'MORE_EVIDENCE',
    rank_score: fit.development_priority_score,
    envelope
  };
}

export function createA2BatchPipeline({ runA2 = runA2Skill, evaluateFit = evaluateA2BuyerFit, generateOutreach = generateA2OutreachDraft } = {}) {
  return async function runA2Batch({ input, providers = {}, maxReady, maxContactedCompanies } = {}) {
    if (!input) throw new Error('A2 input required');
    const validation = runA2(input);
    const target = validation.domain_result?.target_definition || {};
    const targetMissing = (validation.missing_evidence || []).filter(item => String(item).startsWith('target.') || String(item).startsWith('buyer_profile.'));
    if (targetMissing.length) {
      const domainResult = {
        target_definition: target, candidates: [], summary: { discovered: 0, researched: 0, fit_qualified: 0, contact_enriched: 0, ready: 0, blocked: 0, errors: 0 },
        provider_trace: {}, missing_evidence: targetMissing, next_state: 'TARGET_DEFINITION_REQUIRED', human_review_required: false
      };
      const envelope = makeCapabilityEnvelope({ capabilityId: A2_CAPABILITY_ID, capabilityVersion: A2_VERSION, runStatus: 'MORE_EVIDENCE', missingEvidence: targetMissing, domainResult });
      return { status: 'MORE_EVIDENCE', batch_status: 'FAILED', ...domainResult, opportunity_candidates: domainResult.candidates, envelope };
    }
    if (!providers.trade_data?.searchBuyers) throw new Error('trade_data.searchBuyers provider required');

    const budget = input.budget || {};
    const requestedMax = integer(budget.max_candidates ?? input.constraints?.max_candidates, 30, 1, 100);
    const readyLimit = integer(maxReady ?? budget.max_ready, 5, 1, requestedMax);
    const contactLimit = integer(maxContactedCompanies ?? budget.max_contacted_companies, 10, 1, requestedMax);
    const contactPerCompany = integer(budget.max_contacts ?? input.constraints?.contact_limit_per_company, 3, 1, 10);
    const trace = {
      trademo: { status: 'NOT_CALLED', calls: 0, errors: 0, latency_ms: 0 },
      apollo: { status: 'NOT_CALLED', calls: 0, errors: 0, latency_ms: 0 },
      suppression: { status: 'NOT_CALLED', calls: 0, errors: 0 }
    };

    let discovery;
    const discoveryStarted = Date.now();
    trace.trademo.calls = 1;
    try {
      discovery = await providers.trade_data.searchBuyers({
        countries: target.countries || [], product_keywords: target.product_keywords || [], hs_codes: target.hs_codes || [],
        exclude_domains: target.exclude_domains || [], exclude_companies: target.exclude_companies || [], page_size: requestedMax
      });
      trace.trademo.status = 'OK';
    } catch (error) {
      trace.trademo.status = 'ERROR'; trace.trademo.errors = 1; trace.trademo.error = error.message;
      const domainResult = { target_definition: target, candidates: [], summary: { discovered: 0, researched: 0, fit_qualified: 0, contact_enriched: 0, ready: 0, blocked: 0, errors: 1 }, provider_trace: trace, missing_evidence: [], next_state: 'RETRY_DISCOVERY_PROVIDER', human_review_required: true };
      const envelope = makeCapabilityEnvelope({ capabilityId: A2_CAPABILITY_ID, capabilityVersion: A2_VERSION, runStatus: 'ERROR', humanReviewRequired: true, domainResult });
      return { status: 'ERROR', batch_status: 'FAILED', ...domainResult, opportunity_candidates: [], envelope };
    } finally {
      trace.trademo.latency_ms = Date.now() - discoveryStarted;
    }

    const rawCompanies = (discovery?.companies || []).slice(0, requestedMax);
    const excluded = [];
    const companies = rawCompanies.map(bindBuyerCompanyIdentity).filter(company => {
      const result = isCompanyExcluded(company, target);
      if (result.excluded) excluded.push({ buyer_company_key: company.buyer_company_key, reason: result.reason });
      return !result.excluded;
    });
    const ranked = companies.map(company => ({ company, fit: evaluateFit(company, target) }))
      .sort((left, right) => right.fit.development_priority_score - left.fit.development_priority_score);

    const candidates = [];
    let contacted = 0;
    let ready = 0;
    let errors = 0;
    for (let index = 0; index < ranked.length; index += 1) {
      const item = ranked[index];
      let status = item.fit.decision;
      let contact = null;
      let suppression = null;
      const candidateErrors = [];

      if (status === 'FIT_QUALIFIED' && providers.opportunity_store?.findActive) {
        const existing = await providers.opportunity_store.findActive({
          seller_id: input.seller?.seller_id, product_id: input.seller?.product_id,
          target_market: target.countries?.[0], buyer_company_key: item.company.buyer_company_key
        });
        if (existing) {
          const envelope = runA2({ ...input, buyer_company: item.company, buyer_fit: item.fit, existing_opportunity: existing });
          candidates.push(candidateResult({ company: item.company, fit: item.fit, envelope, rank: index + 1, status: 'EXISTING_OPPORTUNITY' }));
          continue;
        }
      }

      if (status === 'FIT_QUALIFIED' && providers.suppression_store?.check) {
        trace.suppression.calls += 1;
        try {
          suppression = await checkSuppression(providers.suppression_store, { seller_id: input.seller?.seller_id, buyer_company_id: item.company.buyer_company_key, channel: 'email' });
          trace.suppression.status = 'OK';
          if (suppression.suppressed) status = 'SUPPRESSED';
        } catch (error) {
          trace.suppression.errors += 1; trace.suppression.status = 'PARTIAL'; candidateErrors.push({ step: 'suppression', message: error.message }); errors += 1;
          status = 'NEEDS_EVIDENCE';
        }
      }

      if (status === 'FIT_QUALIFIED' && contacted < contactLimit && providers.contact_data?.findDecisionMakers) {
        const domain = item.company.verified_domain;
        if (domain) {
          contacted += 1; trace.apollo.calls += 1; const started = Date.now();
          try {
            const contacts = await providers.contact_data.findDecisionMakers({ domain, titles: target.decision_maker_roles || [], locations: target.countries || [], limit: contactPerCompany });
            contact = (contacts || []).find(value => value.work_email || value.email) || contacts?.[0] || null;
          } catch (error) {
            trace.apollo.errors += 1; errors += 1; candidateErrors.push({ step: 'contact', code: 'CONTACT_PROVIDER_ERROR', message: error.message }); status = 'NEEDS_EVIDENCE';
          } finally {
            trace.apollo.latency_ms += Date.now() - started;
          }
        }
      }

      const envelope = runA2({ ...input, buyer_company: item.company, buyer_fit: item.fit, contact, suppression });
      const canDraft = item.fit.decision === 'FIT_QUALIFIED' && envelope.domain_result?.contact && envelope.domain_result?.outreach_readiness?.status !== 'BLOCKED';
      if (canDraft) {
        const outreach = generateOutreach({ seller: input.seller || {}, target, buyerCompany: item.company, buyerFit: item.fit, contact: envelope.domain_result.contact || {}, language: input.constraints?.language || 'en' });
        if (outreach.status === 'READY') {
          envelope.domain_result.outreach = outreach.draft;
          if (envelope.domain_result.outreach_readiness?.status === 'READY') {
            envelope.domain_result.lifecycle = 'READY_FOR_APPROVAL';
            ready += 1;
          } else {
            envelope.domain_result.lifecycle = 'READY_FOR_DRAFT';
          }
        } else {
          envelope.run_status = 'MORE_EVIDENCE';
          envelope.missing_evidence = [...new Set([...(envelope.missing_evidence || []), ...(outreach.missing_evidence || [])])];
          envelope.domain_result.outreach_readiness = { status: 'MORE_EVIDENCE', reason: 'OUTREACH_CLAIMS_OR_SELLER_IDENTITY_REQUIRED' };
        }
      }
      candidates.push(candidateResult({ company: item.company, fit: item.fit, envelope, rank: index + 1, status, errors: candidateErrors, suppression }));
      if (ready >= readyLimit) break;
    }
    trace.apollo.status = providerStatus(trace.apollo.errors, trace.apollo.calls);
    if (!trace.suppression.calls) trace.suppression.status = 'NOT_CALLED';

    const blocked = candidates.filter(candidate => candidate.readiness === 'BLOCKED').length;
    const fitQualified = candidates.filter(candidate => candidate.buyer_fit?.decision === 'FIT_QUALIFIED').length;
    const summary = { discovered: rawCompanies.length, excluded: excluded.length, researched: candidates.length, fit_qualified: fitQualified, contact_enriched: candidates.filter(candidate => candidate.contact).length, contacted_companies: contacted, ready, blocked, errors, evaluated: candidates.length };
    const batchStatus = errors ? (candidates.length ? 'PARTIAL' : 'FAILED') : 'SUCCEEDED';
    const domainResult = { target_definition: target, candidates, summary, provider_trace: trace, missing_evidence: [], next_state: ready ? 'READY_FOR_APPROVAL' : rawCompanies.length ? 'RESEARCH_COMPLETE' : 'DISCOVERY_COMPLETE_NO_RESULTS', human_review_required: ready > 0, excluded };
    const envelope = makeCapabilityEnvelope({ capabilityId: A2_CAPABILITY_ID, capabilityVersion: A2_VERSION, runStatus: 'DONE', evidenceRefs: candidates.flatMap(candidate => candidate.evidence_refs || []), humanReviewRequired: ready > 0, domainResult });
    return { status: 'DONE', batch_status: batchStatus, ...domainResult, opportunity_candidates: candidates, envelope };
  };
}
