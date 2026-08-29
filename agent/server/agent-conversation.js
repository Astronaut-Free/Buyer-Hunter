/**
 * Agent conversation surfaces: seller intake and opportunity advisory.
 *
 * Two endpoints in the workbench frontends (`agent/index.html`, and the
 * reference designs under `agent/reference/`) drive a chat panel:
 *   POST /api/v1/agent/intake  -- seller onboarding: collect the capability profile
 *   POST /api/v1/agent/chat    -- ask about one bound Opportunity
 *
 * DeepSeek answers when DEEPSEEK_API_KEY is set. Without a key (or on any
 * provider failure) a deterministic responder takes over so the flow still
 * works on a clean machine.
 *
 * INTEGRITY: the fallback only *asks questions* and *restates fields already
 * present in the payload. It never asserts a fact, never invents buyer demand,
 * quantity, certification or market access. Every response reports which
 * provider produced it so the client can label it.
 */

const INTAKE_SYSTEM = [
  '你是黔脉 QianPulse 的卖家入驻顾问，服务对象是贵州的生产企业。',
  '通过自然对话收集卖家的：产品、规格、MOQ、月产能、目标市场、目标买家类型、已有认证。',
  '读取对话中已经提供的信息，不要重复询问已回答过的字段；每次只问一个最关键的缺口。',
  '直接用人话提问，不要输出技术术语、JSON 或固定模板。',
  '绝不替卖家编造产能、认证或价格；不确定就问。'
].join(' ');

const ADVISORY_SYSTEM = [
  '你是黔脉 QianPulse 的 B2B 出口商机顾问。',
  '只基于提供的买家上下文回答，不得编造未提供的数量、法规或认证结论。',
  '回答用简洁中文，结构为：结论、依据、不确定性、建议下一步。',
  '涉及法律、出口合规、食品安全时必须明确「需要人工/专业机构复核」，不能给出保证。'
].join(' ');

// asked in this order; the first empty one is the next question
const PROFILE_FIELDS = [
  ['product', '您主要生产或供应什么产品？'],
  ['specification', '这款产品的规格是怎样的？比如等级、目数、包装形式。'],
  ['capacity', '您的月产能大概是多少？'],
  ['moq', '最小起订量（MOQ）是多少？'],
  ['markets', '您希望进入哪些目标市场？'],
  ['buyer_type', '您更想对接哪类买家？比如进口商、品牌方、分销商。'],
  ['certifications', '目前已经拿到哪些认证或检测报告？'],
];

const filled = value => typeof value === 'string' ? value.trim() !== '' : Boolean(value);

/** Deterministic intake turn: ask for the first field the seller has not given. */
export function ruleIntakeReply({ profile = {}, message = '' } = {}) {
  const next = PROFILE_FIELDS.find(([key]) => !filled(profile[key]));
  const known = PROFILE_FIELDS.filter(([key]) => filled(profile[key]));
  if (!next) {
    const summary = known.map(([key]) => `${key}: ${String(profile[key]).trim()}`).join('；');
    return `已记录您的企业能力档案（${summary}）。接下来可以在「商机工作区」查看与之匹配的全球采购需求。`;
  }
  const lead = known.length
    ? `已记录 ${known.length} 项能力信息。`
    : (String(message).trim() ? '收到。' : '');
  return `${lead}${next[1]}`;
}

/** Deterministic advisory turn: restate what is on the record, assert nothing. */
export function ruleAdvisoryReply(opportunity = {}) {
  const fields = opportunity.fields || {};
  const rows = [
    ['产品', fields.product || fields.demand_title],
    ['数量', fields.quantity],
    ['目的地', fields.destination || opportunity.buyer?.market],
    ['认证要求', fields.certification],
    ['阶段', opportunity.stage || opportunity.status],
  ].filter(([, v]) => filled(v));
  const body = rows.length
    ? rows.map(([k, v]) => `${k}：${v}`).join('\n')
    : '当前这笔商机尚无已核验的结构化字段。';
  return [
    '（规则兜底回答：未配置 DEEPSEEK_API_KEY，以下只复述系统已记录的字段，不做推断。）',
    body,
    '需要完整的商业判断时，请配置 DeepSeek 密钥或交由人工复核。'
  ].join('\n');
}

/**
 * @param {object} deps
 * @param {() => object|null} deps.createClient  returns a DeepSeek client or null
 */
export function createAgentConversation({ createClient } = {}) {
  function client() {
    try {
      return typeof createClient === 'function' ? createClient() : null;
    } catch {
      return null; // no key / bad config -> deterministic path
    }
  }

  async function intake({ message = '', profile = {}, history = [] } = {}) {
    const text = String(message || '').trim();
    if (!text) return { ok: false, code: 'MESSAGE_REQUIRED', error: 'message 不能为空' };

    const api = client();
    if (api) {
      try {
        const transcript = (Array.isArray(history) ? history : [])
          .filter(item => item && item.content)
          .slice(-12)
          .map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content) }));
        const known = Object.entries(profile || {}).filter(([, v]) => filled(v));
        const context = known.length
          ? `卖家已提供：${known.map(([k, v]) => `${k}=${v}`).join('；')}。`
          : '卖家尚未提供任何能力信息。';
        const answer = await api.chat({
          system: INTAKE_SYSTEM,
          messages: [...transcript, { role: 'user', content: `${context}\n卖家最新回答：${text}` }]
        });
        return { ok: true, answer, provider: 'deepseek', model: api.model };
      } catch (error) {
        return {
          ok: true,
          answer: ruleIntakeReply({ profile, message: text }),
          provider: 'rules-fallback',
          fallback_reason: error.message
        };
      }
    }
    return {
      ok: true,
      answer: ruleIntakeReply({ profile, message: text }),
      provider: 'rules-fallback',
      fallback_reason: '未配置 DEEPSEEK_API_KEY'
    };
  }

  async function advise({ message = '', opportunity = null } = {}) {
    const text = String(message || '').trim();
    if (!text) return { ok: false, code: 'MESSAGE_REQUIRED', error: 'message 不能为空' };
    if (!opportunity) return { ok: false, code: 'NEEDS_CONTEXT', error: '缺少可访问的 Opportunity' };

    const context = {
      buyer: opportunity.buyer,
      demand: opportunity.fields,
      scores: { fit: opportunity.fit_score, intent: opportunity.intent_score },
      stage: opportunity.stage || opportunity.status,
      evidence: opportunity.evidence_ids || []
    };
    const api = client();
    if (api) {
      try {
        const answer = await api.chat({
          system: ADVISORY_SYSTEM,
          messages: [{ role: 'user', content: `买家上下文：${JSON.stringify(context)}\n卖家问题：${text}` }]
        });
        return { ok: true, answer, provider: 'deepseek', model: api.model, opportunity_id: opportunity.id };
      } catch (error) {
        return {
          ok: true,
          answer: ruleAdvisoryReply(opportunity),
          provider: 'rules-fallback',
          fallback_reason: error.message,
          opportunity_id: opportunity.id
        };
      }
    }
    return {
      ok: true,
      answer: ruleAdvisoryReply(opportunity),
      provider: 'rules-fallback',
      fallback_reason: '未配置 DEEPSEEK_API_KEY',
      opportunity_id: opportunity.id
    };
  }

  return { intake, advise };
}

export { INTAKE_SYSTEM, ADVISORY_SYSTEM, PROFILE_FIELDS };
