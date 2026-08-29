import { A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID, capabilitySlot } from './capability-ids.js';

const DEFAULT_RUNNERS = Object.freeze({});

function resultKey(capabilityId) {
  return capabilitySlot(capabilityId);
}

export async function runInvalidatedDependencies({
  capabilities = [],
  opportunity,
  event,
  sellerContext = {},
  dependencyResults = {},
  runners = DEFAULT_RUNNERS
} = {}) {
  const executions = [];
  const mergedResults = { ...(dependencyResults || {}) };
  const refreshedCapabilities = [];
  const missingEvidence = [];

  const order = new Map([[A3_CAPABILITY_ID, 0], [A4_CAPABILITY_ID, 1], [A5_CAPABILITY_ID, 2]]);
  const orderedCapabilities = [...new Set(capabilities || [])]
    .sort((left, right) => (order.get(left) ?? 99) - (order.get(right) ?? 99));
  for (const capabilityId of orderedCapabilities) {
    const runner = runners?.[capabilityId];
    if (typeof runner !== 'function') {
      const unavailable = {
        capability_id: capabilityId, capability_version: 'runtime-error', run_status: 'ERROR',
        changed_fields: [], missing_evidence: [], evidence_refs: [], human_review_required: true,
        domain_result: {}, error: { code: 'CAPABILITY_RUNTIME_UNAVAILABLE', message: 'dependency runner missing' }
      };
      executions.push(unavailable);
      continue;
    }

    const rawMessage = event?.payload?.message || event?.payload?.content || event?.content || '';
    const latestBuyerMessage = typeof rawMessage === 'string'
      ? { content: rawMessage, evidence_ref: event?.evidence_ref || null }
      : {
          ...rawMessage,
          evidence_ref: rawMessage?.evidence_ref || event?.evidence_ref || null,
          evidence_refs: rawMessage?.evidence_refs || event?.evidence_refs || []
        };
    const changedFields = event?.changed_fields || event?.payload?.changed_fields || [];
    const normalizedChangedFields = changedFields.map(item => typeof item === 'string' ? item : item?.field).filter(Boolean);
    const fields = opportunity?.fields || {};
    const fieldUpdates = event?.payload?.field_updates || {};
    const currentFields = { ...fields, ...fieldUpdates };
    const evaluatedAt = event?.timestamp || event?.payload?.evaluated_at;
    const result = await runner({
      opportunity_id: opportunity?.id,
      evaluated_at: evaluatedAt,
      published_at: fields.published_at || null,
      deadline_at: fields.deadline_at || fields.delivery_date || null,
      observed_at: fields.observed_at || null,
      latest_buyer_message: latestBuyerMessage,
      field_updates: fieldUpdates,
      changed_fields: normalizedChangedFields,
      opportunity_state: {
        stage: opportunity?.stage || 'CONTACTED',
        fields: opportunity?.fields || {}
      },
      seller_context: sellerContext,
      demand: {
        product: currentFields.product,
        category_code: currentFields.category_code || currentFields.product,
        specification: currentFields.specification,
        grade: currentFields.grade,
        quantity: currentFields.quantity,
        quantity_unit: currentFields.quantity_unit,
        mandatory_certifications: currentFields.mandatory_certifications || (currentFields.certification ? [currentFields.certification] : []),
        destination_market: currentFields.destination_market || currentFields.destination,
        delivery_deadline: currentFields.delivery_date || currentFields.deadline_at,
        packaging: currentFields.packaging,
        oem: currentFields.oem_required,
        sample: currentFields.sample_required,
        target_price: currentFields.target_price
      },
      buyer_country: opportunity?.buyer?.market || fields.buyer_country || null,
      destination_market: (event?.payload?.field_updates || {}).destination_market ||
        (event?.payload?.field_updates || {}).destination || fields.destination_market || fields.destination || null,
      product: {
        category_code: currentFields.category_code || currentFields.product,
        mandatory_certifications: currentFields.mandatory_certifications || (currentFields.certification ? [currentFields.certification] : [])
      },
      seller_sku: sellerContext.seller_sku || {},
      seller_policy: sellerContext.seller_policy || sellerContext,
      regulatory_evidence: sellerContext.regulatory_evidence || [],
      payment_terms: (event?.payload?.field_updates || {}).payment_terms || fields.payment_terms || null,
      delivery_terms: (event?.payload?.field_updates || {}).delivery_terms || fields.delivery_terms || null,
      evidence_refs: event?.evidence_refs || []
    });

    executions.push(result);
    const key = resultKey(capabilityId);
    if (key) mergedResults[key] = result;
    if (['DONE', 'NOT_APPLICABLE', 'BLOCKED'].includes(result?.run_status)) refreshedCapabilities.push(capabilityId);
    if (result?.run_status === 'MORE_EVIDENCE') missingEvidence.push(...(result.missing_evidence || []).map(item => `${capabilityId}:${item}`));
    if (result?.run_status === 'ERROR') missingEvidence.push(`runtime:${capabilityId}`);
  }

  return {
    executions,
    dependency_results: mergedResults,
    refreshed_capabilities: [...new Set(refreshedCapabilities)],
    missing_evidence: [...new Set(missingEvidence)]
  };
}

export { DEFAULT_RUNNERS as DEFAULT_DEPENDENCY_RUNNERS };
