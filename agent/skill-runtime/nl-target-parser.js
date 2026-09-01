/**
 * Rule-based natural-language target parser (A2 NL entry).
 *
 * Deterministic fallback for the DeepSeek path (agent/providers/deepseek.js):
 * country tokens -> ISO codes, product lexicon -> English keywords for the four
 * catalog categories, company-type lexicon -> lowercase types, plus light
 * constraint extraction. Never invents values: unknown input yields empty
 * arrays, and the caller rejects targets missing countries/product/type.
 */
import { randomBytes } from 'node:crypto';

const COUNTRY_TOKENS = [
  ['德国', 'germany', 'de'], ['法国', 'france', 'fr'], ['意大利', 'italy', 'it'],
  ['西班牙', 'spain', 'es'], ['波兰', 'poland', 'pl'], ['荷兰', 'netherlands', 'nl'],
  ['比利时', 'belgium', 'be'], ['芬兰', 'finland', 'fi'], ['匈牙利', 'hungary', 'hu'],
  ['英国', 'uk', 'gb'], ['美国', 'usa', 'us'], ['日本', 'japan', 'jp'],
  ['澳大利亚', 'australia', 'au'], ['加拿大', 'canada', 'ca'], ['新加坡', 'singapore', 'sg'],
  ['马来西亚', 'malaysia', 'my'], ['阿联酋', 'uae', 'ae'], ['韩国', 'korea', 'kr'],
  ['欧盟', 'europe', 'eu'], ['欧洲', 'europe', 'eu'],
];

// product lexicon: [english keyword, ...tokens that mean it]
const PRODUCT_TOKENS = [
  ['matcha', '抹茶', 'matcha', '煎茶', '抹茶粉'],
  ['tea', 'tea', '红茶', '绿茶', '乌龙', '白茶', '茶叶', 'black tea', 'green tea', 'herbal tea'],
  ['chili', '辣椒', 'chili', 'chilli', '小米辣'],
  ['blueberry', '蓝莓', 'blueberry'],
  ['rosa roxburghii', '刺梨', 'rosa roxburghii', '刺梨汁'],
];

// company-type lexicon: [canonical type, ...tokens]
const COMPANY_TOKENS = [
  ['importer', '进口商', '进口', 'importer', 'import'],
  ['distributor', '分销商', '经销商', 'distributor', 'distribution'],
  ['wholesaler', '批发商', 'wholesaler', 'wholesale'],
  ['retailer', '零售商', 'retailer', 'retail'],
  ['food brand', '食品品牌', '饮料品牌', '品牌商', 'brand'],
  ['supermarket', '超市', '商超', 'supermarket', 'grocery'],
  ['e-commerce', '电商', '电子商务', 'e-commerce', 'ecommerce', 'online'],
  ['tea chain', '茶饮连锁', '奶茶连锁', '咖啡连锁', '连锁', 'chain', 'cafe', 'coffee'],
];

const CERT_TOKENS = ['有机', 'organic', 'usda', 'eu organic', 'haccp', 'kosher', 'halal', 'brc', 'iso'];
const PAYMENT_TOKENS = ['预付', '信用证', 'l/c', 't/t', 'tt', '付款', 'payment'];
const MOQ_RE = /(?:moq|起订量|最小起订)[^0-9]{0,6}(\d[\d,.]*)\s*(kg|吨|t|件|pcs?)?/i;

export function parseNlTarget(text, { language = 'auto' } = {}) {
  const lower = String(text || '').toLowerCase();

  const countries = [];
  for (const [zh, en, iso] of COUNTRY_TOKENS) {
    if ((lower.includes(zh) || lower.includes(en)) && !countries.includes(iso)) {
      countries.push(iso);
    }
  }

  const productKeywords = [];
  for (const [keyword, ...tokens] of PRODUCT_TOKENS) {
    if (tokens.some(token => lower.includes(token)) && !productKeywords.includes(keyword)) {
      productKeywords.push(keyword);
    }
  }

  const companyTypes = [];
  for (const [canonical, ...tokens] of COMPANY_TOKENS) {
    if (tokens.some(token => lower.includes(token)) && !companyTypes.includes(canonical)) {
      companyTypes.push(canonical);
    }
  }

  const constraints = {};
  const certifications = CERT_TOKENS.filter(token => lower.includes(token));
  if (certifications.length) constraints.certification = certifications.join(', ');
  const paymentHit = PAYMENT_TOKENS.find(token => lower.includes(token));
  if (paymentHit) constraints.payment_terms = `涉及付款条款（${paymentHit}）`;
  const moq = lower.match(MOQ_RE);
  if (moq) constraints.moq = moq[1];

  return { countries, product_keywords: productKeywords, company_types: companyTypes, hs_codes: [], constraints, language: String(language || 'auto') };
}

export function buildNlTargetPayload({ parsed, source, seller = {}, product = null, now = Date.now }) {
  return {
    parsed_source: source,
    event_type: 'SELLER_PROACTIVE_DEVELOPMENT',
    idempotency_key: `nl_${now()}_${randomBytes(4).toString('hex')}`,
    input: {
      seller,
      target: {
        countries: parsed.countries,
        product_keywords: parsed.product_keywords,
        ...(parsed.hs_codes?.length ? { hs_codes: parsed.hs_codes } : {})
      },
      buyer_profile: { company_types: parsed.company_types },
      constraints: {
        ...(parsed.constraints || {}),
        language: parsed.language || 'auto',
        max_candidates: 5,
        contact_limit_per_company: 1
      },
      execution: { channel: 'email', human_gate: true }
    },
    product: product || null
  };
}
