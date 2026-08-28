import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const DATA_FILE = fileURLToPath(new URL('../db/free-opportunities.json', import.meta.url));
export async function loadFreeOpportunities() { return JSON.parse(await readFile(DATA_FILE, 'utf8')); }
export function matchProducts(opportunity, products = []) { const market = String(opportunity?.buyer?.market || '').toLowerCase(); return products.filter(product => String(product.markets || '').toLowerCase().includes(market) || !market).map(product => ({ product_id: product.id, score: 80, reason: '目标市场在卖家能力档案中' })); }
