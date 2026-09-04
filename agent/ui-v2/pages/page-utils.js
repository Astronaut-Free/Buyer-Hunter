import { el } from '../shared/dom.js';
import { renderViewState, ViewStatus } from '../view-state.js';

export function pageRoot(title, subtitle) {
  return el('section', { className: 'qp-v2-page' }, [
    el('header', { className: 'qp-v2-page-head' }, [
      el('div', {}, [
        el('span', { className: 'qp-v2-page-kicker', text: 'QIANPULSE V2' }),
        el('h1', { text: title }),
        subtitle ? el('p', { text: subtitle }) : null,
      ]),
    ]),
  ]);
}

export function sectionGrid(className = '') {
  return el('div', { className: `qp-v2-page-grid ${className}`.trim() });
}

export function metric(label, value, note = '') {
  return el('article', { className: 'qp-v2-page-metric' }, [
    el('span', { text: label }),
    el('strong', { text: value ?? '—' }),
    note ? el('small', { text: note }) : null,
  ]);
}

export function loading(message = '正在读取最新商机经营状态。') {
  return renderViewState({ status: ViewStatus.LOADING, message });
}

export function errorState(error, onRetry) {
  return renderViewState({
    status: ViewStatus.ERROR,
    message: error?.message || '页面加载失败',
    onRetry,
  });
}

export function emptyState(title, message) {
  return renderViewState({ status: ViewStatus.EMPTY, title, message });
}

export function unknownState(title, message) {
  return renderViewState({ status: ViewStatus.UNKNOWN, title, message });
}

export function idempotencyKey(prefix = 'ui') {
  if (globalThis.crypto?.randomUUID) return `${prefix}:${crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export function button(label, onClick, { secondary = false, disabled = false } = {}) {
  return el('button', {
    className: `${secondary ? 'qp-v2-secondary-button' : 'qp-v2-primary-button'} qp-v2-focus-ring`,
    text: label,
    attrs: { type: 'button', disabled: disabled ? 'disabled' : null },
    on: { click: disabled ? undefined : onClick },
  });
}
