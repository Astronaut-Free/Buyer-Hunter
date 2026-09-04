import { el, formatDateTime, textOrUnknown, toneForStatus } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

function array(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeOutcomePlaybook(input = {}) {
  const outcome = input.outcome || input.a6?.outcome || {};
  const playbook = input.playbook || input.learning || {};
  return {
    stage: outcome.stage || outcome.outcome || outcome.status || null,
    reason: outcome.reason || null,
    reportedAt: outcome.reported_at || outcome.created_at || null,
    source: outcome.source || null,
    winningSignals: array(playbook.winning_signals || input.winning_signals),
    losingSignals: array(playbook.losing_signals || input.losing_signals),
    channelLearnings: array(playbook.channel_learnings || input.channel_learnings),
    messageLearnings: array(playbook.message_learnings || input.message_learnings),
    reusableActions: array(playbook.reusable_actions || input.reusable_actions),
  };
}

function learningList(title, rows, emptyText) {
  const section = el('section', { className: 'qp-v2-playbook-section' }, [el('h4', { text: title })]);
  if (!rows.length) {
    section.appendChild(el('p', { className: 'qp-v2-muted', text: emptyText }));
    return section;
  }
  const list = el('ul');
  rows.forEach(item => {
    const text = typeof item === 'string' ? item : (item.summary || item.label || item.reason || JSON.stringify(item));
    list.appendChild(el('li', { text }));
  });
  section.appendChild(list);
  return section;
}

export function renderOutcomePlaybookPanel(input = {}, { title = '成交与复盘' } = {}) {
  const data = normalizeOutcomePlaybook(input);
  const panel = el('section', { className: 'qp-v2-card qp-v2-playbook-panel' });
  const hasOutcome = Boolean(data.stage);

  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: 'Outcome 进入复盘输入；只沉淀有证据支撑的信号、渠道和话术经验。' }),
    ]),
    el('span', {
      className: 'qp-v2-tag',
      text: data.stage || 'OPEN',
      dataset: { tone: toneForStatus(data.stage || 'PENDING') },
    }),
  ]));

  if (!hasOutcome) {
    panel.appendChild(renderViewState({
      status: ViewStatus.EMPTY,
      title: '商机仍在推进',
      message: 'WON / LOST / STOPPED 等 Outcome 产生后再进入正式 Playbook 复盘。',
    }));
    return panel;
  }

  panel.appendChild(el('section', { className: 'qp-v2-outcome-summary' }, [
    el('div', {}, [el('span', { text: '结果' }), el('strong', { text: data.stage })]),
    el('div', {}, [el('span', { text: '原因' }), el('strong', { text: textOrUnknown(data.reason, '原因待补充') })]),
    el('div', {}, [el('span', { text: '记录时间' }), el('strong', { text: formatDateTime(data.reportedAt) })]),
    el('div', {}, [el('span', { text: '来源' }), el('strong', { text: textOrUnknown(data.source, 'UNKNOWN') })]),
  ]));

  panel.appendChild(el('div', { className: 'qp-v2-playbook-grid' }, [
    learningList('有效信号', data.winningSignals, '尚未沉淀有效信号'),
    learningList('失败 / 风险信号', data.losingSignals, '尚未沉淀失败信号'),
    learningList('渠道经验', data.channelLearnings, '渠道经验待复盘'),
    learningList('话术经验', data.messageLearnings, '话术经验待复盘'),
  ]));

  if (data.reusableActions.length) {
    panel.appendChild(learningList('可复用动作', data.reusableActions, ''));
  }

  return panel;
}
