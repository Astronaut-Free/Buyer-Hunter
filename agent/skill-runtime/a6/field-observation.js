function clean(value) {
  return String(value || '').trim().replace(/[.,;:!?]+$/g, '').trim();
}

function sentenceAt(text, index) {
  const start = Math.max(text.lastIndexOf('.', index), text.lastIndexOf('?', index), text.lastIndexOf('!', index)) + 1;
  const ends = [text.indexOf('.', index), text.indexOf('?', index), text.indexOf('!', index)].filter(value => value >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end).trim();
}

function isQuestion(text, index) {
  const sentence = sentenceAt(text, index);
  return /\?$/.test(sentence) || /^(can|could|would|do|does|is|are|what|when|how|whether|请问|能否|可以|是否)/i.test(sentence);
}

function first(text, patterns = []) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return { value: clean(match[1]), raw_span: clean(match[0]), index: match.index };
  }
  return null;
}

function observation(field, value, { source, confidence, evidenceRef, rawSpan, before } = {}) {
  return {
    field,
    before: before ?? null,
    after: value,
    source,
    confidence,
    evidence_ref: evidenceRef || null,
    raw_span: rawSpan || String(value || '')
  };
}

export function observeA6Fields({ content = '', explicitUpdates = {}, previousFields = {}, evidenceRef = null } = {}) {
  const text = String(content || '').trim();
  const candidates = [];
  const add = (field, match, asserted = false) => {
    if (!match) return;
    candidates.push({ field, ...match, asserted: asserted && !isQuestion(text, match.index) });
  };

  const quantity = first(text, [
    /\b(\d+(?:\.\d+)?\s*(?:kg|kgs|kilograms?|tons?|tonnes?|mt|metric\s+tons?))\b/i,
    /(\d+(?:\.\d+)?\s*(?:公斤|千克|吨))/i
  ]);
  add('quantity', quantity, quantity ? /\b(?:we|i)\s+(?:need|require|want|will order)|需求|需要|采购/i.test(sentenceAt(text, quantity.index)) : false);

  add('destination', first(text, [
    /\b(?:ship(?:ped|ping)?|deliver(?:ed|ing)?|delivery|send|sent)(?:\s+\w+){0,3}\s+to\s+([A-Z][A-Za-z .'-]{1,48}?)(?=\s+(?:by|before|in|for|with|and)\b|[,.;!?]|$)/i,
    /\bdestination\s+(?:is|will be|:)\s*([A-Z][A-Za-z .'-]{1,48}?)(?=\s+(?:by|before|in|for|with|and)\b|[,.;!?]|$)/i,
    /(?:发到|运到|送到|目的地(?:是|为)?)\s*([\u4e00-\u9fa5A-Za-z· .'-]{2,24}?)(?=，|。|；|,|\s*(?:交期|之前|以前|$))/i
  ]), true);

  add('delivery_date', first(text, [
    /\b(?:by|before)\s+((?:Q[1-4]\s*\d{4})|(?:\d{4}-\d{2}-\d{2})|(?:[A-Z][a-z]+\s+\d{4})|(?:[A-Z][a-z]+\s+\d{1,2}(?:,?\s+\d{4})?)|(?:[A-Z][a-z]+))/i,
    /(?:最晚|交期|到货时间)(?:是|为|：|:)?\s*([0-9]{4}[-年][0-9]{1,2}(?:[-月][0-9]{1,2}日?)?|[0-9]{1,2}月(?:底|前|[0-9]{1,2}日)?)/i
  ]), true);

  add('payment_terms', first(text, [
    /\b((?:net\s*\d{1,3})|(?:l\/?c\s+(?:at\s+)?sight)|(?:letter of credit)|(?:t\/?t\s*\d{0,3}%?))\b/i,
    /((?:账期|付款条件)(?:是|为|：|:)?\s*[^，。,.!?]{2,30})/i
  ]), true);

  add('certification', first(text, [
    /\b(USDA\s+Organic|EU\s+Organic|JAS|FDA|HACCP|BRCGS|ISO\s*22000)\b/i,
    /((?:有机|食品|出口)?认证(?:是|为|：|:)?\s*[^，。,.!?]{2,30})/i
  ]), /required|must|need|要求|需要/i.test(text));

  add('specification', first(text, [
    /\b(\d{2,4}\s*mesh)\b/i,
    /\b((?:pack(?:age|aging)?|bag|carton)\s*(?:size|:|is)?\s*\d+(?:\.\d+)?\s*(?:g|kg|ml|l))\b/i,
    /((?:规格|目数|包装)(?:是|为|：|:)?\s*[^，。,.!?]{2,30})/i
  ]), true);

  const mentioned = new Set(candidates.map(item => item.field));
  const addMention = (field, pattern) => {
    if (mentioned.has(field)) return;
    const match = text.match(pattern);
    if (match) candidates.push({ field, value: null, raw_span: clean(match[0]), index: match.index || 0, asserted: false });
  };
  addMention('moq', /\bmoq\b|minimum order|起订量/i);
  addMention('delivery_date', /delivery|lead time|shipping date|交期|到货|发货/i);
  addMention('payment_terms', /payment terms?|付款条件|账期|信用证/i);
  addMention('certification', /certification|certificate|organic|fda|jas|认证|证书/i);
  addMention('specification', /specification|\bspec\b|规格|目数|包装/i);
  addMention('price_request', /formal quotation|quotation|quote|price|pricing|报价|价格/i);
  addMention('sample_request', /sample|样品|寄样/i);

  const explicitFields = new Set(Object.keys(explicitUpdates || {}));
  const updates = candidates
    .filter(item => item.asserted && !explicitFields.has(item.field))
    .filter(item => JSON.stringify(previousFields?.[item.field]) !== JSON.stringify(item.value))
    .map(item => observation(item.field, item.value, {
      source: 'BUYER_MESSAGE', confidence: 'HIGH', evidenceRef,
      rawSpan: item.raw_span, before: previousFields?.[item.field]
    }));
  const mentions = candidates
    .filter(item => !item.asserted && !explicitFields.has(item.field))
    .map(item => ({ field: item.field, evidence_ref: evidenceRef, raw_span: item.raw_span }));

  for (const [field, value] of Object.entries(explicitUpdates || {})) {
    if (JSON.stringify(previousFields?.[field]) === JSON.stringify(value)) continue;
    updates.push(observation(field, value, {
      source: 'EXPLICIT_STRUCTURED_INPUT', confidence: 'HIGH', evidenceRef,
      rawSpan: String(value), before: previousFields?.[field]
    }));
  }

  return {
    updates: dedupe(updates),
    mentions: dedupe(mentions)
  };
}

function dedupe(items = []) {
  const byField = new Map();
  for (const item of items) byField.set(item.field, item);
  return [...byField.values()];
}
