import { mountQianPulseV2, unmountQianPulseV2 } from './app.js';
import { routeHref } from './router.js';

const ROOT_ID = 'qianpulse-v2-root';
const LEGACY_VIEW_SELECTOR = '.view';
let mounted = false;

function isV2Hash(hash = location.hash) {
  return String(hash || '').startsWith('#/');
}

function root() {
  let node = document.getElementById(ROOT_ID);
  if (!node) {
    node = document.createElement('div');
    node.id = ROOT_ID;
    node.hidden = true;
    document.body.appendChild(node);
  }
  return node;
}

function legacyViews() {
  return [...document.querySelectorAll(LEGACY_VIEW_SELECTOR)];
}

function showV2() {
  const node = root();
  legacyViews().forEach(view => {
    view.dataset.qpV2PreviousDisplay = view.style.display || '';
    view.style.display = 'none';
  });
  node.hidden = false;
  if (!mounted) {
    mountQianPulseV2(node);
    mounted = true;
  }
}

function showLegacy() {
  if (mounted) {
    unmountQianPulseV2();
    mounted = false;
  }
  const node = document.getElementById(ROOT_ID);
  if (node) {
    node.hidden = true;
    node.replaceChildren();
  }
  legacyViews().forEach(view => {
    view.style.display = view.dataset.qpV2PreviousDisplay || '';
    delete view.dataset.qpV2PreviousDisplay;
  });
}

function installLegacyEntry() {
  const side = document.querySelector('#workspace .ws-side');
  if (!side || side.querySelector('[data-qp-v2-entry]')) return;
  const entry = document.createElement('a');
  entry.href = routeHref('dashboard');
  entry.className = 'home-link';
  entry.dataset.qpV2Entry = '';
  entry.textContent = '进入 V2 商机经营台 →';
  entry.title = '进入组件化 V2 工作台；原工作台保持可回退';
  const brand = side.querySelector('.ws-brand');
  if (brand?.nextSibling) brand.parentNode.insertBefore(entry, brand.nextSibling);
  else side.prepend(entry);
}

function sync() {
  installLegacyEntry();
  if (isV2Hash()) showV2();
  else showLegacy();
}

export function installLegacyBridge() {
  sync();
  window.addEventListener('hashchange', sync);
  return () => {
    window.removeEventListener('hashchange', sync);
    showLegacy();
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  installLegacyBridge();
}
