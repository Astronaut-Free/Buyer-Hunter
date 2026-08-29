// Deterministic business decisions stay outside the Agent control plane.
export function decideHandoff({ fit_score = 0, intent_score = 0, conversation_score = 0, hard_gaps = [], risk_topics = [] }) {
  if (hard_gaps.length) return { decision: 'AI_PAUSE', label: '暂停', reason: '存在硬性履约阻断' };
  if (risk_topics.length) return { decision: 'HUMAN_REQUIRED', label: '立即人工', reason: '出现高风险商务议题' };
  if (fit_score >= 60 && intent_score >= 60 && conversation_score >= 50) return { decision: 'HANDOFF_CANDIDATE', label: '待人工接管', reason: '资格筛选已完成' };
  return { decision: 'AI_NURTURING', label: 'AI 初筛中', reason: '继续补充采购信息' };
}

export function calculateMatch(opportunity, products = []) {
  const fields = opportunity?.fields || {};
  const candidates = products.filter(item => item.status === '已上架' || item.status === 'VERIFIED');
  const matches = candidates.map(product => {
    const market = String(product.markets || '').toLowerCase();
    const marketHit = !fields.market || market.includes(String(fields.market).toLowerCase());
    const certHit = !fields.certification || String(product.certs || '').toLowerCase().includes(String(fields.certification).toLowerCase().split(' ')[0]);
    const score = Math.round((marketHit ? 35 : 10) + (certHit ? 30 : 8) + (fields.product && String(product.name).includes(String(fields.product).slice(0, 4)) ? 25 : 12) + 10);
    return { product_id: product.id, score: Math.min(score, 100), reasons: { market: marketHit, certification: certHit } };
  });
  return matches.sort((a, b) => b.score - a.score);
}

export function evaluateMarketAccess(opportunity, sellerProfile = {}) {
  const required = String(opportunity?.fields?.certification || '').split(/[,/、 ]+/).filter(Boolean);
  const available = String(sellerProfile.certs || sellerProfile.certifications || '').toLowerCase();
  const missing = required.filter(cert => !available.includes(cert.toLowerCase()));
  return { status: missing.length ? 'MORE_EVIDENCE' : 'REVIEW', required, missing, verified: missing.length === 0 };
}
