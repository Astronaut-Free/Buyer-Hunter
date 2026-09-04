import { el, formatScore, textOrUnknown, toneForStatus } from '../shared/dom.js';

function normalizeOpportunity(input = {}) {
  const opportunity = input.opportunity || input;
  const buyer = opportunity.buyer || input.buyer || {};
  const score = input.score || {};
  const fields = opportunity.fields || input.fields || {};
  const whyNow = input.why_now || input.whyNow || opportunity.why_now || [];
  const nextAction = input.next_action || input.nextAction || opportunity.next_action || input.a6?.next_action || null;

  return {
    id: opportunity.id || input.id || null,
    buyerName: buyer.name || buyer.canonical_name || input.buyer_display_name || '买家待核验',
    market: buyer.market || buyer.country_code || input.country_code || 'UNKNOWN',
    product: opportunity.product || fields.product || input.category_code || '产品待核验',
    demandTitle: fields.demand_title || input.demand_title || '',
    score: opportunity.opportunity_score ?? input.opportunity_score ?? score.rank ?? null,
    fit: opportunity.fit_score ?? input.seller_fit_score ?? score.fit ?? null,
    intent: opportunity.intent_score ?? input.truth_score ?? score.intent ?? null,
    status: opportunity.status || input.decision_status || opportunity.decision || 'UNKNOWN',
    stage: opportunity.stage || input.stage || null,
    whyNow: Array.isArray(whyNow) ? whyNow.filter(Boolean) : [whyNow].filter(Boolean),
    nextAction,
    evidenceCount: input.evidence?.count ?? (Array.isArray(opportunity.evidence_ids) ? opportunity.evidence_ids.length : null),
  };
}

function metric(label, value) {
  return el('div', { className: 'qp-v2-opportunity-metric' }, [
    el('span', { text: label }),
    el('strong', { text: value }),
  ]);
}

function nextActionLabel(value) {
  if (!value) return '等待下一步判断';
  if (typeof value === 'string') return value;
  return value.summary || value.action || value.action_type || '已生成下一步动作';
}

export function renderOpportunityCard(input, { onOpen } = {}) {
  const item = normalizeOpportunity(input);
  const card = el('article', {
    className: 'qp-v2-card qp-v2-opportunity-card',
    dataset: { opportunityId: item.id || '' },
  });

  const header = el('header', { className: 'qp-v2-opportunity-card-head' }, [
    el('div', {}, [
      el('span', { className: 'qp-v2-opportunity-market', text: item.market }),
      el('h3', { text: item.buyerName }),
    ]),
    el('span', {
      className: 'qp-v2-tag',
      text: item.status,
      dataset: { tone: toneForStatus(item.status) },
    }),
  ]);

  const demand = el('section', { className: 'qp-v2-opportunity-demand' }, [
    el('strong', { text: textOrUnknown(item.product, '产品待核验') }),
    item.demandTitle ? el('p', { text: item.demandTitle }) : null,
  ]);

  const metrics = el('div', { className: 'qp-v2-opportunity-metrics' }, [
    metric('机会分', formatScore(item.score)),
    metric('匹配', formatScore(item.fit)),
    metric('意向', formatScore(item.intent)),
    metric('证据', item.evidenceCount === null ? '—' : String(item.evidenceCount)),
  ]);

  const why = el('section', { className: 'qp-v2-opportunity-why' }, [
    el('span', { text: 'Why Now' }),
    el('p', { text: item.whyNow.length ? item.whyNow.slice(0, 2).join('；') : '当前没有足够证据形成采购窗口判断。' }),
  ]);

  const footer = el('footer', { className: 'qp-v2-opportunity-card-foot' }, [
    el('div', {}, [
      el('span', { text: '下一步' }),
      el('strong', { text: nextActionLabel(item.nextAction) }),
    ]),
    el('button', {
      className: 'qp-v2-focus-ring',
      text: '进入商机',
      attrs: { type: 'button', disabled: item.id ? null : 'disabled' },
      on: { click: () => item.id && onOpen?.(item.id) },
    }),
  ]);

  card.append(header, demand, metrics, why, footer);
  return card;
}

export { normalizeOpportunity };
