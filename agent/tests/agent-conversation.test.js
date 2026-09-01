import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAgentConversation,
  ruleIntakeReply,
  ruleAdvisoryReply,
} from '../server/agent-conversation.js';

const OPPORTUNITY = {
  id: 'opp_demo_001',
  buyer: { id: 'b1', name: '美国 · 饮料品牌', market: 'US' },
  fields: { product: '有机饮品级贵州抹茶', quantity: '500 kg/月以上', certification: 'USDA Organic' },
  fit_score: 72,
  intent_score: 81,
  stage: 'CONTACTED',
};

const withClient = answer => createAgentConversation({
  createClient: () => ({ model: 'deepseek-chat', chat: async () => answer })
});
const noClient = () => createAgentConversation({ createClient: () => null });
const failingClient = () => createAgentConversation({
  createClient: () => ({ model: 'deepseek-chat', chat: async () => { throw new Error('upstream 502'); } })
});

// ---- rule responders -------------------------------------------------------

test('rule intake asks for the first unfilled profile field, in order', () => {
  assert.match(ruleIntakeReply({ profile: {} }), /产品/);
  assert.match(ruleIntakeReply({ profile: { product: '抹茶' } }), /规格/);
  assert.match(ruleIntakeReply({ profile: { product: '抹茶', specification: '800目' } }), /月产能/);
});

test('rule intake never re-asks a field the seller already answered', () => {
  const reply = ruleIntakeReply({ profile: { product: '抹茶', specification: '800目', capacity: '8000kg/月' } });
  assert.doesNotMatch(reply, /什么产品/);
  assert.doesNotMatch(reply, /规格是怎样/);
  assert.match(reply, /起订量|MOQ/);
});

test('rule intake closes out once every field is present', () => {
  const profile = { product: 'a', specification: 'b', capacity: 'c', moq: 'd', markets: 'e', buyer_type: 'f', certifications: 'g' };
  assert.match(ruleIntakeReply({ profile }), /已记录您的企业能力档案/);
});

test('rule advisory only restates recorded fields and flags itself as fallback', () => {
  const reply = ruleAdvisoryReply(OPPORTUNITY);
  assert.match(reply, /规则兜底回答/);
  assert.match(reply, /有机饮品级贵州抹茶/);
  assert.match(reply, /500 kg\/月以上/);
  assert.match(reply, /USDA Organic/);
  // it must not invent anything the payload does not carry
  assert.doesNotMatch(reply, /建议报价|预计成交|可以承诺/);
});

test('rule advisory stays honest when the opportunity has no structured fields', () => {
  assert.match(ruleAdvisoryReply({ id: 'x', fields: {} }), /尚无已核验的结构化字段/);
});

// ---- intake ---------------------------------------------------------------

test('intake uses DeepSeek when a client is available', async () => {
  const out = await withClient('请问月产能是多少？').intake({ message: '我们做抹茶', profile: {} });
  assert.equal(out.ok, true);
  assert.equal(out.provider, 'deepseek');
  assert.equal(out.answer, '请问月产能是多少？');
});

test('intake falls back to rules with no key, and reports why', async () => {
  const out = await noClient().intake({ message: '我们做抹茶', profile: { product: '抹茶' } });
  assert.equal(out.ok, true);
  assert.equal(out.provider, 'rules-fallback');
  assert.match(out.fallback_reason, /DEEPSEEK_API_KEY/);
  assert.match(out.answer, /规格/);
});

test('intake falls back to rules when DeepSeek errors, carrying the reason', async () => {
  const out = await failingClient().intake({ message: '我们做抹茶', profile: {} });
  assert.equal(out.provider, 'rules-fallback');
  assert.equal(out.fallback_reason, 'upstream 502');
  assert.ok(out.answer);
});

test('intake rejects an empty message', async () => {
  const out = await noClient().intake({ message: '   ' });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'MESSAGE_REQUIRED');
});

// ---- advisory -------------------------------------------------------------

test('advise uses DeepSeek and binds the opportunity id', async () => {
  const out = await withClient('结论：可以跟进。').advise({ message: '值得追吗', opportunity: OPPORTUNITY });
  assert.equal(out.provider, 'deepseek');
  assert.equal(out.opportunity_id, 'opp_demo_001');
  assert.equal(out.answer, '结论：可以跟进。');
});

test('advise falls back to a restatement when DeepSeek fails', async () => {
  const out = await failingClient().advise({ message: '值得追吗', opportunity: OPPORTUNITY });
  assert.equal(out.provider, 'rules-fallback');
  assert.match(out.answer, /规则兜底回答/);
  assert.equal(out.opportunity_id, 'opp_demo_001');
});

test('advise refuses without a bound opportunity', async () => {
  const out = await noClient().advise({ message: '值得追吗', opportunity: null });
  assert.equal(out.ok, false);
  assert.equal(out.code, 'NEEDS_CONTEXT');
});

test('a client constructor that throws degrades instead of crashing', async () => {
  const conv = createAgentConversation({ createClient: () => { throw new Error('no key'); } });
  const out = await conv.intake({ message: '我们做抹茶', profile: {} });
  assert.equal(out.provider, 'rules-fallback');
  assert.ok(out.answer);
});
