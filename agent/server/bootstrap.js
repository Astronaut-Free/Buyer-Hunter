import { assertRuntimeConfig } from './runtime-config.js';

globalThis.DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
globalThis.QIANPULSE_RUNTIME_CONFIG = assertRuntimeConfig(process.env);

await import('./index.js');
