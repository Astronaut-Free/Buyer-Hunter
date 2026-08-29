function clean(value) {
  return String(value || '').trim().replace(/[.,;:!?]+$/g, '').trim();
}

function firstMatch(text, patterns = []) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return null;
}

export function extractA6FieldUpdates(content = '', explicitUpdates = {}) {
  const text = String(content || '').trim();
  const extracted = {};

  const quantityMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms?|tons?|tonnes?|mt|metric\s+tons?)\b/i)
    || text.match(/(\d+(?:\.\d+)?)\s*(公斤|千克|吨)/i);
  if (quantityMatch) extracted.quantity = `${quantityMatch[1]} ${quantityMatch[2]}`;

  const destination = firstMatch(text, [
    /\b(?:ship(?:ped|ping)?|deliver(?:ed|ing)?|delivery|send|sent)(?:\s+\w+){0,3}\s+to\s+([A-Z][A-Za-z .'-]{1,48}?)(?=\s+(?:by|before|in|for|with|and)\b|[,.;!?]|$)/i,
    /\bdestination\s+(?:is|will be|:)\s*([A-Z][A-Za-z .'-]{1,48}?)(?=\s+(?:by|before|in|for|with|and)\b|[,.;!?]|$)/i,
    /(?:发到|运到|送到|目的地(?:是|为)?)\s*([\u4e00-\u9fa5A-Za-z· .'-]{2,24}?)(?=，|。|；|,|\s*(?:交期|之前|以前|$))/i
  ]);
  if (destination) extracted.destination = destination;

  const deliveryDate = firstMatch(text, [
    /\b(?:by|before)\s+((?:Q[1-4]\s*\d{4})|(?:\d{4}-\d{2}-\d{2})|(?:[A-Z][a-z]+\s+\d{4})|(?:[A-Z][a-z]+\s+\d{1,2}(?:,?\s+\d{4})?)|(?:[A-Z][a-z]+))/i,
    /(?:最晚|交期|到货时间)(?:是|为|：|:)?\s*([0-9]{4}[-年][0-9]{1,2}(?:[-月][0-9]{1,2}日?)?|[0-9]{1,2}月(?:底|前|[0-9]{1,2}日)?)/i
  ]);
  if (deliveryDate) extracted.delivery_date = deliveryDate;

  const paymentTerms = firstMatch(text, [
    /\b((?:net\s*\d{1,3})|(?:l\/?c\s+(?:at\s+)?sight)|(?:letter of credit)|(?:t\/?t\s*\d{0,3}%?))\b/i,
    /((?:账期|付款条件)(?:是|为|：|:)?\s*[^，。,.!?]{2,30})/i
  ]);
  if (paymentTerms) extracted.payment_terms = paymentTerms;

  const certification = firstMatch(text, [
    /\b(USDA\s+Organic|EU\s+Organic|JAS|FDA|HACCP|BRCGS|ISO\s*22000)\b/i,
    /((?:有机|食品|出口)?认证(?:是|为|：|:)?\s*[^，。,.!?]{2,30})/i
  ]);
  if (certification) extracted.certification = certification;

  const specification = firstMatch(text, [
    /\b(\d{2,4}\s*mesh)\b/i,
    /\b((?:pack(?:age|aging)?|bag|carton)\s*(?:size|:|is)?\s*\d+(?:\.\d+)?\s*(?:g|kg|ml|l))\b/i,
    /((?:规格|目数|包装)(?:是|为|：|:)?\s*[^，。,.!?]{2,30})/i
  ]);
  if (specification) extracted.specification = specification;

  return {
    extracted,
    updates: { ...extracted, ...(explicitUpdates || {}) },
    extracted_fields: Object.keys(extracted),
    explicit_fields: Object.keys(explicitUpdates || {})
  };
}
