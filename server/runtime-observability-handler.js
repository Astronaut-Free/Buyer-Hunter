import { createRuntimeObservability } from './runtime-observability.js';

export function createRuntimeObservabilityHandler({ getState, now } = {}) {
  if (typeof getState !== 'function') throw new Error('getState required');

  return function getRuntimeObservability({ user } = {}) {
    if (!user) return { status: 401, body: { code: 'AUTH_REQUIRED', error: '请先登录' } };
    if (user.role !== 'INTERNAL') return { status: 403, body: { code: 'INTERNAL_REQUIRED', error: '只有 INTERNAL 可以查看运行观测数据' } };
    return {
      status: 200,
      body: createRuntimeObservability(getState(), { now })
    };
  };
}
