import { el, formatDateTime, textOrUnknown, toneForStatus } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

function array(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeApproval(item = {}) {
  return {
    id: item.approval_id || item.id || null,
    actionType: item.action_type || null,
    status: item.status || 'UNKNOWN',
    executionStatus: item.execution_status || null,
    riskSummary: item.risk_summary || null,
    payload: item.payload || null,
    createdAt: item.created_at || null,
    approvedAt: item.approved_at || null,
    requestedBy: item.requested_by || null,
    approvedBy: item.approved_by || null,
  };
}

function approvalRow(raw, { onApprove, onEdit, onReject } = {}) {
  const item = normalizeApproval(raw);
  const pending = String(item.status).toUpperCase() === 'PENDING';
  const row = el('article', { className: 'qp-v2-approval-row', dataset: { approvalId: item.id || '' } });

  row.appendChild(el('header', { className: 'qp-v2-approval-head' }, [
    el('div', {}, [
      el('strong', { text: textOrUnknown(item.actionType, '外部动作审批') }),
      el('span', { text: formatDateTime(item.createdAt) }),
    ]),
    el('span', { className: 'qp-v2-tag', text: item.status, dataset: { tone: toneForStatus(item.status) } }),
  ]));

  row.appendChild(el('p', { className: 'qp-v2-approval-risk', text: textOrUnknown(item.riskSummary, '风险摘要待补充') }));

  if (item.executionStatus) {
    row.appendChild(el('div', { className: 'qp-v2-approval-execution' }, [
      el('span', { text: '执行状态' }),
      el('strong', { text: item.executionStatus }),
    ]));
  }

  if (pending) {
    row.appendChild(el('footer', { className: 'qp-v2-approval-actions' }, [
      el('button', {
        className: 'qp-v2-secondary-button qp-v2-focus-ring',
        text: '拒绝',
        attrs: { type: 'button' },
        on: { click: () => onReject?.(item) },
      }),
      el('button', {
        className: 'qp-v2-secondary-button qp-v2-focus-ring',
        text: '编辑后批准',
        attrs: { type: 'button' },
        on: { click: () => onEdit?.(item) },
      }),
      el('button', {
        className: 'qp-v2-primary-button qp-v2-focus-ring',
        text: '批准',
        attrs: { type: 'button' },
        on: { click: () => onApprove?.(item) },
      }),
    ]));
  }

  return row;
}

export function renderApprovalPanel(input = {}, {
  title = '审批',
  onApprove,
  onEdit,
  onReject,
} = {}) {
  const rows = Array.isArray(input) ? input : array(input.approvals);
  const approvals = rows.map(normalizeApproval);
  const pendingCount = approvals.filter(item => String(item.status).toUpperCase() === 'PENDING').length;
  const panel = el('section', { className: 'qp-v2-card qp-v2-approval-panel' });

  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: 'PENDING Approval 是外部动作 Hard Gate，未审批前禁止执行。' }),
    ]),
    el('span', {
      className: 'qp-v2-tag',
      text: pendingCount ? `${pendingCount} 待审` : `${approvals.length} 条`,
      dataset: { tone: pendingCount ? 'warning' : approvals.length ? 'success' : 'unknown' },
    }),
  ]));

  if (!approvals.length) {
    panel.appendChild(renderViewState({
      status: ViewStatus.EMPTY,
      title: '当前没有审批任务',
      message: '需要对外发送或形成关键商业承诺时，Runtime 会创建 Approval。',
    }));
    return panel;
  }

  const list = el('div', { className: 'qp-v2-approval-list' });
  rows.map(item => approvalRow(item, { onApprove, onEdit, onReject })).forEach(row => list.appendChild(row));
  panel.appendChild(list);
  return panel;
}
