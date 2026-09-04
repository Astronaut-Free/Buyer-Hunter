import { el, formatDateTime, textOrUnknown, toneForStatus } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

function array(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeNextAction(input = {}) {
  const action = input.next_action || input.nextAction || input.a6?.next_action || (input.action && typeof input.action === 'object' ? input.action : null);
  const approvals = array(input.approvals);
  const blockers = array(input.blockers);
  const pendingApproval = approvals.find(item => String(item.status || '').toUpperCase() === 'PENDING') || null;

  if (!action) return { action: null, approvals, blockers, pendingApproval };
  if (typeof action === 'string') {
    return {
      action: { action: action, summary: action }, approvals, blockers, pendingApproval,
    };
  }
  return { action, approvals, blockers, pendingApproval };
}

function line(label, value) {
  return el('div', { className: 'qp-v2-action-line' }, [
    el('span', { text: label }),
    el('strong', { text: textOrUnknown(value, 'UNKNOWN') }),
  ]);
}

function actionLabel(action) {
  return action?.summary || action?.label || action?.action || action?.action_type || '下一步动作已生成';
}

export function renderNextActionPanel(input = {}, {
  title = '下一步动作',
  onExecute,
  onReviewApproval,
} = {}) {
  const data = normalizeNextAction(input);
  const panel = el('section', { className: 'qp-v2-card qp-v2-next-action' });
  const status = data.pendingApproval ? 'WAITING_APPROVAL' : (data.blockers.length ? 'BLOCKED' : (data.action?.status || 'READY'));

  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: '执行动作以 A6 Runtime 输出为唯一 Owner；前端不重算。' }),
    ]),
    el('span', { className: 'qp-v2-tag', text: status, dataset: { tone: toneForStatus(status) } }),
  ]));

  if (!data.action && !data.pendingApproval) {
    panel.appendChild(renderViewState({
      status: ViewStatus.UNKNOWN,
      title: '下一步待生成',
      message: data.blockers.length ? '当前存在阻断条件，等待 Runtime 或人工处理后刷新。' : '当前没有 A6 next_action，前端不自行推断商务动作。',
    }));
  } else if (data.action) {
    panel.appendChild(el('section', { className: 'qp-v2-action-main' }, [
      el('span', { className: 'qp-v2-muted', text: 'A6 NEXT ACTION' }),
      el('h3', { text: actionLabel(data.action) }),
      data.action.reason ? el('p', { text: data.action.reason }) : null,
      el('div', { className: 'qp-v2-action-grid' }, [
        line('对象', data.action.target_person || data.action.target || data.action.recipient),
        line('渠道', data.action.channel),
        line('计划时间', data.action.follow_up_time ? formatDateTime(data.action.follow_up_time) : (data.action.due_at ? formatDateTime(data.action.due_at) : null)),
        line('动作类型', data.action.action_type || data.action.action),
      ]),
    ]));
  }

  if (data.blockers.length) {
    const blockers = el('section', { className: 'qp-v2-action-blockers' }, [el('h4', { text: '当前阻断' })]);
    const list = el('ul');
    data.blockers.forEach(item => {
      const text = typeof item === 'string'
        ? item
        : [item.type || item.code, item.description || item.reason].filter(Boolean).join(' · ') || '未分类阻断';
      list.appendChild(el('li', { text }));
    });
    blockers.appendChild(list);
    panel.appendChild(blockers);
  }

  const footer = el('footer', { className: 'qp-v2-action-actions' });
  if (data.pendingApproval) {
    footer.appendChild(el('button', {
      className: 'qp-v2-secondary-button qp-v2-focus-ring',
      text: '审核外部动作',
      attrs: { type: 'button' },
      on: { click: () => onReviewApproval?.(data.pendingApproval) },
    }));
  }

  const blocked = data.blockers.length > 0 || Boolean(data.pendingApproval) || !data.action;
  footer.appendChild(el('button', {
    className: 'qp-v2-primary-button qp-v2-focus-ring',
    text: blocked ? '等待条件满足' : '执行下一步',
    attrs: { type: 'button', disabled: blocked ? 'disabled' : null },
    on: { click: () => !blocked && onExecute?.(data.action) },
  }));
  panel.appendChild(footer);

  return panel;
}
