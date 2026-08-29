import { createOpportunityWorkspace } from './opportunity-workspace.js';

export function createOpportunityWorkspaceHandler({ getState, canAccess } = {}) {
  if (typeof getState !== 'function') throw new Error('getState required');
  if (typeof canAccess !== 'function') throw new Error('canAccess required');

  return function getOpportunityWorkspace({ opportunityId, user } = {}) {
    if (!user) return { status: 401, body: { code: 'AUTH_REQUIRED', error: '请先登录' } };
    if (!opportunityId) return { status: 400, body: { code: 'OPPORTUNITY_ID_REQUIRED' } };

    const state = getState();
    const opportunity = state?.opportunities?.[opportunityId];
    if (!opportunity) return { status: 404, body: { code: 'OPPORTUNITY_NOT_FOUND' } };
    if (!canAccess(user, opportunity)) return { status: 403, body: { code: 'FORBIDDEN', error: '无权查看这笔 Opportunity' } };

    const workspace = createOpportunityWorkspace({
      state,
      opportunityId,
      role: user.role
    });
    return { status: 200, body: workspace };
  };
}
