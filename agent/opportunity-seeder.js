function now(value) {
  return value || new Date().toISOString();
}

export function createOpportunitySeeds({ batchResult, seller, product, createdAt } = {}) {
  if (!batchResult || !Array.isArray(batchResult.opportunity_candidates)) return [];
  const timestamp = now(createdAt);
  return batchResult.opportunity_candidates
    .filter(candidate => candidate.readiness === 'READY' && candidate.envelope?.domain_result?.outreach)
    .map((candidate, index) => {
      const result = candidate.envelope.domain_result;
      const company = result.buyer_company || {};
      const contact = result.contact || null;
      const evidence = [...new Set([
        ...(candidate.envelope.evidence_refs || []),
        ...(result.buyer_fit?.evidence_refs || []),
        ...(company.evidence_refs || []),
        ...(contact?.source_refs || [])
      ].filter(Boolean))];
      const sellerContext = seller?.seller_context || seller?.sellerContext || null;
      return {
        seed_key: `a2:${seller?.seller_id || seller?.id || 'seller'}:${company.buyer_company_id || company.id || index}`,
        source: 'A2_PROACTIVE_BUYER_DEVELOPMENT',
        seller: {
          id: seller?.seller_id || seller?.id || null,
          company_id: seller?.company_id || null,
          name: seller?.company_name || seller?.name || null
        },
        seller_context: sellerContext,
        buyer: {
          id: company.buyer_company_id || company.id || null,
          name: company.legal_or_display_name || company.name || null,
          country: company.country || null,
          domain: company.domain || company.website || null
        },
        contact,
        product: product || { id: seller?.product_id || null, name: seller?.product_name || null },
        stage: null,
        status: 'READY_FOR_OUTREACH_APPROVAL',
        a2: {
          rank_score: candidate.rank_score,
          buyer_fit: result.buyer_fit || null,
          outreach: result.outreach,
          outreach_readiness: result.outreach_readiness
        },
        evidence_ids: evidence,
        created_at: timestamp,
        updated_at: timestamp
      };
    });
}
