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
  assert.equal(result.companies[0].buyer_company_id, null);
  assert.equal(result.companies[0].external_ids.trademo, 'c1');
  assert.equal(result.companies[0].buyer_type, 'UNKNOWN');
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

test('Smartlead resolves email_stats_id from lead activities then uses current reply contract', async () => {
  const calls = [];
  const provider = createSmartleadProvider({
    apiKey: 'smart-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const parsed = new URL(url);
      if (parsed.pathname === '/api/v1/campaigns/all-leads-activities') {
        return jsonResponse({
          data: [{
            lead_id: 34,
            campaign_id: 12,
            activities: [{
              stats_id: 7788,
              message_id: 'sent-1',
              sent_time: '2026-08-28T23:00:00.000Z',
              reply_details: {
                message_id: 'msg-1',
                time: '2026-08-29T00:00:00.000Z',
                reply_email_body: 'Interested'
              }
            }]
          }],
          hasMore: false
        });
      }
      return jsonResponse({ success: true, message: 'Reply sent successfully' });
    }
  });

  await provider.replyEmailThread({ campaignId: 12, leadId: 34, emailBody: '<p>Hello</p>', replyMessageId: 'msg-1', replyEmailTime: '2026-08-29T00:00:00.000Z' });

  assert.equal(calls.length, 2);
  const activityUrl = new URL(calls[0].url);
  assert.equal(activityUrl.pathname, '/api/v1/campaigns/all-leads-activities');
  assert.equal(activityUrl.searchParams.get('api_key'), 'smart-key');
  assert.ok(activityUrl.searchParams.get('event_time_from'));
  assert.ok(activityUrl.searchParams.get('event_time_to'));

  const replyUrl = new URL(calls[1].url);
  assert.equal(replyUrl.pathname, '/api/v1/campaigns/12/reply-email-thread');
  assert.equal(replyUrl.searchParams.get('api_key'), 'smart-key');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    email_stats_id: '7788',
    email_body: '<p>Hello</p>',
    add_signature: true,
    reply_message_id: 'msg-1',
    reply_email_time: '2026-08-29T00:00:00.000Z'
  });
});

test('Smartlead email_stats_id resolver matches campaign, lead and reply message across paged activities', async () => {
  const calls = [];
  const provider = createSmartleadProvider({
    apiKey: 'smart-key',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const offset = Number(new URL(url).searchParams.get('offset'));
      if (offset === 0) {
        return jsonResponse({
          data: [{ lead_id: 99, campaign_id: 12, activities: [{ stats_id: 1, reply_details: { message_id: 'other' } }] }],
          hasMore: true
        });
      }
      return jsonResponse({
        data: [{
          lead_id: 34,
          campaign_id: 12,
          activities: [{ stats_id: 9901, reply_details: { message_id: 'reply-target', time: '2026-08-29T00:00:00Z' } }]
        }],
        hasMore: false
      });
    }
  });

  const statsId = await provider.resolveEmailStatsId({ campaignId: 12, leadId: 34, replyMessageId: 'reply-target', replyEmailTime: '2026-08-29T00:00:00Z', pageSize: 1 });
  assert.equal(statsId, '9901');
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1].url).searchParams.get('offset'), '1');
});

test('Smartlead current reply mode fails closed when email_stats_id cannot be resolved', async () => {
  const provider = createSmartleadProvider({
    apiKey: 'smart-key',
    fetchImpl: async () => jsonResponse({ data: [], hasMore: false })
  });
  await assert.rejects(
    () => provider.replyEmailThread({ campaignId: 12, leadId: 34, emailBody: 'Hello', replyMessageId: 'missing', replyEmailTime: '2026-08-29T00:00:00Z' }),
    error => error.code === 'SMARTLEAD_EMAIL_STATS_ID_REQUIRED'
  );
});

test('Smartlead legacy reply contract remains available only when explicitly configured', async () => {
  const calls = [];
  const provider = createSmartleadProvider({
    apiKey: 'smart-key',
    replyMode: 'legacy',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return jsonResponse({ ok: true }); }
  });
  await provider.replyEmailThread({ campaignId: 12, leadId: 34, emailBody: '<p>Hello</p>', replyMessageId: 'msg-1', replyEmailTime: '2026-08-29T00:00:00.000Z' });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    lead_id: 34,
    email_body: '<p>Hello</p>',
    reply_message_id: 'msg-1',
    reply_email_time: '2026-08-29T00:00:00.000Z'
  });
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
