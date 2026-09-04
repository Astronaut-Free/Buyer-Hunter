import { registerPage } from '../view-shell.js';
import { renderDashboardPage } from './dashboard.js';
import { renderOpportunityRadarPage } from './opportunity-radar.js';
import { renderOpportunityWorkspacePage } from './opportunity-workspace.js';
import { renderBuyerIntelligencePage } from './buyer-intelligence.js';
import { renderBdMissionPage } from './bd-mission.js';
import { renderConversationPage } from './conversation.js';
import { renderPlaybookPage } from './playbook.js';

let registered = false;

export function registerV2Pages() {
  if (registered) return;
  registerPage('dashboard', renderDashboardPage);
  registerPage('radar', renderOpportunityRadarPage);
  registerPage('workspace', renderOpportunityWorkspacePage);
  registerPage('buyer', renderBuyerIntelligencePage);
  registerPage('mission', renderBdMissionPage);
  registerPage('conversation', renderConversationPage);
  registerPage('playbook', renderPlaybookPage);
  registered = true;
}

export {
  renderDashboardPage,
  renderOpportunityRadarPage,
  renderOpportunityWorkspacePage,
  renderBuyerIntelligencePage,
  renderBdMissionPage,
  renderConversationPage,
  renderPlaybookPage,
};
