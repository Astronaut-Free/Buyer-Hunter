import { el, textOrUnknown, toneForStatus } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

function array(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeMarketAccess(input = {}) {
  const source = input.market_access || input.marketAccess || input.access_evaluation || input.a5?.market_access || input;
  const required = array(source.required || source.required_certifications || source.certifications_required);
  const missing = array(source.missing || source.missing_documents || source.missing_certifications);
  const verifiedItems = array(source.verified_items || source.verified_requirements);
  const regulations = array(source.regulations || source.regulatory_requirements);
  const risks = array(source.risks || source.risk_items || source.blockers);
  const evidenceRefs = array(source.evidence_refs || source.source_refs);
  return {
    market: source.market || source.destination || source.country || input.destination || null,
    status: source.status || source.access_status || 'UNKNOWN',
    required,
    missing,
    verifiedItems,
    regulations,
    risks,
    evidenceRefs,
    summary: source.summary || source.reason || null,
    verified: source.verified === true,
  };
}

function listSection(title, rows, emptyText) {
  const section = el('section', { className: 'qp-v2-access-section' }, [el('h4', { text: title })]);
  if (!rows.length) {
    section.appendChild(el('p', { className: 'qp-v2-muted', text: emptyText }));
    return section;
  }
  const list = el('ul', { className: 'qp-v2-access-list' });
  rows.forEach(item => {
    const text = typeof item === 'string' ? item : (item.label || item.name || item.description || item.code || JSON.stringify(item));
    list.appendChild(el('li', { text }));
  });
  section.appendChild(list);
  return section;
}

export function renderMarketAccessPanel(input = {}, { title = '市场准入' } = {}) {
  const access = normalizeMarketAccess(input);
  const panel = el('section', { className: 'qp-v2-card qp-v2-market-access' });

  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: '目标市场要求、缺口与风险作为执行 Hard Gate。' }),
    ]),
    el('span', { className: 'qp-v2-tag', text: access.status, dataset: { tone: toneForStatus(access.status) } }),
  ]));

  const hasData = access.market || access.required.length || access.missing.length || access.regulations.length || access.risks.length || access.summary;
  if (!hasData) {
    panel.appendChild(renderViewState({
      status: ViewStatus.UNKNOWN,
      title: '市场准入待核验',
      message: '目标市场或准入要求不足时保持 UNKNOWN，禁止默认视为可进入。',
    }));
    return panel;
  }

  panel.appendChild(el('div', { className: 'qp-v2-access-summary' }, [
    el('div', {}, [el('span', { text: '目标市场' }), el('strong', { text: textOrUnknown(access.market, 'UNKNOWN') })]),
    el('div', {}, [el('span', { text: '要求项' }), el('strong', { text: String(access.required.length) })]),
    el('div', {}, [el('span', { text: '缺口' }), el('strong', { text: String(access.missing.length) })]),
    el('div', {}, [el('span', { text: '证据' }), el('strong', { text: String(access.evidenceRefs.length) })]),
  ]));

  if (access.summary) panel.appendChild(el('p', { className: 'qp-v2-access-note', text: access.summary }));

  const grid = el('div', { className: 'qp-v2-access-grid' }, [
    listSection('准入要求', access.required, '准入要求 UNKNOWN'),
    listSection('待补资料 / 认证', access.missing, '当前无已识别缺口'),
    listSection('法规要求', access.regulations, '法规要求待补充'),
    listSection('风险 / 阻断', access.risks, '当前无已识别风险'),
  ]);
  panel.appendChild(grid);

  if (['BLOCKED', 'WAITING_EVIDENCE', 'MORE_EVIDENCE'].includes(String(access.status).toUpperCase()) || access.missing.length) {
    panel.appendChild(el('div', { className: 'qp-v2-hard-gate', attrs: { role: 'status' } }, [
      el('strong', { text: 'Hard Gate' }),
      el('span', { text: '准入缺口未解决前，不自动推进高风险外部动作。' }),
    ]));
  }

  return panel;
}
