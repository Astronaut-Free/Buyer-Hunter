import { agentApi } from '../api-client.js';
import { navigate } from '../router.js';
import { renderOpportunityCard } from '../components/index.js';
import { el } from '../shared/dom.js';
import { emptyState, errorState, loading, metric, pageRoot, sectionGrid } from './page-utils.js';

function terminalStage(item) {
  return ['WON', 'LOST', 'STOPPED'].includes(String(item.stage || '').toUpperCase());
}

function pending(item) {
  return ['WAITING_EVIDENCE', 'READY_FOR_OUTREACH_APPROVAL', 'WAITING_APPROVAL'].includes(String(item.status || '').toUpperCase());
}

export async function renderDashboardPage() {
  const root = pageRoot('商机驾驶舱', '今天先处理最值得推进、最需要人工介入的商机。');
  const body = el('div', { className: 'qp-v2-page-body' }, [loading()]);
  root.appendChild(body);

  const load = async () => {
    body.replaceChildren(loading());
    try {
      const rows = await agentApi.opportunities();
      const items = Array.isArray(rows) ? rows : [];
      const active = items.filter(item => !terminalStage(item));
      const waiting = active.filter(pending);
      const replied = active.filter(item => item.a6?.buyer_reply || item.conversation_score > 0);
      const won = items.filter(item => String(item.stage || '').toUpperCase() === 'WON');

      const metrics = el('div', { className: 'qp-v2-page-metrics' }, [
        metric('活跃商机', String(active.length), '持续经营中'),
        metric('待处理', String(waiting.length), '审批 / 补证 / 人工'),
        metric('已有对话', String(replied.length), '存在回复或沟通分'),
        metric('已成交', String(won.length), 'WON'),
      ]);

      const grid = sectionGrid('qp-v2-dashboard-opportunities');
      const sorted = [...active].sort((a, b) => Number(b.opportunity_score || b.a2?.rank_score || 0) - Number(a.opportunity_score || a.a2?.rank_score || 0));
      sorted.slice(0, 6).forEach(item => grid.appendChild(renderOpportunityCard(item, {
        onOpen: opportunity => navigate('workspace', { id: opportunity.id }),
      })));

      body.replaceChildren(metrics);
      body.appendChild(el('section', { className: 'qp-v2-page-section' }, [
        el('header', { className: 'qp-v2-page-section-head' }, [
          el('div', {}, [el('h2', { text: '优先推进' }), el('p', { text: '按当前 Opportunity / Runtime 分数排序。' })]),
        ]),
        sorted.length ? grid : emptyState('暂无活跃商机', '先从全球机会雷达或 BD Mission 创建新的经营对象。'),
      ]));
    } catch (error) {
      body.replaceChildren(errorState(error, load));
    }
  };

  await load();
  return root;
}
