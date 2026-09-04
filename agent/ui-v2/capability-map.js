const map = Object.freeze({
  'qianpulse.a2.proactive_buyer_development': Object.freeze({
    owner: 'A2',
    domain: 'PROACTIVE_BUYER_DEVELOPMENT',
    pages: ['mission', 'radar', 'workspace', 'buyer'],
    components: ['OpportunityCard', 'BuyerProfile', 'EvidencePanel', 'ApprovalPanel'],
    outputs: ['target_accounts', 'buyer_fit', 'contacts', 'outreach_draft', 'opportunity_candidates'],
    humanGate: true,
  }),
  'qianpulse.a3.purchase_timing': Object.freeze({
    owner: 'A3',
    domain: 'PURCHASE_TIMING',
    pages: ['radar', 'workspace'],
    components: ['SignalTimeline', 'NextActionPanel', 'EvidencePanel'],
    outputs: ['timing_score', 'why_now', 'purchase_window', 'evidence_refs'],
    humanGate: false,
  }),
  'qianpulse.a4.supply_match': Object.freeze({
    owner: 'A4',
    domain: 'SUPPLY_MATCH',
    pages: ['workspace', 'buyer'],
    components: ['DemandCard', 'SupplierGraph', 'NextActionPanel', 'EvidencePanel'],
    outputs: ['seller_fit', 'supply_match', 'gaps', 'evidence_refs'],
    humanGate: false,
  }),
  'qianpulse.a5.trade_risk': Object.freeze({
    owner: 'A5',
    domain: 'TRADE_RISK_AND_MARKET_ACCESS',
    pages: ['workspace'],
    components: ['MarketAccessPanel', 'HumanTakeoverPanel', 'EvidencePanel'],
    outputs: ['market_access', 'risk', 'blockers', 'missing_evidence'],
    humanGate: true,
  }),
  'qianpulse.a6.opportunity_progression': Object.freeze({
    owner: 'A6',
    domain: 'OPPORTUNITY_PROGRESSION',
    pages: ['workspace', 'conversation', 'playbook'],
    components: ['ConversationTimeline', 'NextActionPanel', 'ApprovalPanel', 'HumanTakeoverPanel', 'OutcomePlaybookPanel'],
    outputs: ['buyer_intent', 'stage', 'next_action', 'approval', 'outcome', 'dependency_refresh'],
    humanGate: true,
  }),

  'demand.normalize': Object.freeze({
    owner: 'LEGACY',
    domain: 'DEMAND_NORMALIZATION',
    pages: ['workspace'],
    components: ['DemandCard', 'EvidencePanel'],
    outputs: ['normalized_demand'],
    humanGate: false,
  }),
  'buyer.intent': Object.freeze({
    owner: 'LEGACY',
    domain: 'BUYER_INTENT',
    pages: ['workspace', 'conversation'],
    components: ['ConversationTimeline', 'NextActionPanel'],
    outputs: ['intent_score'],
    humanGate: false,
  }),
  'supply.match': Object.freeze({
    owner: 'LEGACY',
    domain: 'SUPPLY_MATCH',
    pages: ['workspace'],
    components: ['DemandCard', 'SupplierGraph'],
    outputs: ['fit_score'],
    humanGate: false,
  }),
  'market.access': Object.freeze({
    owner: 'LEGACY',
    domain: 'MARKET_ACCESS',
    pages: ['workspace'],
    components: ['MarketAccessPanel', 'HumanTakeoverPanel'],
    outputs: ['access_status', 'missing_evidence'],
    humanGate: true,
  }),
  'conversation.qualify': Object.freeze({
    owner: 'LEGACY',
    domain: 'CONVERSATION_QUALIFICATION',
    pages: ['conversation', 'workspace'],
    components: ['ConversationTimeline', 'HumanTakeoverPanel'],
    outputs: ['conversation_score'],
    humanGate: false,
  }),
  'reply.draft': Object.freeze({
    owner: 'LEGACY',
    domain: 'REPLY_DRAFT',
    pages: ['conversation'],
    components: ['ConversationTimeline', 'ApprovalPanel'],
    outputs: ['reply_draft', 'approval'],
    humanGate: true,
  }),
});

export const CAPABILITY_UI_MAP = map;

export const SYSTEM_UI_MAP = Object.freeze({
  collection_runner: Object.freeze({
    owner: 'A1_DATA_ENTRY',
    pages: ['radar', 'dashboard'],
    components: ['OpportunityCard', 'SignalTimeline', 'EvidencePanel'],
    outputFlow: 'Data Source -> Evidence -> Opportunity',
  }),
  opportunity_workspace_bff: Object.freeze({
    owner: 'AGENT_SERVER',
    pages: ['workspace', 'buyer', 'conversation', 'playbook'],
    outputFlow: 'Opportunity + Runtime -> Workspace 1.1.0',
  }),
});

export function capabilityUi(capabilityId) {
  return CAPABILITY_UI_MAP[capabilityId] || null;
}

export function capabilitiesForPage(pageName) {
  return Object.entries(CAPABILITY_UI_MAP)
    .filter(([, config]) => config.pages.includes(pageName))
    .map(([capabilityId]) => capabilityId);
}

export function capabilitiesForComponent(componentName) {
  return Object.entries(CAPABILITY_UI_MAP)
    .filter(([, config]) => config.components.includes(componentName))
    .map(([capabilityId]) => capabilityId);
}
