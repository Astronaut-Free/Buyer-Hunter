const API_BASE = import.meta.env.VITE_BUYER_HUNTER_API || "http://127.0.0.1:8000/api/v1";
const SELLER_PROFILE_ID = "seller-guizhou-specialty-demo";

const decisionMeta = {
  PURSUE_NOW: ["立即追", "success"],
  VERIFY_FIRST: ["补证后追", "warning"],
  WATCH: ["继续观察", "neutral"],
  PASS: ["暂不投入", "danger"],
};

const countryNames = {
  US: "美国", JP: "日本", GB: "英国", AU: "澳大利亚", DE: "德国", NL: "荷兰",
  FR: "法国", IT: "意大利", ES: "西班牙", PL: "波兰", BE: "比利时", FI: "芬兰",
  HU: "匈牙利", OM: "阿曼", AE: "阿联酋", TH: "泰国", CA: "加拿大", IN: "印度", ZZ: "待核验",
};

function daysSince(dateText) {
  if (!dateText) return "时间待核验";
  const delta = Math.max(0, Math.floor((Date.now() - new Date(`${dateText}T00:00:00Z`).getTime()) / 86400000));
  return `${delta} 天前`;
}

const poolMeta = {
  HAS_MATCH: ["贵州有匹配", "success"],
  CONDITIONAL_ONLY: ["条件性匹配", "warning"],
  NO_MATCH: ["暂无匹配供给", "danger"],
};
const verdictMeta = {
  MATCH: ["完全匹配", "success"],
  CONDITIONAL: ["条件性", "warning"],
  BLOCK: ["硬性不符", "danger"],
};

function mapOpportunity(raw) {
  const [decisionLabel, decisionTone] = decisionMeta[raw.decision_status] || decisionMeta.WATCH;
  const whyNowReasons = raw.why_now?.length ? raw.why_now : ["采购窗口待进一步核验"];
  const component = raw.component_scores || {};
  const requirements = raw.match_results || [];
  const fit = raw.seller_sku_fit || {};
  const [poolLabel, poolTone] = poolMeta[raw.supply_pool_status || fit.supply_pool_status] || ["", "neutral"];
  const skuMatches = (fit.eligible_matches || []).map((m) => {
    const [verdictLabel, verdictTone] = verdictMeta[m.verdict] || ["", "neutral"];
    return {
      seller: m.company_name,
      location: m.company_location,
      sku: m.sku,
      product: m.product_name,
      grade: m.grade,
      verdict: m.verdict,
      verdictLabel,
      verdictTone,
      fitPoints: Math.round(m.fit_points || 0),
      blockers: m.blockers || [],
      gaps: m.gaps || [],
      checks: (m.checks || []).map((c) => ({ dim: c.dimension, kind: c.kind, status: c.status, detail: c.detail })),
    };
  });
  return {
    id: raw.id,
    rank: raw.rank,
    decision: raw.decision_status,
    decisionLabel,
    decisionTone,
    risk: raw.risks?.length ? "中风险" : "低风险",
    buyerName: raw.buyer_display_name,
    country: countryNames[raw.country_code] || raw.country_code,
    industry: "公开 B2B 采购需求",
    score: Math.round(raw.opportunity_score),
    truth: Math.round(raw.truth_score),
    window: raw.decision_status === "WATCH" ? "等待窗口" : "窗口打开",
    access: component.market_readiness >= 70 ? "可进入" : "待核验",
    accessTone: component.market_readiness >= 70 ? "success" : "warning",
    published: daysSince(raw.published_at),
    demand: raw.demand_title,
    quantity: raw.quantity_raw || "未披露",
    whyNow: whyNowReasons.join("；"),
    whyNowReasons,
    action: raw.next_action?.summary || raw.next_action_summary,
    gap: raw.gaps?.join("；") || "完整判断中暂无关键缺口",
    fit: Math.round(component.seller_fit || raw.seller_fit_score || 0),
    supplyPoolStatus: raw.supply_pool_status || fit.supply_pool_status || null,
    supplyPoolLabel: poolLabel,
    supplyPoolTone: poolTone,
    supplySummary: fit.summary_zh || "",
    skuMatches,
    skuEvaluatedCount: raw.eligible_sku_match_count ?? (fit.all_evaluations || []).length,
    tags: [raw.category_code, raw.quantity_raw, raw.country_code].filter(Boolean),
    evidence: (raw.evidence || []).map((item) => [
      (item.observed_at || "").slice(5, 10), "原始来源", item.claim, "FACT",
    ]),
    matches: requirements.map((item) => [
      item.field_code, JSON.stringify(item.buyer_value ?? item.value ?? ""), JSON.stringify(item.seller_value ?? "待核验"), item.status || "UNKNOWN",
    ]),
    contact: "需通过 Lead Access 获取",
    procurementUrl: raw.evidence?.[0]?.source_url || "#",
    leadAccessStatus: raw.lead_access_status || "LOCKED",
  };
}

async function request(path, isMember = false) {
  const response = await fetch(`${API_BASE}${path}`, { headers: { "X-Demo-Member": isMember ? "true" : "false" } });
  if (!response.ok) throw new Error(`Buyer Hunter API ${response.status}`);
  return response.json();
}

export async function loadTodayOpportunities(isMember = false, filters = {}) {
  const params = new URLSearchParams({ seller_profile_id: SELLER_PROFILE_ID, limit: "5" });
  if (filters.categoryCode && filters.categoryCode !== "ALL") params.set("category_code", filters.categoryCode);
  if (filters.marketCode && filters.marketCode !== "ALL") params.set("market_code", filters.marketCode);
  const payload = await request(`/opportunities/today?${params.toString()}`, isMember);
  return { items: payload.items.map(mapOpportunity), dataMode: payload.data_mode || "LIVE_PIPELINE", decisionDate: payload.decision_date };
}

export async function loadOpportunityDetail(id, isMember = false) {
  return mapOpportunity(await request(`/opportunities/${encodeURIComponent(id)}/decision`, isMember));
}
