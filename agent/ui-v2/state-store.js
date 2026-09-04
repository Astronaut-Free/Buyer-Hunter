function freezeShallow(value) {
  return Object.freeze({ ...value });
}

const initialState = freezeShallow({
  route: { name: 'dashboard', params: {} },
  auth: { status: 'UNKNOWN', user: null },
  opportunities: { status: 'IDLE', items: [], error: null },
  activeOpportunity: { status: 'IDLE', id: null, workspace: null, error: null },
  mission: { status: 'IDLE', draft: null, run: null, error: null },
  conversation: { status: 'IDLE', thread: null, messages: [], error: null },
  ui: { sidebarOpen: true, busyCount: 0 },
});

let state = initialState;
const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(listener) {
  if (typeof listener !== 'function') throw new TypeError('listener must be a function');
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(patch, meta = {}) {
  const nextPatch = typeof patch === 'function' ? patch(state) : patch;
  if (!nextPatch || typeof nextPatch !== 'object') return state;
  state = freezeShallow({ ...state, ...nextPatch });
  for (const listener of listeners) listener(state, meta);
  return state;
}

export function updateSlice(key, patch, meta = {}) {
  return setState(current => ({
    [key]: freezeShallow({
      ...(current[key] || {}),
      ...(typeof patch === 'function' ? patch(current[key] || {}) : patch),
    }),
  }), { ...meta, slice: key });
}

export function beginBusy(reason = 'request') {
  updateSlice('ui', current => ({ busyCount: (current.busyCount || 0) + 1 }), { type: 'BUSY_BEGIN', reason });
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    updateSlice('ui', current => ({ busyCount: Math.max(0, (current.busyCount || 0) - 1) }), { type: 'BUSY_END', reason });
  };
}

export function resetStore() {
  state = initialState;
  for (const listener of listeners) listener(state, { type: 'RESET' });
}
