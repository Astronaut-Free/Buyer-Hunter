import { el, textOrUnknown } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

export function normalizeDemand(input = {}) {
  const opportunity = input.opportunity || input;
  const fields = input.demand || opportunity.fields || input.fields || {};
  return {
    product: fields.product || opportunity.product || input.product || null,
    title: fields.demand_title || input.demand_title || null,
    specification: fields.specification || fields.spec || input.specification || null,
    quantity: fields.quantity || input.quantity_raw || input.quantity || null,
    priceRange: fields.price_range || input.price_range || null,
    certification: fields.certification || input.certification || null,
    destination: fields.destination || input.destination || 'UNKNOWN',
    deliveryTime: fields.delivery_time || fields.delivery_date || input.delivery_time || null,
    moq: fields.moq || input.moq || null,
    packaging: fields.packaging || input.packaging || null,
    usage: fields.usage || input.usage || null,
    source: input.source || opportunity.source || null,
    evidenceRefs: Array.isArray(input.evidence_refs)
      ? input.evidence_refs
      : (Array.isArray(opportunity.evidence_ids) ? opportunity.evidence_ids : []),
  };
}

function field(label, value, { wide = false } = {}) {
  return el('div', { className: `qp-v2-demand-field${wide ? ' qp-v2-demand-field-wide' : ''}` }, [
    el('span', { text: label }),
    el('strong', { text: textOrUnknown(value, 'UNKNOWN') }),
  ]);
}

export function renderDemandCard(input = {}, { title = '采购需求' } = {}) {
  const demand = normalizeDemand(input);
  const hasCore = Boolean(demand.product || demand.title || demand.quantity || (demand.destination && demand.destination !== 'UNKNOWN'));
  const panel = el('section', { className: 'qp-v2-card qp-v2-demand-card' });

  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: '只展示来源已披露的需求字段；买家公司国家不会代替采购目的地。' }),
    ]),
    el('span', {
      className: 'qp-v2-tag',
      text: `${demand.evidenceRefs.length} 条证据`,
      dataset: { tone: demand.evidenceRefs.length ? 'success' : 'unknown' },
    }),
  ]));

  if (!hasCore) {
    panel.appendChild(renderViewState({
      status: ViewStatus.UNKNOWN,
      title: '采购需求待核验',
      message: '当前没有足够需求事实，规格、数量、目的地等字段保持 UNKNOWN。',
    }));
    return panel;
  }

  panel.appendChild(el('section', { className: 'qp-v2-demand-main' }, [
    el('span', { className: 'qp-v2-muted', text: demand.source || '来源待核验' }),
    el('h3', { text: textOrUnknown(demand.product, '产品待核验') }),
    demand.title ? el('p', { text: demand.title }) : null,
  ]));

  panel.appendChild(el('div', { className: 'qp-v2-demand-grid' }, [
    field('规格', demand.specification),
    field('数量', demand.quantity),
    field('价格区间', demand.priceRange),
    field('认证要求', demand.certification),
    field('采购目的地', demand.destination),
    field('交付时间', demand.deliveryTime),
    field('MOQ', demand.moq),
    field('包装', demand.packaging),
    field('用途', demand.usage, { wide: true }),
  ]));

  return panel;
}
