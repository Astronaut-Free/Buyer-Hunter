const forbidden = [/内部评分/, /风险等级/, /其他卖家/, /内部成本/, /debug/i, /internal/i, /未审批价格/, /承诺交期/];
export function guardBuyerOutput(text, { approved = false } = {}) {
  const value = String(text || '');
  const violations = forbidden.filter(pattern => pattern.test(value)).map(pattern => pattern.toString());
  if (!approved && /(¥|\$|价格|报价|MOQ|交期|认证|付款|寄样)/i.test(value)) violations.push('商业条件需要人工审批');
  return { allowed: violations.length === 0, violations, text: violations.length ? '' : value, status: violations.length ? 'WAITING_APPROVAL' : 'READY' };
}
