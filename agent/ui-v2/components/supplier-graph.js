import { el, formatDateTime, formatScore, textOrUnknown, toneForStatus } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

function array(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeSupplier(item = {}, fallbackStatus = 'UNKNOWN') {
  return {
    id: item.supplier_id || item.id || null,
    name: item.name || item.supplier_name || '供应商待核验',
    country: item.country || item.country_code || null,
    firstSeen: item.first_seen || null,
    lastSeen: item.last_seen || null,
    status: item.relationship_status || fallbackStatus,
    sourceRefs: array(item.source_refs || item.evidence_refs),
  };
}

export function normalizeSupplierIntelligence(input = {}) {
  const source = input.supplier_intelligence || input.supplierIntelligence || input;
  const groups = [
    ['CURRENT', source.current_suppliers],
    ['NEW', source.new_suppliers],
    ['LOST', source.lost_suppliers],
    ['HISTORICAL', source.historical_suppliers],
  ];
  const suppliers = groups.flatMap(([status, rows]) => array(rows).map(row => normalizeSupplier(row, status)));
  return {
    buyerId: source.buyer_id || null,
    suppliers,
    switchScore: source.supplier_switch_score ?? null,
    switchWindow: source.supplier_switch_window || null,
    firstSeen: source.first_seen || null,
    lastSeen: source.last_seen || null,
    evidenceRefs: array(source.evidence_refs),
    updatedAt: source.updated_at || null,
  };
}

function supplierRow(item) {
  return el('article', { className: 'qp-v2-supplier-row' }, [
    el('div', { className: 'qp-v2-supplier-status' }, [
      el('span', { className: 'qp-v2-tag', text: item.status, dataset: { tone: toneForStatus(item.status === 'CURRENT' || item.status === 'NEW' ? 'READY' : item.status === 'LOST' ? 'STOPPED' : item.status) } }),
    ]),
    el('div', { className: 'qp-v2-supplier-main' }, [
      el('strong', { text: item.name }),
      el('p', { text: item.country || '国家 UNKNOWN' }),
    ]),
    el('div', { className: 'qp-v2-supplier-time' }, [
      el('span', { text: `首次 ${formatDateTime(item.firstSeen)}` }),
      el('span', { text: `最近 ${formatDateTime(item.lastSeen)}` }),
    ]),
  ]);
}

export function renderSupplierGraph(input = {}, { title = '供应链变化' } = {}) {
  const data = normalizeSupplierIntelligence(input);
  const panel = el('section', { className: 'qp-v2-card qp-v2-supplier-graph' });

  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: '按时间序列展示当前、新增、流失与历史供应商。' }),
    ]),
    el('span', {
      className: 'qp-v2-tag',
      text: data.switchScore === null ? '换供窗口 UNKNOWN' : `换供分 ${formatScore(data.switchScore)}`,
      dataset: { tone: data.switchScore === null ? 'unknown' : Number(data.switchScore) >= 60 ? 'warning' : 'success' },
    }),
  ]));

  if (!data.suppliers.length) {
    panel.appendChild(renderViewState({
      status: ViewStatus.UNKNOWN,
      title: '供应商时间序列待补齐',
      message: '没有可比较的供应商记录时，Supplier Switch 保持 UNKNOWN。',
    }));
    return panel;
  }

  panel.appendChild(el('div', { className: 'qp-v2-supplier-summary' }, [
    el('div', {}, [el('span', { text: '换供窗口' }), el('strong', { text: textOrUnknown(data.switchWindow, 'UNKNOWN') })]),
    el('div', {}, [el('span', { text: '观察起点' }), el('strong', { text: formatDateTime(data.firstSeen) })]),
    el('div', {}, [el('span', { text: '最近观察' }), el('strong', { text: formatDateTime(data.lastSeen || data.updatedAt) })]),
    el('div', {}, [el('span', { text: '证据' }), el('strong', { text: String(data.evidenceRefs.length) })]),
  ]));

  const order = ['CURRENT', 'NEW', 'LOST', 'HISTORICAL', 'UNKNOWN'];
  const list = el('div', { className: 'qp-v2-supplier-list' });
  [...data.suppliers]
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
    .map(supplierRow)
    .forEach(row => list.appendChild(row));
  panel.appendChild(list);
  return panel;
}
