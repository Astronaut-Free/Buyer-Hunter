import { createJsonClient } from './http.js';

function normalizeCompany(company = {}) {
  const providerId = company.companyId || company.id || null;
  const matchedProductKeywords = company.matchedProductKeyword || [];
  const matchedHsCodes = company.matchedHsCodes || [];
  const productMatched = matchedProductKeywords.length > 0 || matchedHsCodes.length > 0;
  const companyEvidence = providerId ? [`trademo:company:${providerId}`] : [];
  const productEvidence = productMatched && providerId ? [`trademo:company:${providerId}:product-match`] : [];
  const tradeEvidence = Number(company.numberOfShipments || 0) > 0 && providerId ? [`trademo:company:${providerId}:trade`] : [];
  const website = company.website || company.websiteUrl || company.companyWebsite || company.domain || '';
  return {
    buyer_company_id: providerId,
    legal_or_display_name: company.companyName || company.name || '',
    country: company.country || '',
    state: company.state || '',
    city: company.city || '',
    address: company.addressList || company.address || '',
    domain: company.domain || website,
    website,
    number_of_shipments: company.numberOfShipments ?? null,
    shipment_value: company.shipmentValue ?? null,
    matched_product_keywords: matchedProductKeywords,
    matched_hs_codes: matchedHsCodes,
    trading_partner_count: company.tradingPartnerCount ?? null,
    sells_or_uses_product: productMatched ? true : undefined,
    evidence_refs: companyEvidence,
    product_evidence: productEvidence,
    trade_evidence: tradeEvidence,
    provider: 'trademo',
    provider_company_id: providerId,
    raw: company
  };
}

export function createTrademoProvider({
  buyerListUrl = process.env.TRADEMO_BUYER_LIST_URL,
  apiKey = process.env.TRADEMO_API_KEY,
  apiKeyHeader = process.env.TRADEMO_API_KEY_HEADER,
  apiKeyPrefix = process.env.TRADEMO_API_KEY_PREFIX || '',
  extraHeaders = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = 20000
} = {}) {
  const request = createJsonClient({ fetchImpl, timeoutMs });

  function headers() {
    const auth = apiKey && apiKeyHeader ? { [apiKeyHeader]: `${apiKeyPrefix}${apiKey}` } : {};
    return { ...extraHeaders, ...auth };
  }

  async function searchBuyers({
    countries = [],
    product_keywords = [],
    hs_codes = [],
    exclude_countries = [],
    exclude_product_keywords = [],
    exclude_hs_codes = [],
    countries_trading_with = [],
    from_date,
    to_date,
    page_size = 20,
    page_number = 1,
    company_role = 'buyer'
  } = {}) {
    if (!buyerListUrl) throw new Error('TRADEMO_BUYER_LIST_URL is required');
    const body = {
      companyRole: company_role,
      companyCountryName: countries,
      excludeCompanyCountryName: exclude_countries,
      productKeywords: product_keywords,
      excludeProductKeywords: exclude_product_keywords,
      hsCodes: hs_codes,
      excludeHSCodes: exclude_hs_codes,
      countriesTradingWithList: countries_trading_with,
      ...(from_date || to_date ? { tradeTimePeriod: { ...(from_date ? { fromDate: from_date } : {}), ...(to_date ? { toDate: to_date } : {}) } } : {}),
      pageSize: Math.min(Math.max(Number(page_size) || 20, 1), 100),
      pageNumber: Math.max(Number(page_number) || 1, 1),
      sort: { field: 'numberOfShipments', direction: 'desc' }
    };
    const data = await request(buyerListUrl, { method: 'POST', headers: headers(), body });
    const companies = Array.isArray(data?.companies) ? data.companies.map(normalizeCompany) : [];
    return { total_companies: Number(data?.totalCompanies || companies.length), companies, provider: 'trademo' };
  }

  return { searchBuyers };
}
