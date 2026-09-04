import { agentApi } from '../api-client.js';
import { navigate } from '../router.js';
import { renderBuyerProfile, renderEvidencePanel, renderSupplierGraph } from '../components/index.js';
import { el } from '../shared/dom.js';
import { button, errorState, loading, pageRoot, unknownState } from './page-utils.js';

export async function renderBuyerIntelligencePage({ route } = {}) {
  const buyerId = route?.params?.id;
  const root = pageRoot('买家情报', `Buyer ${buyerId || 'UNKNOWN'} 的企业、联系人、采购与供应链情报。`);
  const body = el('div', { className: 'qp-v2-page-body' }, [loading()]);
  root.appendChild(body);

  const load = async () => {
    body.replaceChildren(loading('正在定位该 Buyer 的 Opportunity 上下文。'));
    try {
      const rows = await agentApi.opportunities();
      const opportunity = (Array.isArray(rows) ? rows : []).find(item => String(item.buyer?.id || '') === String(buyerId || ''));
      if (!opportunity) {
        body.replaceChildren(unknownState('Buyer 尚未绑定 Opportunity', '当前 Agent API 没有独立 Buyer Intelligence endpoint，保持 UNKNOWN，等待 Buyer Contract 的服务端 projection。'));
        return;
      }
      const workspace = await agentApi.workspace(opportunity.id);
      const actions = el('div', { className: 'qp-v2-page-actions' }, [
        button('打开商机工作台', () => navigate('workspace', { id: opportunity.id })),
        button('查看沟通推进', () => navigate('conversation', { id: opportunity.id }), { secondary: true }),
      ]);
      body.replaceChildren(actions, el('div', { className: 'qp-v2-workspace-grid' }, [
        renderBuyerProfile({
          buyer: workspace.opportunity?.buyer || opportunity.buyer,
          procurement_intelligence: workspace.buyer_intelligence?.procurement_intelligence,
          contacts: workspace.buyer_intelligence?.contacts,
          business_events: workspace.buyer_intelligence?.business_events,
          evidence: workspace.evidence,
        }),
        renderSupplierGraph(workspace.supplier_intelligence || {}),
        renderEvidencePanel(workspace.evidence || {}),
      ]));
    } catch (error) {
      body.replaceChildren(errorState(error, load));
    }
  };

  await load();
  return root;
}
