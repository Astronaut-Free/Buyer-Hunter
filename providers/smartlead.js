import { createJsonClient } from './http.js';

const DEFAULT_BASE_URL = 'https://server.smartlead.ai/api/v1';

function requireKey(apiKey) {
  if (!apiKey) throw new Error('SMARTLEAD_API_KEY is required');
}

export function createSmartleadProvider({
  apiKey = process.env.SMARTLEAD_API_KEY,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000
} = {}) {
  const request = createJsonClient({ fetchImpl, timeoutMs });
  const authQuery = extra => ({ api_key: apiKey, ...(extra || {}) });

  async function addLeadsToCampaign({ campaignId, leads = [], settings = {} } = {}) {
    requireKey(apiKey);
    if (!campaignId) throw new Error('campaignId required');
    if (!Array.isArray(leads) || !leads.length) throw new Error('at least one lead required');
    if (leads.length > 400) throw new Error('Smartlead supports up to 400 leads per request');
    return request(`${baseUrl}/campaigns/${campaignId}/leads`, {
      method: 'POST',
      query: authQuery(),
      body: { lead_list: leads, settings }
    });
  }

  async function getCampaignSequences({ campaignId } = {}) {
    requireKey(apiKey);
    if (!campaignId) throw new Error('campaignId required');
    return request(`${baseUrl}/campaigns/${campaignId}/sequences`, {
      method: 'GET',
      query: authQuery()
    });
  }

  async function getLeadByEmail({ email } = {}) {
    requireKey(apiKey);
    if (!email) throw new Error('email required');
    return request(`${baseUrl}/leads/`, {
      method: 'GET',
      query: authQuery({ email })
    });
  }

  async function getMessageHistory({ campaignId, leadId } = {}) {
    requireKey(apiKey);
    if (!campaignId || !leadId) throw new Error('campaignId and leadId required');
    return request(`${baseUrl}/campaigns/${campaignId}/leads/${leadId}/message-history`, {
      method: 'GET',
      query: authQuery()
    });
  }

  async function replyEmailThread({ campaignId, leadId, emailBody, replyMessageId, replyEmailTime = new Date().toISOString() } = {}) {
    requireKey(apiKey);
    if (!campaignId || !leadId || !emailBody || !replyMessageId) throw new Error('campaignId, leadId, emailBody and replyMessageId required');
    return request(`${baseUrl}/campaigns/${campaignId}/reply-email-thread`, {
      method: 'POST',
      query: authQuery(),
      body: {
        lead_id: leadId,
        email_body: emailBody,
        reply_message_id: replyMessageId,
        reply_email_time: replyEmailTime
      }
    });
  }

  async function unsubscribeLead({ leadId } = {}) {
    requireKey(apiKey);
    if (!leadId) throw new Error('leadId required');
    return request(`${baseUrl}/leads/${leadId}/unsubscribe`, {
      method: 'POST',
      query: authQuery()
    });
  }

  return {
    addLeadsToCampaign,
    getCampaignSequences,
    getLeadByEmail,
    getMessageHistory,
    replyEmailThread,
    unsubscribeLead
  };
}

export { DEFAULT_BASE_URL as SMARTLEAD_BASE_URL };
