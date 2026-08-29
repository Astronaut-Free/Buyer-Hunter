import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Bridge output from the Python pipeline (scripts/export_opportunities_for_agent.py);
// the hand-authored demo seed is kept as a fallback for a clean checkout.
const BRIDGE_FILE = fileURLToPath(new URL('../db/opportunities.json', import.meta.url));
const SEED_FILE = fileURLToPath(new URL('../db/free-opportunities.json', import.meta.url));

export async function loadFreeOpportunities() {
  for (const file of [BRIDGE_FILE, SEED_FILE]) {
    try {
      const rows = JSON.parse(await readFile(file, 'utf8'));
      if (Array.isArray(rows)) return rows;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return [];
}

export function matchProducts(opportunity, products = []) {
  const market = String(opportunity?.buyer?.market || '').toLowerCase();
  return products
    .filter(product => String(product.markets || '').toLowerCase().includes(market) || !market)
    .map(product => ({ product_id: product.id, score: 80, reason: '目标市场在卖家能力档案中' }));
}

// The bridge file is a full overwrite of every Free row; re-importing it into a
// running agent would wipe A6-mutated state. Runtime values win; the fresh
// pipeline snapshot refreshes decision/score fields.
export function mergeFreeOpportunities(existing, imported) {
  return {
    ...imported,
    fields: { ...(imported.fields || {}), ...(existing.fields || {}) },
    stage: existing.stage || imported.stage,
    status: existing.status || imported.status,
    a6: existing.a6 || null,
    evidence_ids: [...new Set([
      ...(existing.evidence_ids || []),
      ...(imported.evidence_ids || [])
    ])]
  };
}

// Reverse-bridge payload (contract v2): derived from the opportunity store on
// every persist and written to agent/db/agent-outcomes.json.
export function buildAgentOutcomesEntries(opportunities = {}, now = () => new Date().toISOString()) {
  const a6Outcomes = [];
  const a2Targets = [];
  for (const opportunity of Object.values(opportunities || {})) {
    if (opportunity.source === 'A2_PROACTIVE_BUYER_DEVELOPMENT') a2Targets.push(opportunity);
    const a6 = opportunity.a6;
    if (a6?.outcome?.outcome) {
      a6Outcomes.push({
        opportunity_id: opportunity.id,
        seed_key: opportunity.seed_key || null,
        source: opportunity.source || null,
        outcome: a6.outcome.outcome,
        reason: a6.outcome.reason || null,
        next_action: a6.next_action || null,
        stage_after: opportunity.stage || null,
        reported_at: a6.updated_at || now()
      });
    }
  }
  return { a6_outcomes: a6Outcomes, a2_targets: a2Targets };
}
