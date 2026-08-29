import { createJsonClient } from './http.js';

const DEFAULT_BASE_URL = 'https://server.smartlead.ai/api/v1';

function requireKey(apiKey) {
  if (!apiKey) throw new Error('SMARTLEAD_API_KEY is required');
}

function sameId(left, right) {
  return left !== undefined && left !== null && right !== undefined && right !== null && String(left) === String(right);
}

function activityTime(activity = {}) {
  const value = activity.reply_details?.time || activity.sent_time || '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function activityWindow(replyEmailTime) {
  const base = Date.parse(replyEmailTime || '');
  const point = Number.isFinite(base) ? base : Date.now();
  return {
    eventTimeFrom: new Date(point - 7 * 86400000).toISOString(),
    eventTimeTo: new Date(point + 86400000).toISOString()
  };
}

export function createSmartleadProvider({
  apiKey = process.env.SMARTLEAD_API_KEY,
  baseUrl = process.env.SMARTLEAD_BASE_URL || DEFAULT_BASE_URL,
  replyMode = process.env.SMARTLEAD_REPLY_MODE || 'stats_id',
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000
} = {}) {
  const request = createJsonClient({ fetchImpl, timeoutMs });
  const authQuery = extra => ({ api_key: apiKey, ...(extra || {}) });
  const normalizedReplyMode = String(replyMode || 'stats_id').trim().toLowerCase();

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

  async function getAllLeadActivities({
    eventTimeFrom,
    eventTimeTo,
    offset = 0,
    limit = 100
  } = {}) {
    requireKey(apiKey);
    if (!eventTimeFrom) throw new Error('eventTimeFrom required');
    return request(`${baseUrl}/campaigns/all-leads-activities`, {
      method: 'GET',
      query: authQuery({
        event_time_from: eventTimeFrom,
        ...(eventTimeTo ? { event_time_to: eventTimeTo } : {}),
        offset: Math.max(Number(offset) || 0, 0),
        limit: Math.min(Math.max(Number(limit) || 100, 1), 1000)
      })
    });
  }

  async function resolveEmailStatsId({
    campaignId,
    leadId,
    replyMessageId,
    replyEmailTime,
    maxPages = 3,
    pageSize = 100
  } = {}) {
    requireKey(apiKey);
    if (!campaignId || !leadId) throw new Error('campaignId and leadId required');
    const window = activityWindow(replyEmailTime);
    const candidates = [];
    const safePages = Math.min(Math.max(Number(maxPages) || 1, 1), 10);
    const safePageSize = Math.min(Math.max(Number(pageSize) || 100, 1), 1000);

    for (let page = 0; page < safePages; page += 1) {
      const response = await getAllLeadActivities({
        ...window,
        offset: page * safePageSize,
        limit: safePageSize
      });
      const rows = Array.isArray(response?.data) ? response.data : [];
      for (const row of rows) {
        if (!sameId(row.campaign_id, campaignId) || !sameId(row.lead_id, leadId)) continue;
        for (const activity of Array.isArray(row.activities) ? row.activities : []) {
          if (!activity?.stats_id) continue;
          candidates.push(activity);
        }
      }
      if (!response?.hasMore || rows.length < safePageSize) break;
    }

    if (!candidates.length) return null;
    if (replyMessageId) {
      const replyMatch = candidates.find(activity => sameId(activity.reply_details?.message_id, replyMessageId));
      if (replyMatch?.stats_id) return String(replyMatch.stats_id);
      const messageMatch = candidates.find(activity => sameId(activity.message_id, replyMessageId));
      if (messageMatch?.stats_id) return String(messageMatch.stats_id);
    }

    const replied = candidates
      .filter(activity => activity.reply_details)
      .sort((a, b) => activityTime(b) - activityTime(a));
    const fallback = replied[0] || candidates.sort((a, b) => activityTime(b) - activityTime(a))[0];
    return fallback?.stats_id ? String(fallback.stats_id) : null;
  }

  async function replyEmailThread({
    campaignId,
    leadId,
    emailBody,
    replyMessageId,
    replyEmailTime = new Date().toISOString(),
    emailStatsId,
    addSignature = true
  } = {}) {
    requireKey(apiKey);
    if (!campaignId || !emailBody) throw new Error('campaignId and emailBody required');

    if (normalizedReplyMode === 'legacy') {
      if (!leadId || !replyMessageId) throw new Error('leadId and replyMessageId required in legacy reply mode');
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

    const resolvedStatsId = emailStatsId || await resolveEmailStatsId({
      campaignId,
      leadId,
      replyMessageId,
      replyEmailTime
    });
    if (!resolvedStatsId) {
      const error = new Error('Smartlead email_stats_id could not be resolved for reply');
      error.code = 'SMARTLEAD_EMAIL_STATS_ID_REQUIRED';
      throw error;
    }

    return request(`${baseUrl}/campaigns/${campaignId}/reply-email-thread`, {
      method: 'POST',
      query: authQuery(),
      body: {
        email_stats_id: String(resolvedStatsId),
        email_body: emailBody,
        add_signature: Boolean(addSignature),
        ...(replyMessageId ? { reply_message_id: replyMessageId } : {}),
        ...(replyEmailTime ? { reply_email_time: replyEmailTime } : {})
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
    getAllLeadActivities,
    resolveEmailStatsId,
    replyEmailThread,
    unsubscribeLead
  };
}

export { DEFAULT_BASE_URL as SMARTLEAD_BASE_URL };
