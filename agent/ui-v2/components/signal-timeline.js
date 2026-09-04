import { el, formatDateTime, safeExternalLink, textOrUnknown } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

const SIGNAL_LABELS = Object.freeze({
  IMPORT_ACTIVE: '正在进口同类产品',
  IMPORT_GROWTH: '进口量增长',
  SUPPLIER_SWITCH: '供应商变化',
  RFQ: 'B2B RFQ / 询盘',
  PROCUREMENT_HIRING: '采购岗位招聘',
  NEWS_POLICY: '新闻 / 政策变化',
  PRODUCT_LAUNCH: '新品 / 新市场',
  EXHIBITION: '展会 / 活动',
});

function normalizeSignal(item = {}) {
  const type = String(item.type || item.signal_type || item.code || 'UNKNOWN').toUpperCase();
  return {
    id: item.id || item.signal_id || null,
    type,
    label: item.label || SIGNAL_LABELS[type] || item.title || '未分类信号',
    summary: item.summary || item.description || item.claim || item.excerpt || '',
    source: item.source || item.provider || '公开来源',
    sourceUrl: item.source_url || item.url || item.evidence_ref || null,
    observedAt: item.observed_at || item.published_at || item.created_at || null,
    confidence: item.confidence ?? item.truth_score ?? null,
    freshness: item.freshness || null,
    relatedProduct: item.related_product || item.product || null,
  };
}

function confidenceTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'unknown';
  const normalized = number <= 1 ? number * 100 : number;
  if (normalized >= 80) return 'success';
  if (normalized >= 60) return 'warning';
  return 'unknown';
}

function confidenceLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '可信度未知';
  const normalized = number <= 1 ? number * 100 : number;
  return `可信度 ${Math.round(normalized)}%`;
}

function timelineItem(raw) {
  const item = normalizeSignal(raw);
  return el('article', { className: 'qp-v2-signal-item', dataset: { signalType: item.type } }, [
    el('div', { className: 'qp-v2-signal-marker', attrs: { 'aria-hidden': 'true' } }),
    el('div', { className: 'qp-v2-signal-body' }, [
      el('header', { className: 'qp-v2-signal-head' }, [
        el('div', {}, [
          el('strong', { text: item.label }),
          el('span', { text: formatDateTime(item.observedAt) }),
        ]),
        el('span', {
          className: 'qp-v2-tag',
          text: confidenceLabel(item.confidence),
          dataset: { tone: confidenceTone(item.confidence) },
        }),
      ]),
      el('p', { text: textOrUnknown(item.summary, '信号原文摘要待核验') }),
      el('footer', { className: 'qp-v2-signal-foot' }, [
        el('span', { text: `${item.source}${item.relatedProduct ? ` · ${item.relatedProduct}` : ''}` }),
        safeExternalLink(item.sourceUrl, '查看证据'),
      ]),
    ]),
  ]);
}

export function renderSignalTimeline(input = {}, { title = '采购信号时间线' } = {}) {
  const items = Array.isArray(input) ? input : (input.items || input.signals || []);
  const normalized = items.map(normalizeSignal).sort((a, b) => {
    const right = new Date(b.observedAt || 0).getTime();
    const left = new Date(a.observedAt || 0).getTime();
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });

  const panel = el('section', { className: 'qp-v2-card qp-v2-signal-timeline' }, [
    el('header', { className: 'qp-v2-panel-head' }, [
      el('div', {}, [el('h3', { text: title }), el('p', { text: '按发生时间展示可追溯的采购变化。' })]),
      el('span', { className: 'qp-v2-tag', text: `${normalized.length} 条`, dataset: { tone: normalized.length ? 'success' : 'unknown' } }),
    ]),
  ]);

  if (!normalized.length) {
    panel.appendChild(renderViewState({
      status: ViewStatus.UNKNOWN,
      title: '暂无可验证信号',
      message: '当前买家没有足够的时间序列证据，Why Now 保持 UNKNOWN。',
    }));
    return panel;
  }

  const list = el('div', { className: 'qp-v2-signal-list' });
  items.sort((a, b) => String(b.observed_at || b.published_at || '').localeCompare(String(a.observed_at || a.published_at || '')))
    .map(timelineItem)
    .forEach(item => list.appendChild(item));
  panel.appendChild(list);
  return panel;
}

export { normalizeSignal };
