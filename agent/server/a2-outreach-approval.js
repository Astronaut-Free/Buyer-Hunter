function fullNameParts(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

export function createA2OutreachApprovals({
  state,
  run,
  opportunities = [],
  campaignId,
  id,
  now = () => new Date().toISOString(),
  requestedBy
} = {}) {
  if (!state || !run || typeof id !== 'function') throw new Error('state, run and id required');
  state.approvals ||= {};
  const approvals = [];

  for (const opportunity of opportunities) {
    const draft = opportunity?.a2?.outreach;
    const contact = opportunity?.contact || opportunity?.a2?.contact || {};
    if (opportunity?.status !== 'READY_FOR_OUTREACH_APPROVAL' || !draft || !contact.work_email) continue;

    const existing = Object.values(state.approvals).find(item =>
      item.action_type === 'A2_OUTREACH_DRAFT' &&
      item.opportunity_id === opportunity.id &&
      ['PENDING', 'APPROVED', 'EDITED'].includes(item.status)
    );
    if (existing) {
      approvals.push(existing);
      opportunity.outreach_approval_id = existing.approval_id;
      continue;
    }

    const names = fullNameParts(contact.name);
    const approval = {
      approval_id: id('approval'),
      opportunity_id: opportunity.id,
      run_id: run.run_id,
      action_type: 'A2_OUTREACH_DRAFT',
      payload: {
        draft,
        transport: {
          provider: 'smartlead',
          campaign_id: campaignId || null,
          lead: {
            email: contact.work_email,
            first_name: contact.first_name || names.first_name,
            last_name: contact.last_name || names.last_name,
            company_name: opportunity.buyer?.name || '',
            custom_fields: {
              qianpulse_opportunity_id: opportunity.id
            }
          }
        }
      },
      risk_summary: '首次主动触达，需要人工确认收件人、证据与外联文案。',
      status: 'PENDING',
      requested_by: requestedBy || run.actor_id || 'QIANPULSE_AGENT',
      approved_by: null,
      created_at: now(),
      approved_at: null
    };
    state.approvals[approval.approval_id] = approval;
    opportunity.outreach_approval_id = approval.approval_id;
    approvals.push(approval);
  }

  return approvals;
}
