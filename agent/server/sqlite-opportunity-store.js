import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Phase 4 — SQLite-backed opportunity store (core.opportunity).
 *
 * runtime/buyer_hunter.db is the single store of record for both origins.
 * This module implements the same duck-typed API as the memory store
 * (get/list/upsertSeed/applyA6Envelope/bindExternalRef/resolveExternalRef) so
 * it drops in behind createLiveA2A6Runtime / the orchestrator unchanged, with
 * two deliberate differences:
 *
 *  - write-through: every mutation is persisted to SQLite immediately;
 *  - per-operation open/close: the Free builder atomically replaces the DB
 *    file (temp + os.replace), so no long-lived handle may survive a rebuild.
 *
 * In-memory `state.opportunities` stays the live cache for direct readers;
 * mutations go through this store so the durable copy never drifts.
 */

const REPO_DEFAULT_DB = fileURLToPath(new URL('../../runtime/buyer_hunter.db', import.meta.url));

function sha16(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function open(dbPath) {
  const db = new DatabaseSync(String(dbPath));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000;');
  return db;
}

function jsonOrNull(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function createSqliteOpportunityStore({
  dbPath = process.env.AGENT_DB_FILE || REPO_DEFAULT_DB,
  getState,
  onMutate = () => {},
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof getState !== 'function') throw new Error('getState required');

  function state() {
    const value = getState();
    if (!value || typeof value !== 'object') throw new Error('Agent state unavailable');
    value.opportunities ||= {};
    value.opportunity_seed_index ||= {};
    value.external_refs ||= {};
    return value;
  }

  function touch() {
    onMutate();
  }

  // -- durable reads ---------------------------------------------------------

  function loadAll() {
    if (!existsSync(dbPath)) return [];
    const db = open(dbPath);
    try {
      const rows = db.prepare(`
        SELECT o.*, b.canonical_name AS buyer_canonical, b.country_code AS buyer_country,
               b.domain AS buyer_domain,
               s.product_terms_json,
               e.title AS demand_title, e.url AS evidence_url, e.observed_at, e.data_mode,
               od.decision_status, od.rank_position, od.truth_score, od.opportunity_score,
               od.seller_fit_score, od.timing_score, od.commercial_execution_score,
               od.procurement_channel_actionability_score, od.market_access_score,
               od.why_now_json, od.gaps_json, od.next_action_json, od.promotion_bonus,
               od.ruleset_version,
               ssf.supply_pool_status, ssf.best_verdict, ssf.best_fit_score, ssf.summary_zh
        FROM opportunity o
        JOIN buyer b ON b.id = o.buyer_id
        LEFT JOIN signal s ON s.id = o.primary_signal_id
        LEFT JOIN signal_evidence se ON se.signal_id = s.id AND se.evidence_role = 'PRIMARY'
        LEFT JOIN evidence e ON e.id = se.evidence_id
        LEFT JOIN opportunity_decision od ON od.opportunity_id = o.id
        LEFT JOIN seller_sku_fit ssf ON ssf.opportunity_id = o.id
        ORDER BY o.origin, o.updated_at
      `).all();
      return rows.map(rowToOpportunity);
    } finally {
      db.close();
    }
  }

  function rowToOpportunity(row) {
    const origin = row.origin;
    const isA2 = origin === 'A2_PROACTIVE';
    const productTerms = parseJson(row.product_terms_json, []);
    const category = Array.isArray(productTerms) ? productTerms[0] || '' : '';
    const whyNow = parseJson(row.why_now_json, []);
    const gaps = parseJson(row.gaps_json, []);
    const nextActionJson = parseJson(row.next_action_json, {});
    const agentFields = parseJson(row.agent_fields_json, {});
    const a2 = parseJson(row.a2_json);
    const sellerJson = parseJson(row.seller_json);
    const buyer = {
      id: row.buyer_id,
      name: row.buyer_canonical,
      market: row.buyer_country,
      domain: row.buyer_domain || null
    };
    return {
      id: row.id,
      seed_key: row.seed_key,
      source: isA2 ? 'A2_PROACTIVE_BUYER_DEVELOPMENT' : 'FREE_PIPELINE',
      origin,
      stage: row.agent_stage || (isA2 ? null : 'CONTACTED'),
      status: row.agent_status || (isA2 ? 'READY_FOR_OUTREACH_APPROVAL' : row.decision_status),
      decision: row.decision_status,
      buyer,
      seller: sellerJson || { id: 'seller-guizhou-specialty-demo', name: '贵州特色农产品出口企业（Demo）' },
      contact: parseJson(row.contact_json),
      fields: {
        product: category,
        demand_title: row.demand_title || '',
        quantity: row.quantity_raw ?? '未披露',
        certification: null,
        destination: row.buyer_country || null,
        ...(agentFields || {})
      },
      fit_score: row.seller_fit_score,
      intent_score: row.truth_score,
      conversation_score: null,
      opportunity_score: row.opportunity_score,
      promotion_bonus: row.promotion_bonus ?? 0,
      truth_score: row.truth_score,
      component_scores: {
        timing: row.timing_score,
        seller_fit: row.seller_fit_score,
        commercial_execution: row.commercial_execution_score,
        procurement_channel_actionability: row.procurement_channel_actionability_score,
        market_access: row.market_access_score
      },
      why_now: Array.isArray(whyNow) ? whyNow.join('；') : whyNow,
      gaps: Array.isArray(gaps) ? gaps : [],
      next_action: nextActionJson?.summary || '',
      supply_match: row.supply_pool_status ? {
        pool_status: row.supply_pool_status,
        verdict: row.best_verdict,
        fit_score: row.best_fit_score,
        summary: row.summary_zh
      } : null,
      evidence_ids: row.evidence_url ? [row.evidence_url] : [],
      tags: [category, row.buyer_country].filter(Boolean),
      ruleset_version: row.ruleset_version,
      data_mode: row.data_mode || 'LIVE',
      a2,
      a6: parseJson(row.a6_json),
      outreach: parseJson(row.outreach_json),
      created_at: row.created_at,
      updated_at: row.agent_updated_at || row.updated_at
    };
  }

  // -- duck-typed API --------------------------------------------------------

  function get(opportunityId) {
    return state().opportunities[opportunityId] || null;
  }

  function list() {
    return Object.values(state().opportunities);
  }

  function upsertSeed(seed = {}) {
    if (!seed.seed_key) throw new Error('seed.seed_key required');
    const current = state();
    const indexedId = current.opportunity_seed_index[seed.seed_key];
    const existing = indexedId ? current.opportunities[indexedId] : null;
    const id = existing?.id || seed.id || `opp_a2_${sha16(seed.seed_key)}`;
    const next = {
      ...(existing || {}),
      ...seed,
      id,
      seed_key: seed.seed_key,
      origin: existing?.origin || 'A2_PROACTIVE',
      stage: existing?.stage || seed.stage || 'CONTACTED',
      created_at: existing?.created_at || seed.created_at || now(),
      updated_at: seed.updated_at || now(),
      evidence_ids: [...new Set([...(existing?.evidence_ids || []), ...(seed.evidence_ids || [])])]
    };
    current.opportunities[id] = next;
    current.opportunity_seed_index[seed.seed_key] = id;
    upsertRow(next, true);
    touch();
    return next;
  }

  function upsertRow(opportunity, isA2 = false) {
    const db = open(dbPath);
    try {
      // Free schema invariants: buyer + signal rows must exist for the FK.
      const buyerId = opportunity.buyer?.id || `buyer_a2_${sha16(opportunity.seed_key)}`;
      db.prepare(`
        INSERT INTO buyer (id, canonical_name, normalized_name, domain, country_code, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          canonical_name = excluded.canonical_name,
          domain = COALESCE(excluded.domain, buyer.domain),
          country_code = COALESCE(excluded.country_code, buyer.country_code),
          updated_at = excluded.updated_at
      `).run(
        buyerId,
        opportunity.buyer?.name || '未命名采购方',
        String(opportunity.buyer?.name || '').toLowerCase(),
        opportunity.buyer?.domain || null,
        opportunity.buyer?.market || opportunity.buyer?.country || null,
        opportunity.created_at || now(),
        now()
      );
      const signalId = isA2 ? `sig_a2_${sha16(opportunity.seed_key)}` : opportunity.fields?.signal_id;
      if (isA2) {
        db.prepare(`
          INSERT OR IGNORE INTO signal (id, buyer_id, signal_type, buying_action, product_terms_json,
            truth_score, truth_level, truth_breakdown_json, extraction_version, created_at, updated_at)
          VALUES (?, ?, 'PROACTIVE', 'PROACTIVE', ?, 0, 'D', '{}', 'a2-synthetic-1', ?, ?)
        `).run(signalId, buyerId, JSON.stringify([opportunity.fields?.product || '']), now(), now());
      }
      db.prepare(`
        INSERT INTO opportunity (
          id, seller_capability_profile_id, buyer_id, primary_signal_id, status, why_now,
          gap_json, risk_json, next_action, latest_signal_at, created_at, updated_at,
          origin, seed_key, agent_stage, agent_status, agent_fields_json, a2_json,
          seller_json, a6_json, outreach_json, contact_json, agent_updated_at)
        VALUES (?, ?, ?, ?, 'NEW', '', '[]', '[]', '', NULL, ?, ?,
                'A2_PROACTIVE', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          agent_stage = excluded.agent_stage,
          agent_status = excluded.agent_status,
          agent_fields_json = excluded.agent_fields_json,
          a2_json = excluded.a2_json,
          seller_json = excluded.seller_json,
          contact_json = excluded.contact_json,
          agent_updated_at = excluded.agent_updated_at
      `).run(
        opportunity.id,
        'seller-guizhou-specialty-demo', // A2 rows key off the demo seller profile
        buyerId,
        signalId,
        opportunity.created_at || now(),
        opportunity.updated_at || now(),
        opportunity.seed_key,
        opportunity.stage || 'CONTACTED',
        opportunity.status || 'READY_FOR_OUTREACH_APPROVAL',
        jsonOrNull(opportunity.fields),
        jsonOrNull(opportunity.a2),
        jsonOrNull(opportunity.seller),
        jsonOrNull(opportunity.contact),
        now()
      );
    } finally {
      db.close();
    }
  }

  function applyA6Envelope({ opportunityId, envelope, at = now() } = {}) {
    const current = state();
    const opportunity = current.opportunities[opportunityId];
    if (!opportunity) throw new Error('Opportunity not found');
    if (!envelope?.domain_result) throw new Error('A6 envelope domain_result required');

    const result = envelope.domain_result;
    const changedBusinessFields = result.changed_business_fields || [];
    const appliedFieldUpdates = {};
    const pendingStructuredExtraction = [];
    opportunity.fields ||= {};

    for (const change of changedBusinessFields) {
      if (!change?.field) continue;
      if (change.needs_structured_extraction) {
        pendingStructuredExtraction.push(change.field);
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(change, 'after') || change.after === null || change.after === undefined) continue;
      opportunity.fields[change.field] = change.after;
      appliedFieldUpdates[change.field] = change.after;
    }

    opportunity.a6 = {
      run_status: envelope.run_status,
      buyer_reply: result.buyer_reply || null,
      next_action: result.next_action || null,
      execution_mode: result.execution_mode || null,
      dependency_refresh: result.dependency_refresh || null,
      outcome: result.outcome || null,
      applied_field_updates: appliedFieldUpdates,
      pending_structured_extraction: [...new Set(pendingStructuredExtraction)],
      updated_at: at
    };
    opportunity.evidence_ids = [...new Set([
      ...(opportunity.evidence_ids || []),
      ...(envelope.evidence_refs || []),
      ...(result.evidence_refs || [])
    ])];

    if (envelope.run_status === 'DONE') {
      if (result.stage?.after) opportunity.stage = result.stage.after;
      if (result.outcome?.outcome) opportunity.status = result.outcome.outcome;
      else if (result.next_action?.action === 'HUMAN_TAKEOVER') opportunity.status = 'HUMAN_TAKEOVER';
      else opportunity.status = 'ACTIVE';
    } else if (envelope.run_status === 'MORE_EVIDENCE') {
      opportunity.status = 'WAITING_EVIDENCE';
    } else if (envelope.run_status === 'BLOCKED') {
      opportunity.status = 'BLOCKED';
    } else if (envelope.run_status === 'ERROR') {
      opportunity.status = 'ERROR';
    }
    opportunity.updated_at = at;

    // write-through: agent columns + deal_outcome when the A6 cycle closed out
    const db = open(dbPath);
    try {
      const outcome = result.outcome;
      const stage = ['WON', 'LOST', 'STOPPED'].includes(outcome?.outcome)
        ? { WON: 'WON', LOST: 'LOST', STOPPED: 'NEGOTIATING' }[outcome.outcome]
        : null;
      if (outcome?.outcome && stage && existsSync(dbPath)) {
        const exists = db.prepare('SELECT 1 FROM opportunity WHERE id = ?').get(opportunityId);
        if (exists) {
          db.prepare(`
            INSERT OR IGNORE INTO deal_outcome (id, opportunity_id, stage, reason, reported_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            sha16(`${opportunityId}|${stage}|${at}`),
            opportunityId,
            stage,
            `${outcome.outcome === 'STOPPED' ? 'STOP_CONTACT: ' : ''}${outcome.reason || ''}`,
            at
          );
        }
      }
      db.prepare(`
        UPDATE opportunity SET
          agent_stage = ?, agent_status = ?, agent_fields_json = ?, a6_json = ?, agent_updated_at = ?
        WHERE id = ?
      `).run(
        opportunity.stage || null,
        opportunity.status || null,
        jsonOrNull(opportunity.fields),
        jsonOrNull(opportunity.a6),
        at,
        opportunityId
      );
    } finally {
      db.close();
    }
    touch();
    return opportunity;
  }

  function bindExternalRef({ opportunityId, provider, kind = 'lead', externalId, metadata = {} } = {}) {
    const current = state();
    const opportunity = current.opportunities[opportunityId];
    if (!opportunity) throw new Error('Opportunity not found');
    if (!provider || externalId === undefined || externalId === null || externalId === '') {
      throw new Error('provider and externalId required');
    }
    const key = `${provider}:${kind}:${externalId}`;
    const value = {
      opportunity_id: opportunityId,
      provider,
      kind,
      external_id: String(externalId),
      metadata,
      updated_at: now()
    };
    current.external_refs[key] = value;
    opportunity.external_refs = { ...(opportunity.external_refs || {}), [key]: value };
    opportunity.updated_at = now();
    touch();
    return value;
  }

  function resolveExternalRef({ provider, kind = 'lead', externalId } = {}) {
    if (!provider || externalId === undefined || externalId === null) return null;
    const current = state();
    const ref = current.external_refs[`${provider}:${kind}:${externalId}`];
    return ref ? current.opportunities[ref.opportunity_id] || null : null;
  }

  return {
    loadAll,
    get,
    list,
    upsertSeed,
    upsertSeeds: (seeds = []) => (seeds || []).map(upsertSeed),
    bindExternalRef,
    resolveExternalRef,
    applyA6Envelope,
    flushDealOutcome: () => {} // legacy no-op: outcomes flush inside applyA6Envelope
  };
}
