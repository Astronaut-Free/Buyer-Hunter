export const ViewStatus = Object.freeze({
  IDLE: 'IDLE',
  LOADING: 'LOADING',
  READY: 'READY',
  EMPTY: 'EMPTY',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN',
});

export function classifyView({ loading = false, error = null, value = null } = {}) {
  if (loading) return ViewStatus.LOADING;
  if (error) return ViewStatus.ERROR;
  if (value === undefined) return ViewStatus.UNKNOWN;
  if (value === null) return ViewStatus.EMPTY;
  if (Array.isArray(value) && value.length === 0) return ViewStatus.EMPTY;
  return ViewStatus.READY;
}

export function unknownLabel(value, fallback = '未知') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

export function renderViewState({ status, title, message, retryLabel = '重试', onRetry } = {}) {
  const wrap = document.createElement('section');
  wrap.className = 'qp-v2-card qp-v2-state';
  wrap.dataset.status = status || ViewStatus.UNKNOWN;
  wrap.setAttribute('role', status === ViewStatus.ERROR ? 'alert' : 'status');

  const heading = document.createElement('strong');
  heading.textContent = title || ({
    [ViewStatus.LOADING]: '正在加载',
    [ViewStatus.EMPTY]: '暂无数据',
    [ViewStatus.ERROR]: '加载失败',
    [ViewStatus.UNKNOWN]: '信息待核验',
  }[status] || '');

  const text = document.createElement('p');
  text.textContent = message || ({
    [ViewStatus.LOADING]: '正在读取最新商机经营状态。',
    [ViewStatus.EMPTY]: '当前条件下没有可展示记录。',
    [ViewStatus.ERROR]: '数据读取失败，请检查服务状态后重试。',
    [ViewStatus.UNKNOWN]: '当前字段没有足够证据，界面保持 UNKNOWN。',
  }[status] || '');

  wrap.append(heading, text);

  if (status === ViewStatus.ERROR && typeof onRetry === 'function') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'qp-v2-focus-ring';
    button.textContent = retryLabel;
    button.addEventListener('click', onRetry);
    wrap.appendChild(button);
  }

  return wrap;
}
