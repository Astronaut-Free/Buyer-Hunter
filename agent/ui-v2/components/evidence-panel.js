import { el, formatDateTime, safeExternalLink, textOrUnknown } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

const ALLOWED_LEVELS = new Set(['FACT', 'DERIVED', 'INFERENCE', 'ACTION']);

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function normalizeEvidence(item = {}) {
  if (typeof item === 'string') {
    const value = item.trim();
    return {
      id: null,
      level: 'FACT',
      claim: isHttpUrl(value) ? '来源证据' : value || '证据引用待核验',
      source: isHttpUrl(value) ? '公开来源' : 'Evidence Ref',
      sourceUrl: isHttpUrl(value) ? value : null,
      observedAt: null,
      confidence: null,
      freshness: null,
      reference: value || null,
    };
  }

  const level = String(item.level || item.fact_level || item.type || 'FACT').toUpperCase();
  return {
    id: item.id || item.evidence_id || null,
    level: ALLOWED_LEVELS.has(level) ? level : 'FACT',
    claim: item.claim || item.excerpt || item.text || item.title || '',
    source: item.source || item.provider || item.source_name || '公开来源',
    sourceUrl: item.source_url || item.url || (isHttpUrl(item.evidence_ref) ? item.evidence_ref : null),
    observedAt: item.observed_at || item.verified_at || item.created_at || null,
    confidence: item.confidence ?? item.score ?? null,
    freshness: item.freshness || null,
    reference: item.evidence_ref || item.reference || null,
  };
}

function levelTone(level) {
  if (level === 'FACT') return 'success';
  if (level === 'DERIVED') return 'warning';
  if (level === 'INFERENCE') return 'unknown';
  return 'warning';
}

function confidenceLabel(value) {
  if (value === undefined || value === null || value === '') return '可信度未披露';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const percent = number <= 1 ? Math.round(number * 100) : Math.round(number);
  return `可信度 ${percent}%`;
}

function evidenceRow(raw) {
  const item = normalizeEvidence(raw);
  return el('article', { className: 'qp-v2-evidence-row' }, [
    el('header', { className: 'qp-v2-evidence-row-head' }, [
      el('span', { className: 'qp-v2-tag', text: item.level, dataset: { tone: levelTone(item.level) } }),
      el('span', { className: 'qp-v2-muted', text: confidenceLabel(item.confidence) }),
    ]),
    el('p', { className: 'qp-v2-evidence-claim', text: textOrUnknown(item.claim, '证据原文待核验') }),
    item.reference && !item.sourceUrl ? el('code', { className: 'qp-v2-evidence-ref', text: item.reference }) : null,
    el('footer', { className: 'qp-v2-evidence-row-foot' }, [
      el('span', { text: `${item.source} · ${formatDateTime(item.observedAt)}` }),
      safeExternalLink(item.sourceUrl, '查看来源'),
    ]),
  ]);
}

export function renderEvidencePanel(input = {}, { title = '证据链' } = {}) {
  const rows = Array.isArray(input) ? input : (input.items || input.evidence || input.refs || []);
  const panel = el('section', { className: 'qp-v2-card qp-v2-evidence-panel' });
  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: '事实、推导、推断和行动建议分层展示。' }),
    ]),
    el('span', { className: 'qp-v2-tag', text: `${rows.length} 条`, dataset: { tone: rows.length ? 'success' : 'unknown' } }),
  ]));

  if (!rows.length) {
    panel.appendChild(renderViewState({
      status: ViewStatus.UNKNOWN,
      title: '证据待补齐',
      message: '当前没有可验证 Evidence，界面保持 UNKNOWN，不生成确定性结论。',
    }));
    return panel;
  }

  const list = el('div', { className: 'qp-v2-evidence-list' });
  rows.map(evidenceRow).forEach(row => list.appendChild(row));
  panel.appendChild(list);
  return panel;
}

export { normalizeEvidence };
