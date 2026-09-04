import { agentApi } from '../api-client.js';
import { renderOutcomePlaybookPanel } from '../components/index.js';
import { el } from '../shared/dom.js';
import { emptyState, errorState, loading, pageRoot } from './page-utils.js';

function hasOutcome(workspace) {
  const outcome = workspace?.outcome || workspace?.a6?.outcome;
  const stage = outcome?.stage || outcome?.outcome || outcome?.status;
  return ['WON', 'LOST', 'STOPPED'].includes(String(stage || '').toUpperCase());
}

export async function renderPlaybookPage() {
  const root = pageRoot('成交与复盘', '把已经结束的 Opportunity 变成可验证、可复用的经营经验。');
  const body = el('div', { className: 'qp-v2-page-body' }, [loading()]);
  root.appendChild(body);

  const load = async () => {
    body.replaceChildren(loading('正在读取成交结果与复盘输入。'));
    try {
      const rows = await agentApi.opportunities();
      const items = Array.isArray(rows) ? rows.slice(0, 30) : [];
      const settled = await Promise.allSettled(items.map(item => agentApi.workspace(item.id)));
      const workspaces = settled
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)
        .filter(hasOutcome);

      if (!workspaces.length) {
        body.replaceChildren(emptyState('暂无可复盘 Outcome', 'WON / LOST / STOPPED 产生后进入这里；进行中的商机继续留在工作台。'));
        return;
      }

      const list = el('div', { className: 'qp-v2-playbook-list' });
      workspaces.forEach(workspace => {
        const wrapper = el('section', { className: 'qp-v2-playbook-case' }, [
          el('header', { className: 'qp-v2-playbook-case-head' }, [
            el('div', {}, [
              el('strong', { text: workspace.opportunity?.buyer?.name || 'Buyer UNKNOWN' }),
              el('span', { text: `${workspace.opportunity?.fields?.product || workspace.opportunity?.product || 'Product UNKNOWN'} · ${workspace.opportunity?.id || ''}` }),
            ]),
          ]),
          renderOutcomePlaybookPanel(workspace),
        ]);
        list.appendChild(wrapper);
      });
      body.replaceChildren(list);
    } catch (error) {
      body.replaceChildren(errorState(error, load));
    }
  };

  await load();
  return root;
}
