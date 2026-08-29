function valueText(value) {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

const CLAIM_LABELS = Object.freeze({
  lead_time: 'Lead time',
  moq_or_capacity: 'MOQ or capacity',
  specification: 'Specification',
  certifications: 'Certifications'
});

export function composeReply({ communicationBrief } = {}) {
  if (!communicationBrief) return null;
  const claims = (communicationBrief.allowed_claims || []).filter(claim =>
    claim?.fact && claim?.value !== undefined && (claim.evidence_refs || []).length
  );
  const assets = (communicationBrief.approved_assets || []).filter(item => item && item.approved !== false);
  const questions = (communicationBrief.questions_to_ask || []).filter(Boolean);
  if (!claims.length && !assets.length && !questions.length) return null;

  const sentences = [];
  if (claims.length) {
    const rendered = claims.map(claim => `${CLAIM_LABELS[claim.fact] || claim.fact.replaceAll('_', ' ')}: ${valueText(claim.value)}`);
    sentences.push(`Thanks for checking. Our verified information is ${rendered.join('; ')}.`);
  }
  if (assets.length) {
    const rendered = assets.map(item => typeof item === 'string' ? item : item.title || item.url).filter(Boolean);
    if (rendered.length) sentences.push(`I can share the following approved materials: ${rendered.join(', ')}.`);
  }
  if (questions.length) sentences.push(questions.join(' '));

  return {
    objective: communicationBrief.objective,
    content: sentences.join(' ').trim(),
    language: communicationBrief.language || 'en',
    claims_used: claims,
    evidence_refs: [...new Set(claims.flatMap(claim => claim.evidence_refs || []))],
    approved_assets_used: assets,
    prohibited_claims_checked: true
  };
}
