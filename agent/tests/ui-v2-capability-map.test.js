import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY_UI_MAP,
  SYSTEM_UI_MAP,
  capabilityUi,
  capabilitiesForPage,
  capabilitiesForComponent,
} from '../ui-v2/capability-map.js';

const REQUIRED_QIANPULSE = [
  'qianpulse.a2.proactive_buyer_development',
  'qianpulse.a3.purchase_timing',
  'qianpulse.a4.supply_match',
  'qianpulse.a5.trade_risk',
  'qianpulse.a6.opportunity_progression',
];

test('A2-A6 each have one explicit V2 UI capability mapping', () => {
  REQUIRED_QIANPULSE.forEach(id => {
    const item = capabilityUi(id);
    assert.ok(item, `${id} missing`);
    assert.ok(item.pages.length > 0, `${id} has no page owner`);
    assert.ok(item.components.length > 0, `${id} has no component owner`);
    assert.ok(item.outputs.length > 0, `${id} has no output contract`);
  });
});

test('A6 owns next action / progression surfaces', () => {
  const a6 = capabilityUi('qianpulse.a6.opportunity_progression');
  assert.ok(a6.components.includes('NextActionPanel'));
  assert.ok(a6.components.includes('ConversationTimeline'));
  assert.ok(a6.components.includes('ApprovalPanel'));
  assert.ok(a6.outputs.includes('next_action'));
  assert.ok(a6.outputs.includes('outcome'));
});

test('A5 owns market access and human risk gate', () => {
  const a5 = capabilityUi('qianpulse.a5.trade_risk');
  assert.ok(a5.components.includes('MarketAccessPanel'));
  assert.ok(a5.components.includes('HumanTakeoverPanel'));
  assert.equal(a5.humanGate, true);
});

test('page and component reverse lookups remain deterministic', () => {
  const workspace = capabilitiesForPage('workspace');
  assert.ok(workspace.includes('qianpulse.a3.purchase_timing'));
  assert.ok(workspace.includes('qianpulse.a4.supply_match'));
  assert.ok(workspace.includes('qianpulse.a5.trade_risk'));
  assert.ok(workspace.includes('qianpulse.a6.opportunity_progression'));

  const nextAction = capabilitiesForComponent('NextActionPanel');
  assert.ok(nextAction.includes('qianpulse.a6.opportunity_progression'));
  assert.ok(nextAction.includes('qianpulse.a3.purchase_timing'));
});

test('system entry and BFF ownership are explicit', () => {
  assert.equal(SYSTEM_UI_MAP.collection_runner.owner, 'A1_DATA_ENTRY');
  assert.match(SYSTEM_UI_MAP.collection_runner.outputFlow, /Evidence/);
  assert.equal(SYSTEM_UI_MAP.opportunity_workspace_bff.owner, 'AGENT_SERVER');
  assert.match(SYSTEM_UI_MAP.opportunity_workspace_bff.outputFlow, /1\.1\.0/);
});

test('all capability mappings are provider-neutral', () => {
  const json = JSON.stringify(CAPABILITY_UI_MAP);
  assert.doesNotMatch(json, /apollo|trademo|smartlead|importyeti|volza/i);
});
