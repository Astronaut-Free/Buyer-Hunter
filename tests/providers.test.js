import test from 'node:test';
import assert from 'node:assert/strict';
import { createApolloProvider } from '../providers/apollo.js';
import { createTrademoProvider } from '../providers/trademo.js';
import { createSmartleadProvider } from '../providers/smartlead.js';

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } };
}

test('Apollo people search uses documented endpoint and query filters', async () => {
  const calls = [];
  const provider = createApolloProvider({ apiKey: 'test-key', fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse({ total_entries: 1, people: [{ id: 'p1', title: 'Procurement Manager' }] }); } });
  const result = await provider.searchPeople({ domain: 'https://www.example.com/', titles: ['Procurement Manager'], locations: ['US'], perPage: 5 });
  assert.equal(result.total_entries, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/mixed_people/api_search');
  assert.deepEqual(url.searchParams.getAll('person_titles[]'), ['Procurement Manager']);
  assert.deepEqual(url.searchParams.getAll('q_organization_domains_list[]'), ['example.com']);
  assert.equal(calls[0].options.headers['x-api-key'], 'test-key');
});

test('Apollo enrichment uses people match and does not reveal personal email or phone', async () => {
  const calls = [];
  const provider = createApolloProvider({ apiKey: 'test-key', fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse({ person: { id: 'p1', email: 'work@example.com' } }); } });
  await provider.enrichPerson({ id: 'p1', domain: 'example.com' });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/people/match');
  assert.equal(url.searchParams.get('id'), 'p1');
  assert.equal(url.searchParams.get('reveal_personal_emails'), 'false');
  assert.equal(url.searchParams.get('reveal_phone_number'), 'false');
});

test('Trademo provider maps documented buyer list request shape and keeps endpoint configurable', async () => {
  const calls = [];
  const provider = createTrademoProvider({ buyerListUrl: 'https://trade.example/buyers', apiKey: 'k', apiKeyHeader: 'x-demo-key', fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse({ totalCompanies: 1, companies: [{ companyId: 'c1', companyName: 'Buyer One', country: 'US', numberOfShipments: 9 }] }); } });
  const result = await provider.searchBuyers({ countries: ['US'], product_keywords: ['matcha'], hs_codes: ['0902'], countries_trading_with: ['China'] });
  assert.equal(result.companies[0].buyer_company_id, 'c1');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.companyRole, 'buyer');
  assert.deepEqual(body.companyCountryName, ['US']);
  assert.deepEqual(body.productKeywords, ['matcha']);
  assert.deepEqual(body.hsCodes, ['0902']);
  assert.equal(calls[0].options.headers['x-demo-key'], 'k');
});

test('Trademo refuses to invent endpoint when configuration is absent', async () => {
  const provider = createTrademoProvider({ buyerListUrl: '', fetchImpl: async () => jsonResponse({}) });
  await assert.rejects(() => provider.searchBuyers({ countries: ['US'] }), /TRADEMO_BUYER_LIST_URL/);
});

test('Smartlead reply uses documented endpoint, api_key query and thread payload', async () => {
  const calls = [];
  const provider = createSmartleadProvider({ apiKey: 'smart-key', fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse({ ok: true }); } });
  await provider.replyEmailThread({ campaignId: 12, leadId: 34, emailBody: '<p>Hello</p>', replyMessageId: 'msg-1', replyEmailTime: '2026-08-29T00:00:00.000Z' });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/campaigns/12/reply-email-thread');
  assert.equal(url.searchParams.get('api_key'), 'smart-key');
  assert.deepEqual(JSON.parse(calls[0].options.body), { lead_id: 34, email_body: '<p>Hello</p>', reply_message_id: 'msg-1', reply_email_time: '2026-08-29T00:00:00.000Z' });
});

test('Smartlead add leads keeps global unsubscribe/block protections enabled and requests returned lead IDs only when explicitly asked', async () => {
  const calls = [];
  const provider = createSmartleadProvider({ apiKey: 'smart-key', fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse({ success: true, added_count: 1, lead_ids: [789] }); } });
  await provider.addLeadsToCampaign({
    campaignId: 12,
    leads: [{ email: 'buyer@example.com' }],
    settings: { ignore_duplicate_leads_in_other_campaign: false, return_lead_ids: true }
  });
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.lead_list, [{ email: 'buyer@example.com' }]);
  assert.equal(body.settings.return_lead_ids, true);
  assert.equal(body.settings.ignore_duplicate_leads_in_other_campaign, false);
  assert.equal(body.settings.ignore_global_block_list, undefined);
  assert.equal(body.settings.ignore_unsubscribe_list, undefined);
});

test('Smartlead campaign sequence lookup uses documented endpoint', async () => {
  const calls = [];
  const provider = createSmartleadProvider({ apiKey: 'smart-key', fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse({ success: true, data: [{ seq_number: 1, subject: '{{qianpulse_subject}}', email_body: '{{qianpulse_body}}' }] }); } });
  await provider.getCampaignSequences({ campaignId: 12 });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/campaigns/12/sequences');
  assert.equal(url.searchParams.get('api_key'), 'smart-key');
  assert.equal(calls[0].options.method, 'GET');
});

test('Smartlead lead lookup by email uses documented endpoint', async () => {
  const calls = [];
  const provider = createSmartleadProvider({ apiKey: 'smart-key', fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse({ id: 789, email: 'buyer@example.com' }); } });
  const lead = await provider.getLeadByEmail({ email: 'buyer@example.com' });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/leads/');
  assert.equal(url.searchParams.get('api_key'), 'smart-key');
  assert.equal(url.searchParams.get('email'), 'buyer@example.com');
  assert.equal(lead.id, 789);
});
