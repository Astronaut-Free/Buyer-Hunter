import { agentApi } from '../api-client.js';
import { navigate } from '../router.js';
import {
  renderApprovalPanel,
  renderBuyerProfile,
  renderConversationTimeline,
  renderDemandCard,
  renderEvidencePanel,
  renderMarketAccessPanel,
  renderNextActionPanel,
  renderOutcomePlaybookPanel,
  renderSignalTimeline,
  renderSupplierGraph,
} from '../components/index.js';
import { el } from '../shared/dom.js';
import { errorState, loading, metric, pageRoot } from './page-utils.js';

function whyNowSignals(workspace) {
  return (workspace.why_now || []).map((summary, index) => ({
    signal_id: `why-now-${index + 1}`,
    signal_type: 'UNKNOWN',
    label: 'Why Now',
    summary,
    source: workspace.opportunity?.source || 'Opportunity Intelligence',
    confidence: workspace.score?.truth ?? null,
    related_product: workspace.opportunity?.fields?.product || workspace.opportunity?.product || null,
  }));
}

function approvalHandlers(reload) {
  const submit = async (approval, status, editedPayload) => {
    await agentApi.approve(approval.id || approval.approval_id, {
      status,
      ...(editedPayload ? { edited_payload: editedPayload } : {}),
    });
    await reload();
  };
  return {
    onApprove: approval => submit(approval, 'APPROVED'),
    onReject: approval => submit(approval, 'REJECTED'),
    onEdit: async approval => {
      const initial = approval.payload?.content || approval.payload?.draft?.content || '';
      const edited = window.prompt('编辑后批准', initial);
      if (edited === null) return;
      await submit(approval, 'APPROVED', { ...(approval.payload || {}), content: edited });
    },
  };
}

export async function renderOpportunityWorkspacePage({ route } = {}) {
  const opportunityId = route?.params?.id;
  const root = pageRoot('商机工作台', `围绕 Opportunity ${opportunityId || 'UNKNOWN'} 持续判断、行动、对话和成交。`);
  const body = el('div', { className: 'qp-v2-page-body' }, [loading()]);
  root.appendChild(body);

  const load = async () => {
    body.replaceChildren(loading('正在读取 Opportunity Workspace 聚合状态。'));
    try {
      const workspace = await agentApi.workspace(opportunityId);
      const opportunity = workspace.opportunity || {};
      const score = workspace.score || {};
      const metrics = el('div', { className: 'qp-v2-page-metrics' }, [
        metric('商机分', score.opportunity ?? score.rank ?? '—', opportunity.decision || 'Decision UNKNOWN'),
        metric('供需匹配', score.fit ?? '—', 'Seller Fit'),
        metric('采购意向', score.intent ?? '—', 'A6 Intent'),
        metric('阶段', opportunity.stage || 'UNKNOWN', opportunity.status || 'Status UNKNOWN'),
      ]);

      const primary = el('div', { className: 'qp-v2-workspace-grid' }, [
        renderSignalTimeline(whyNowSignals(workspace), { title: 'Why Now / 采购信号' }),
        renderNextActionPanel(workspace, {
          onExecute: () => navigate('conversation', { id: opportunityId }),
          onReviewApproval: () => document.querySelector('[data-qp-v2-approval-anchor]')?.scrollIntoView({ behavior: 'smooth' }),
        }),
        renderDemandCard({ opportunity, evidence_refs: workspace.evidence?.refs || [] }),
        renderBuyerProfile({ buyer: opportunity.buyer, evidence: workspace.evidence }),
        renderSupplierGraph(workspace.supplier_intelligence || workspace.supply_match || {}),
        renderMarketAccessPanel(workspace.market_access || {}),
        renderEvidencePanel(workspace.evidence || {}),
        renderConversationTimeline(workspace.activity || {}),
      ]);

      const approvalWrap = el('div', { dataset: { qpV2ApprovalAnchor: '' } }, [
        renderApprovalPanel(workspace, approvalHandlers(load)),
      ]);
      const closing = renderOutcomePlaybookPanel(workspace);

      body.replaceChildren(metrics, primary, approvalWrap, closing);
    } catch (error) {
      body.replaceChildren(errorState(error, load));
    }
  };

  await load();
  return root;
}
