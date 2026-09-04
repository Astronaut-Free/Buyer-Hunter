import { getState, subscribe } from './state-store.js';
import { routeHref, startRouter } from './router.js';
import { renderViewState, ViewStatus } from './view-state.js';

const pageLoaders = new Map();

export function registerPage(name, loader) {
  if (!name || typeof loader !== 'function') throw new TypeError('page name and loader are required');
  pageLoaders.set(name, loader);
}

function navItem(name, label, active) {
  const link = document.createElement('a');
  link.href = routeHref(name);
  link.textContent = label;
  link.className = active ? 'active' : '';
  link.dataset.route = name;
  return link;
}

function renderNavigation(route) {
  const nav = document.createElement('nav');
  nav.className = 'qp-v2-shell-nav';
  nav.append(
    navItem('dashboard', '商机驾驶舱', route.name === 'dashboard'),
    navItem('radar', '全球机会', route.name === 'radar'),
    navItem('mission', 'BD Mission', route.name === 'mission'),
    navItem('playbook', '成交复盘', route.name === 'playbook'),
  );
  return nav;
}

async function renderPage(root, route) {
  const content = root.querySelector('[data-qp-v2-content]');
  if (!content) return;
  content.replaceChildren(renderViewState({ status: ViewStatus.LOADING }));

  const loader = pageLoaders.get(route.name);
  if (!loader) {
    content.replaceChildren(renderViewState({
      status: ViewStatus.UNKNOWN,
      title: '页面组件待接入',
      message: `V2 路由 ${route.name} 已建立，页面组件将在对应工程阶段接入。`,
    }));
    return;
  }

  try {
    const page = await loader({ route, state: getState() });
    const node = page instanceof Node ? page : null;
    content.replaceChildren(node || renderViewState({ status: ViewStatus.EMPTY }));
  } catch (error) {
    content.replaceChildren(renderViewState({
      status: ViewStatus.ERROR,
      message: error?.message || '页面加载失败',
      onRetry: () => renderPage(root, route),
    }));
  }
}

function paintShell(root, route) {
  root.classList.add('qp-v2-shell');
  root.innerHTML = '';

  const sidebar = document.createElement('aside');
  sidebar.className = 'qp-v2-shell-side';
  const brand = document.createElement('div');
  brand.className = 'qp-v2-shell-brand';
  brand.innerHTML = '<strong>黔脉 QianPulse</strong><span>全球商机经营智能平台</span>';
  sidebar.append(brand, renderNavigation(route));

  const main = document.createElement('main');
  main.className = 'qp-v2-shell-main';
  main.dataset.qpV2Content = '';

  root.append(sidebar, main);
}

export function mountViewShell(root) {
  if (!root) throw new Error('V2 shell root required');

  let currentRoute = getState().route;
  paintShell(root, currentRoute);
  renderPage(root, currentRoute);

  const stopStore = subscribe((state, meta) => {
    if (meta?.type !== 'ROUTE_CHANGED') return;
    currentRoute = state.route;
    paintShell(root, currentRoute);
    renderPage(root, currentRoute);
  });

  const stopRouter = startRouter();
  return () => {
    stopStore();
    stopRouter();
  };
}
