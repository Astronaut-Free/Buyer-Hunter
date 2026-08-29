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
