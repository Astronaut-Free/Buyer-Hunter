import { el, safeExternalLink, textOrUnknown, toneForStatus } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

function array(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeBuyer(input = {}) {
  const source = input.company || input.buyer || input;
  const contacts = array(input.contacts || source.contacts);
  const events = array(input.business_events || input.businessEvents || source.business_events);
  const procurement = input.procurement_intelligence || input.procurementIntelligence || source.procurement_intelligence || null;
  const evidence = input.evidence_summary || input.evidence || {};

  return {
    id: source.buyer_id || source.id || null,
    name: source.name || source.canonical_name || '买家待核验',
    domain: source.domain || null,
    country: source.country || source.country_code || source.market || null,
    address: source.address || null,
    companyType: source.company_type || null,
    industry: source.industry || null,
    valueChainRole: source.value_chain_role || null,
    employeeRange: source.employee_range || null,
    foundedYear: source.founded_year || null,
    products: array(source.products),
    salesChannels: array(source.sales_channels),
    targetMarkets: array(source.target_markets),
    entityStatus: source.entity_status || source.verification_status || 'UNKNOWN',
    contacts,
    events,
    procurement,
    evidenceCount: evidence.count ?? array(evidence.refs || source.evidence_refs).length,
  };
}

function fact(label, value) {
  return el('div', { className: 'qp-v2-fact' }, [
    el('span', { text: label }),
    el('strong', { text: textOrUnknown(value, 'UNKNOWN') }),
  ]);
}

function contactRow(contact = {}) {
  const status = contact.verification_status || 'UNKNOWN';
  const primary = contact.name || contact.title || '联系人待核验';
  const secondary = [contact.title, contact.department, contact.decision_role].filter(Boolean).join(' · ');
  const channel = contact.email || contact.linkedin_url || array(contact.public_channels)[0]?.value || null;

  return el('article', { className: 'qp-v2-contact-row' }, [
    el('div', {}, [
      el('strong', { text: primary }),
      secondary ? el('p', { text: secondary }) : null,
    ]),
    el('div', { className: 'qp-v2-contact-meta' }, [
      el('span', { className: 'qp-v2-tag', text: status, dataset: { tone: toneForStatus(status) } }),
      contact.linkedin_url ? safeExternalLink(contact.linkedin_url, 'LinkedIn') : null,
      channel && !contact.linkedin_url ? el('span', { className: 'qp-v2-muted', text: channel }) : null,
    ]),
  ]);
}

function procurementSummary(value) {
  if (!value) return null;
  const rows = [
    ['采购品类', array(value.categories).join('、') || null],
    ['HS Code', array(value.hs_codes).join('、') || null],
    ['采购频次', value.purchase_frequency || null],
    ['最近采购', value.last_purchase_at || null],
    ['数量趋势', value.volume_trend || 'UNKNOWN'],
    ['金额趋势', value.value_trend || 'UNKNOWN'],
    ['来源国', array(value.origin_countries).join('、') || null],
    ['采购周期', value.purchase_cycle || null],
    ['季节性', value.seasonality || null],
  ];
  return el('div', { className: 'qp-v2-fact-grid qp-v2-procurement-grid' }, rows.map(([label, item]) => fact(label, item)));
}

export function renderBuyerProfile(input = {}, { title = '买家画像' } = {}) {
  const buyer = normalizeBuyer(input);
  const panel = el('section', { className: 'qp-v2-card qp-v2-buyer-profile' });

  panel.appendChild(el('header', { className: 'qp-v2-panel-head' }, [
    el('div', {}, [
      el('h3', { text: title }),
      el('p', { text: '公司、联系人与采购背景使用统一 Buyer Contract。' }),
    ]),
    el('span', {
      className: 'qp-v2-tag',
      text: buyer.entityStatus,
      dataset: { tone: toneForStatus(buyer.entityStatus) },
    }),
  ]));

  if (!buyer.id && buyer.name === '买家待核验') {
    panel.appendChild(renderViewState({
      status: ViewStatus.UNKNOWN,
      title: '买家主体待核验',
      message: '当前 Opportunity 尚未可靠绑定 Buyer，禁止自动补全企业信息。',
    }));
    return panel;
  }

  panel.appendChild(el('section', { className: 'qp-v2-buyer-summary' }, [
    el('div', { className: 'qp-v2-buyer-title' }, [
      el('div', {}, [
        el('strong', { text: buyer.name }),
        el('p', { text: [buyer.country, buyer.valueChainRole, buyer.industry].filter(Boolean).join(' · ') || '企业信息待补齐' }),
      ]),
      buyer.domain ? safeExternalLink(`https://${buyer.domain}`, buyer.domain) : el('span', { className: 'qp-v2-muted', text: 'Domain UNKNOWN' }),
    ]),
    el('div', { className: 'qp-v2-fact-grid' }, [
      fact('企业类型', buyer.companyType),
      fact('产业链角色', buyer.valueChainRole),
      fact('员工规模', buyer.employeeRange),
      fact('成立年份', buyer.foundedYear),
      fact('地址', buyer.address),
      fact('证据数', buyer.evidenceCount ?? 'UNKNOWN'),
    ]),
  ]));

  if (buyer.products.length || buyer.salesChannels.length || buyer.targetMarkets.length) {
    panel.appendChild(el('section', { className: 'qp-v2-buyer-context' }, [
      fact('主营产品', buyer.products.join('、') || null),
      fact('销售渠道', buyer.salesChannels.join('、') || null),
      fact('目标市场', buyer.targetMarkets.join('、') || null),
    ]));
  }

  const contacts = el('section', { className: 'qp-v2-subsection' }, [
    el('h4', { text: '采购联系人' }),
  ]);
  if (buyer.contacts.length) buyer.contacts.map(contactRow).forEach(row => contacts.appendChild(row));
  else contacts.appendChild(renderViewState({
    status: ViewStatus.UNKNOWN,
    title: '联系人待发现',
    message: '当前没有可验证采购联系人，职位与决策角色保持 UNKNOWN。',
  }));
  panel.appendChild(contacts);

  if (buyer.procurement) {
    panel.appendChild(el('section', { className: 'qp-v2-subsection' }, [
      el('h4', { text: '采购情报' }),
      procurementSummary(buyer.procurement),
    ]));
  }

  return panel;
}
