import { guardBuyerOutput } from './output-guard.js';

export function createMemoryIdempotencyStore() {
  const values = new Map();
  return {
    get(key) { return values.get(key); },
    set(key, value) { values.set(key, value); return value; },
    has(key) { return values.has(key); }
  };
}

function approved(approval = {}) {
  return approval.status === 'APPROVED' || approval.status === 'EDITED';
}

export async function executeApprovedSmartleadReply({
  smartlead,
  approval,
  executionMode = 'APPROVAL',
  campaignId,
  leadId,
  emailBody,
  replyMessageId,
  replyEmailTime,
  idempotencyKey,
  idempotencyStore = createMemoryIdempotencyStore()
} = {}) {
  if (!smartlead?.replyEmailThread) throw new Error('Smartlead reply provider required');
  if (!idempotencyKey) throw new Error('idempotencyKey required');
  if (idempotencyStore.has(idempotencyKey)) return { replayed: true, result: idempotencyStore.get(idempotencyKey) };
  if (executionMode === 'HUMAN') return { executed: false, status: 'HUMAN_TAKEOVER' };
  if (!approved(approval)) return { executed: false, status: 'WAITING_APPROVAL' };

  const guard = guardBuyerOutput(emailBody, { approved: true });
  if (!guard.allowed) return { executed: false, status: 'BLOCKED_BY_OUTPUT_GUARD', violations: guard.violations };

  const result = await smartlead.replyEmailThread({ campaignId, leadId, emailBody: guard.text, replyMessageId, replyEmailTime });
  idempotencyStore.set(idempotencyKey, result);
  return { executed: true, status: 'SENT', result };
}
