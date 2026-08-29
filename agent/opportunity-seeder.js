function now(value) {
  return value || new Date().toISOString();
}

export function createOpportunitySeeds({ batchResult, seller, product, createdAt } = {}) {
  if (!batchResult || !Array.isArray(batchResult.opportunity_candidates)) return [];
  const timestamp = now(createdAt);
  return batchResult.opportunity_candidates
    .filter(candidate => candidate.buyer_fit?.decision === 'FIT_QUALIFIED' && candidate.envelope?.domain_result?.outreach)
    .flatMap((candidate, index) => {
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
      const sellerId = seller?.seller_id || seller?.id || 'seller';
      const productContext = product || result.target_definition?.product_context || { id: seller?.product_id || null, name: seller?.product_name || null };
      const productId = productContext?.product_id || productContext?.id || seller?.product_id || 'product';
      const buyerKey = company.buyer_company_key || candidate.buyer_company_key || company.buyer_company_id || company.id;
      const markets = result.target_definition?.countries || batchResult.target_definition?.countries || [company.country || 'market'];
      return markets.map(targetMarket => ({
        seed_key: `a2:${sellerId}:${productId}:${String(targetMarket).toUpperCase()}:${buyerKey || index}`,
        development_context_id: `a2ctx:${sellerId}:${productId}:${String(targetMarket).toUpperCase()}:${buyerKey || index}`,
        source: 'A2_PROACTIVE_BUYER_DEVELOPMENT',
        seller: {
          id: seller?.seller_id || seller?.id || null,
          company_id: seller?.company_id || null,
          name: seller?.company_name || seller?.name || null
        },
        seller_context: sellerContext,
        buyer: {
          id: buyerKey || null,
          buyer_company_key: buyerKey || null,
          external_ids: company.external_ids || {},
          name: company.legal_or_display_name || company.name || null,
          country: company.country || null,
          domain: company.domain || company.website || null
        },
        contact,
        product: { ...productContext, id: productContext?.id || productContext?.product_id || seller?.product_id || null, name: productContext?.name || productContext?.product_name || seller?.product_name || null },
        target_market: targetMarket,
        stage: null,
        status: candidate.readiness === 'READY' ? 'READY_FOR_OUTREACH_APPROVAL' : 'READY_FOR_DRAFT',
        a2: {
          lifecycle_status: candidate.readiness === 'READY' ? 'READY_FOR_APPROVAL' : 'FIT_QUALIFIED',
          outreach_state: 'DRAFT',
          followup: { send_count: 0, outreach_round: 1, max_send_count: 3, next_eligible_at: null },
          rank_score: candidate.rank_score,
          buyer_fit: result.buyer_fit || null,
          outreach: result.outreach,
          outreach_readiness: result.outreach_readiness
        },
        evidence_ids: evidence,
        created_at: timestamp,
        updated_at: timestamp
      }));
    });
}
