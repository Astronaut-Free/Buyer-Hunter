import { el, formatDateTime, textOrUnknown, toneForStatus } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

export function normalizeHumanTakeover(input = {}) {
  const source = input.human_takeover || input.humanTakeover || input.takeover || input;
  return {
    required: source.required === true,
    reasonCode: source.reason_code || source.reasonCode || null,
    reason: source.reason || source.description || null,
    assignedTo: source.assigned_to || source.assignedTo || null,
    status: source.status || (source.required === true ? 'PENDING' : 'NOT_REQUIRED'),
    createdAt: source.created_at || null,
    resolvedAt: source.resolved_at || null,
  };
}

export function renderHumanTakeoverPanel(input = {}, {
  title = '人工接管',
  onAccept,
  onResolve,
} = {}) {
  const takeover = normalizeHumanTakeover(input);
  const panel = el('section', { className: 'qp-v2-card qp-v2-human-takeover' });

  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: '价格、交期、合同、认证、高风险议题与低置信度场景进入 Human Gate。' }),
    ]),
    el('span', { className: 'qp-v2-tag', text: takeover.status, dataset: { tone: toneForStatus(takeover.status) } }),
  ]));

  if (!takeover.required && takeover.status === 'NOT_REQUIRED') {
    panel.appendChild(renderViewState({
      status: ViewStatus.EMPTY,
      title: '当前无需人工接管',
      message: '继续由 Agent 推进；一旦出现关键承诺或高风险议题，Runtime 应创建接管事件。',
    }));
    return panel;
  }

  panel.appendChild(el('div', { className: 'qp-v2-takeover-summary' }, [
    el('div', {}, [el('span', { text: '触发原因' }), el('strong', { text: textOrUnknown(takeover.reasonCode, 'OTHER') })]),
    el('div', {}, [el('span', { text: '负责人' }), el('strong', { text: textOrUnknown(takeover.assignedTo, '待分配') })]),
    el('div', {}, [el('span', { text: '创建时间' }), el('strong', { text: formatDateTime(takeover.createdAt) })]),
    el('div', {}, [el('span', { text: '解决时间' }), el('strong', { text: takeover.resolvedAt ? formatDateTime(takeover.resolvedAt) : '—' })]),
  ]));

  if (takeover.reason) panel.appendChild(el('p', { className: 'qp-v2-takeover-note', text: takeover.reason }));

  const actions = el('footer', { className: 'qp-v2-action-actions' });
  if (takeover.status === 'PENDING') {
    actions.appendChild(el('button', {
      className: 'qp-v2-primary-button qp-v2-focus-ring',
      text: '接管这笔商机',
      attrs: { type: 'button' },
      on: { click: () => onAccept?.(takeover) },
    }));
  } else if (takeover.status === 'ACTIVE') {
    actions.appendChild(el('button', {
      className: 'qp-v2-primary-button qp-v2-focus-ring',
      text: '标记已解决',
      attrs: { type: 'button' },
      on: { click: () => onResolve?.(takeover) },
    }));
  }
  panel.appendChild(actions);

  return panel;
}
