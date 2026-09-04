import { agentApi } from '../api-client.js';
import { navigate } from '../router.js';
import { renderOpportunityCard } from '../components/index.js';
import { el } from '../shared/dom.js';
import { emptyState, errorState, loading, pageRoot, sectionGrid } from './page-utils.js';

function matches(item, query) {
  if (!query) return true;
  const text = [
    item.buyer?.name,
    item.buyer?.market,
    item.fields?.product,
    item.fields?.demand_title,
    item.decision,
    item.status,
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes(query.toLowerCase());
}

export async function renderOpportunityRadarPage() {
  const root = pageRoot('全球机会雷达', '把公开需求、主动开发与经营中的 Opportunity 放进同一个优先级视图。');
  const body = el('div', { className: 'qp-v2-page-body' }, [loading()]);
  root.appendChild(body);

  const load = async () => {
    body.replaceChildren(loading());
    try {
      const rows = await agentApi.opportunities();
      const items = Array.isArray(rows) ? rows : [];
      const toolbar = el('div', { className: 'qp-v2-radar-toolbar' });
      const input = el('input', {
        className: 'qp-v2-input qp-v2-focus-ring',
        attrs: { type: 'search', placeholder: '搜索买家、产品、市场、状态' },
      });
      const count = el('span', { className: 'qp-v2-muted' });
      toolbar.append(input, count);

      const grid = sectionGrid('qp-v2-radar-grid');
      const paint = () => {
        grid.replaceChildren();
        const filtered = items
          .filter(item => matches(item, input.value.trim()))
          .sort((a, b) => Number(b.opportunity_score || b.a2?.rank_score || 0) - Number(a.opportunity_score || a.a2?.rank_score || 0));
        count.textContent = `${filtered.length} 条 Opportunity`;
        if (!filtered.length) {
          grid.appendChild(emptyState('没有匹配结果', '调整搜索条件，或创建新的 BD Mission。'));
          return;
        }
        filtered.forEach(item => grid.appendChild(renderOpportunityCard(item, {
          onOpen: opportunity => navigate('workspace', { id: opportunity.id }),
        })));
      };
      input.addEventListener('input', paint);
      paint();

      body.replaceChildren(toolbar, grid);
    } catch (error) {
      body.replaceChildren(errorState(error, load));
    }
  };

  await load();
  return root;
}
