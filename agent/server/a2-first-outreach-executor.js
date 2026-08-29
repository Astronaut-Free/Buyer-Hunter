function hasTemplateTokens(sequencePayload) {
  const text = JSON.stringify(sequencePayload || {});
  return text.includes('{{qianpulse_subject}}') && text.includes('{{qianpulse_body}}');
}

function draftFromPayload(payload = {}) {
  const draft = payload?.draft || {};
  return {
    subject: String(draft.subject || '').trim(),
    content: String(draft.content || '').trim()
  };
}

function firstLeadId(result = {}) {
  const values = [
    result?.lead_ids?.[0],
    result?.data?.lead_ids?.[0],
    result?.data?.[0]?.lead_id,
    result?.data?.[0]?.id,
    result?.lead_id,
    result?.id
  ];
  return values.find(value => value !== undefined && value !== null && value !== '') || null;
}

function externalActionStore(state) {
  state.external_action_idempotency ||= {};
  state.external_actions ||= {};
  return state.external_action_idempotency;
}

export function createA2FirstOutreachExecutor({
  getState,
  onMutate = () => {},
  smartlead,
  opportunityStore,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof getState !== 'function') throw new Error('getState required');
  if (!opportunityStore?.get || !opportunityStore?.bindExternalRef) throw new Error('opportunityStore required');

  return async function executeA2FirstOutreach({ approvalId, user, status, editedPayload } = {}) {
    const state = getState();
    state.approvals ||= {};
    const idem = `approval:${approvalId}:a2-first-outreach`;
    const idemStore = externalActionStore(state);

    if (!user || user.role !== 'INTERNAL') return { status: 403, body: { code: 'INTERNAL_REQUIRED' } };
    const approval = state.approvals[approvalId];
    if (!approval) return { status: 404, body: { code: 'APPROVAL_NOT_FOUND' } };
    if (approval.action_type !== 'A2_OUTREACH_DRAFT') return { status: 409, body: { code: 'APPROVAL_ACTION_MISMATCH' } };
    if (!['APPROVED', 'EDITED', 'REJECTED'].includes(status)) return { status: 400, body: { code: 'INVALID_APPROVAL_STATUS' } };

    if (idemStore[idem]) {
      return { status: 200, body: { approval, execution: { ...idemStore[idem], replayed: true } }, replayed: true };
    }

    approval.status = status;
    approval.approved_by = user.id;
    approval.approved_at = now();
    if (status === 'EDITED' && editedPayload) approval.payload = editedPayload;

    if (status === 'REJECTED') {
      const execution = { executed: false, status: 'REJECTED', updated_at: now() };
      idemStore[idem] = execution;
      state.external_actions[idem] = execution;
      approval.execution_status = 'REJECTED';
      onMutate();
      return { status: 200, body: { approval, execution } };
    }

    if (!smartlead?.getCampaignSequences || !smartlead?.addLeadsToCampaign || !smartlead?.getLeadByEmail) {
      return { status: 503, body: { code: 'SMARTLEAD_PROVIDER_REQUIRED' } };
    }

    const transport = approval.payload?.transport || {};
    const lead = transport.lead || {};
    const draft = draftFromPayload(approval.payload);
    if (transport.provider !== 'smartlead') return { status: 422, body: { code: 'SMARTLEAD_TRANSPORT_REQUIRED' } };
    if (!transport.campaign_id) return { status: 422, body: { code: 'SMARTLEAD_CAMPAIGN_REQUIRED' } };
    if (!lead.email) return { status: 422, body: { code: 'LEAD_EMAIL_REQUIRED' } };
    if (!draft.subject || !draft.content) return { status: 422, body: { code: 'OUTREACH_DRAFT_REQUIRED' } };

    const opportunity = opportunityStore.get(approval.opportunity_id);
    if (!opportunity) return { status: 422, body: { code: 'OPPORTUNITY_REQUIRED' } };

    try {
      const sequences = await smartlead.getCampaignSequences({ campaignId: transport.campaign_id });
      if (!hasTemplateTokens(sequences)) {
        const execution = { executed: false, status: 'CAMPAIGN_TEMPLATE_INVALID', required_tokens: ['{{qianpulse_subject}}', '{{qianpulse_body}}'], updated_at: now() };
        state.external_actions[idem] = execution;
        approval.execution_status = execution.status;
        onMutate();
        return { status: 422, body: { approval, execution } };
      }

      const customFields = {
        ...(lead.custom_fields || {}),
        qianpulse_opportunity_id: opportunity.id,
        qianpulse_subject: draft.subject,
        qianpulse_body: draft.content
      };
      const addResult = await smartlead.addLeadsToCampaign({
        campaignId: transport.campaign_id,
        leads: [{
          email: lead.email,
          first_name: lead.first_name || '',
          last_name: lead.last_name || '',
          company_name: lead.company_name || opportunity.buyer?.name || '',
          custom_fields: customFields
        }],
        settings: {
          ignore_duplicate_leads_in_other_campaign: false,
          return_lead_ids: true
        }
      });

      let leadId = firstLeadId(addResult);
      if (!leadId) {
        const lookup = await smartlead.getLeadByEmail({ email: lead.email });
        leadId = firstLeadId(lookup);
      }
      if (!leadId) {
        const execution = { executed: false, status: 'SMARTLEAD_LEAD_ID_REQUIRED', updated_at: now() };
        state.external_actions[idem] = execution;
        approval.execution_status = execution.status;
        onMutate();
        return { status: 502, body: { approval, execution } };
      }

      opportunityStore.bindExternalRef({
        opportunityId: opportunity.id,
        provider: 'smartlead',
        kind: 'lead',
        externalId: leadId,
        metadata: {
          campaign_id: transport.campaign_id,
          email: lead.email,
          approval_id: approvalId
        }
      });

      opportunity.status = 'OUTREACH_QUEUED';
      opportunity.outreach = {
        provider: 'smartlead',
        campaign_id: transport.campaign_id,
        lead_id: String(leadId),
        approval_id: approvalId,
        queued_at: now()
      };
      opportunity.updated_at = now();

      const execution = {
        executed: true,
        status: 'QUEUED_IN_SMARTLEAD',
        provider: 'smartlead',
        campaign_id: transport.campaign_id,
        lead_id: String(leadId),
        email: lead.email,
        updated_at: now()
      };
      idemStore[idem] = execution;
      state.external_actions[idem] = execution;
      approval.execution_status = execution.status;
      approval.external_ref = `smartlead:lead:${leadId}`;
      onMutate();
      return { status: 200, body: { approval, execution, opportunity } };
    } catch (error) {
      const execution = { executed: false, status: 'EXECUTION_ERROR', error: error.message, updated_at: now() };
      state.external_actions[idem] = execution;
      approval.execution_status = 'ERROR';
      onMutate();
      return { status: 502, body: { approval, execution } };
    }
  };
}
