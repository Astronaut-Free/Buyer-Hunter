export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  const { className, text, attrs = {}, dataset = {}, on = {} } = options;
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(name, String(value));
  }
  for (const [name, value] of Object.entries(dataset)) {
    if (value !== undefined && value !== null) node.dataset[name] = String(value);
  }
  for (const [event, handler] of Object.entries(on)) {
    if (typeof handler === 'function') node.addEventListener(event, handler);
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child instanceof Node) node.appendChild(child);
    else if (child !== undefined && child !== null) node.appendChild(document.createTextNode(String(child)));
  }
  return node;
}

export function textOrUnknown(value, fallback = '未知') {
  return value === undefined || value === null || String(value).trim() === '' ? fallback : String(value);
}

export function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatScore(value) {
  const number = numberOrNull(value);
  return number === null ? '—' : String(Math.round(number));
}

export function formatDateTime(value) {
  if (!value) return '未知时间';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function toneForStatus(value) {
  const status = String(value || '').toUpperCase();
  if (['WON', 'PURSUE_NOW', 'READY', 'COMPLETED', 'PASS', 'APPROVED'].includes(status)) return 'success';
  if (['LOST', 'BLOCKED', 'FAILED', 'REJECTED', 'STOPPED'].includes(status)) return 'danger';
  if (['WATCH', 'VERIFY_FIRST', 'WAITING_EVIDENCE', 'WAITING_APPROVAL', 'PENDING'].includes(status)) return 'warning';
  return 'unknown';
}

export function safeExternalLink(url, label = '查看来源') {
  if (!url) return el('span', { className: 'qp-v2-muted', text: '无公开链接' });
  try {
    const parsed = new URL(url, location.href);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    return el('a', {
      className: 'qp-v2-link qp-v2-focus-ring',
      text: label,
      attrs: { href: parsed.href, target: '_blank', rel: 'noopener noreferrer' },
    });
  } catch {
    return el('span', { className: 'qp-v2-muted', text: '来源链接无效' });
  }
}
