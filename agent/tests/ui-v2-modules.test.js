import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = join(HERE, '..', 'ui-v2');

const COMPONENTS = [
  'opportunity-card.js',
  'signal-timeline.js',
  'evidence-panel.js',
  'buyer-profile.js',
  'supplier-graph.js',
  'demand-card.js',
  'market-access-panel.js',
  'next-action-panel.js',
  'conversation-timeline.js',
  'voice-conversation-panel.js',
  'human-takeover-panel.js',
  'approval-panel.js',
  'outcome-playbook-panel.js',
];

const PAGES = [
  'dashboard.js',
  'opportunity-radar.js',
  'opportunity-workspace.js',
  'buyer-intelligence.js',
  'bd-mission.js',
  'conversation.js',
  'playbook.js',
];

test('V2 component barrel exports all 13 business components', async () => {
  const module = await import('../ui-v2/components/index.js');
  const renderExports = [
    'renderOpportunityCard',
    'renderSignalTimeline',
    'renderEvidencePanel',
    'renderBuyerProfile',
    'renderSupplierGraph',
    'renderDemandCard',
    'renderMarketAccessPanel',
    'renderNextActionPanel',
    'renderConversationTimeline',
    'renderVoiceConversationPanel',
    'renderHumanTakeoverPanel',
    'renderApprovalPanel',
    'renderOutcomePlaybookPanel',
  ];
  renderExports.forEach(name => assert.equal(typeof module[name], 'function', `${name} missing`));
});

test('V2 page registry module exports all seven page loaders', async () => {
  const module = await import('../ui-v2/pages/index.js');
  const loaders = [
    'renderDashboardPage',
    'renderOpportunityRadarPage',
    'renderOpportunityWorkspacePage',
    'renderBuyerIntelligencePage',
    'renderBdMissionPage',
    'renderConversationPage',
    'renderPlaybookPage',
  ];
  loaders.forEach(name => assert.equal(typeof module[name], 'function', `${name} missing`));
  assert.equal(typeof module.registerV2Pages, 'function');
});

test('all declared V2 component and page files exist', async () => {
  const componentFiles = new Set(await readdir(join(UI, 'components')));
  const pageFiles = new Set(await readdir(join(UI, 'pages')));
  COMPONENTS.forEach(name => assert.ok(componentFiles.has(name), `component missing: ${name}`));
  PAGES.forEach(name => assert.ok(pageFiles.has(name), `page missing: ${name}`));
});

test('business components do not bind provider-specific fields', async () => {
  const forbidden = /\b(apollo|trademo|smartlead|importyeti|volza)\b/i;
  for (const file of COMPONENTS) {
    const content = await readFile(join(UI, 'components', file), 'utf8');
    assert.doesNotMatch(content, forbidden, `${file} must consume business contracts, not provider contracts`);
  }
});

test('Demand Card never substitutes buyer country for destination', async () => {
  const content = await readFile(join(UI, 'components', 'demand-card.js'), 'utf8');
  assert.doesNotMatch(content, /buyer\??\.country|buyer\[['"]country['"]\]/i);
  assert.match(content, /destination/);
  assert.match(content, /UNKNOWN/);
});

test('Next Action stays runtime-owned and respects blockers / approval gate', async () => {
  const content = await readFile(join(UI, 'components', 'next-action-panel.js'), 'utf8');
  assert.match(content, /input\.next_action|input\.nextAction|input\.a6\?\.next_action/);
  assert.match(content, /pendingApproval/);
  assert.match(content, /blockers\.length/);
  assert.doesNotMatch(content, /opportunity_score\s*[+*\/-]|fit_score\s*[+*\/-]|intent_score\s*[+*\/-]/);
});

test('Voice component hard-disables unsupported execution', async () => {
  const content = await readFile(join(UI, 'components', 'voice-conversation-panel.js'), 'utf8');
  assert.match(content, /typeof onStart === 'function'/);
  assert.match(content, /disabled/);
  assert.match(content, /语音能力待接线/);
});

test('legacy bridge is reversible and V2-only hashes are isolated', async () => {
  const content = await readFile(join(UI, 'legacy-bridge.js'), 'utf8');
  assert.match(content, /startsWith\('#\/'\)/);
  assert.match(content, /showV2/);
  assert.match(content, /showLegacy/);
  assert.match(content, /unmountQianPulseV2/);
  assert.match(content, /原工作台保持可回退/);
});
