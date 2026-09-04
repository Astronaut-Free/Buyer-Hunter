import { updateSlice } from './state-store.js';

export const routes = Object.freeze({
  dashboard: { hash: '#/dashboard', title: '商机驾驶舱' },
  radar: { hash: '#/opportunities', title: '全球机会雷达' },
  workspace: { hash: '#/opportunity/:id', title: '商机工作台' },
  buyer: { hash: '#/buyer/:id', title: '买家情报' },
  mission: { hash: '#/mission', title: 'BD Mission' },
  conversation: { hash: '#/conversation/:id', title: '沟通推进' },
  playbook: { hash: '#/playbook', title: '成交与复盘' },
});

function segments(hash) {
  return String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
}

export function parseRoute(hash = location.hash) {
  const parts = segments(hash);
  if (!parts.length) return { name: 'dashboard', params: {} };

  if (parts[0] === 'dashboard') return { name: 'dashboard', params: {} };
  if (parts[0] === 'opportunities') return { name: 'radar', params: {} };
  if (parts[0] === 'opportunity' && parts[1]) return { name: 'workspace', params: { id: decodeURIComponent(parts[1]) } };
  if (parts[0] === 'buyer' && parts[1]) return { name: 'buyer', params: { id: decodeURIComponent(parts[1]) } };
  if (parts[0] === 'mission') return { name: 'mission', params: {} };
  if (parts[0] === 'conversation' && parts[1]) return { name: 'conversation', params: { id: decodeURIComponent(parts[1]) } };
  if (parts[0] === 'playbook') return { name: 'playbook', params: {} };

  return { name: 'dashboard', params: {}, unknownHash: hash };
}

export function routeHref(name, params = {}) {
  const route = routes[name];
  if (!route) return routes.dashboard.hash;
  return route.hash.replace(':id', encodeURIComponent(params.id || ''));
}

export function navigate(name, params = {}, { replace = false } = {}) {
  const href = routeHref(name, params);
  if (replace) history.replaceState(null, '', href);
  else location.hash = href.slice(1);
}

export function startRouter({ onRoute } = {}) {
  const sync = () => {
    const route = parseRoute();
    updateSlice('route', route, { type: 'ROUTE_CHANGED' });
    if (typeof onRoute === 'function') onRoute(route);
  };

  window.addEventListener('hashchange', sync);
  sync();
  return () => window.removeEventListener('hashchange', sync);
}
