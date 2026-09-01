import { observeA6Fields } from './a6/field-observation.js';

// Compatibility adapter. Canonical parsing lives in a6/field-observation.js.
export function extractA6FieldUpdates(content = '', explicitUpdates = {}, options = {}) {
  const textOnly = observeA6Fields({
    content,
    explicitUpdates: {},
    previousFields: options.previousFields || {},
    evidenceRef: options.evidenceRef || null
  });
  const observations = observeA6Fields({
    content,
    explicitUpdates,
    previousFields: options.previousFields || {},
    evidenceRef: options.evidenceRef || null
  });
  const extractedUpdates = textOnly.updates.filter(item => item.source === 'BUYER_MESSAGE');
  const extractedValues = [
    ...extractedUpdates.map(item => [item.field, item.after]),
    ...textOnly.mentions.map(item => [item.field, item.raw_span])
  ];
  return {
    extracted: Object.fromEntries(extractedValues),
    updates: Object.fromEntries(observations.updates.map(item => [item.field, item.after])),
    extracted_fields: [...new Set(extractedValues.map(([field]) => field))],
    explicit_fields: observations.updates.filter(item => item.source === 'EXPLICIT_STRUCTURED_INPUT').map(item => item.field),
    field_observations: observations
  };
}
