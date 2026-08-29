import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRuntimeConfig, inspectRuntimeConfig } from '../server/runtime-config.js';

test('sandbox mode reports provider readiness without blocking startup', () => {
  const config = assertRuntimeConfig({ QIANPULSE_EXTERNAL_MODE: 'sandbox' });
  assert.equal(config.live, false);
  assert.equal(config.providers.smartlead, 'not-configured');
  assert.ok(config.missing_live_required.includes('SMARTLEAD_API_KEY'));
});

test('live mode fails fast when production integrations are incomplete', () => {
  assert.throws(
    () => assertRuntimeConfig({ QIANPULSE_EXTERNAL_MODE: 'live', SMARTLEAD_API_KEY: 'key' }),
    error => error.code === 'LIVE_CONFIG_INCOMPLETE' && error.missing.includes('SMARTLEAD_WEBHOOK_SECRET')
  );
});

test('live mode passes when required provider configuration exists', () => {
  const env = {
    QIANPULSE_EXTERNAL_MODE: 'live',
    SMARTLEAD_API_KEY: 'smart-key',
    SMARTLEAD_CAMPAIGN_ID: '123',
    SMARTLEAD_WEBHOOK_SECRET: 'hook-secret',
    APOLLO_API_KEY: 'apollo-key',
    TRADEMO_BUYER_LIST_URL: 'https://trade.example/buyers',
    TRADEMO_API_KEY: 'trade-key',
    TRADEMO_API_KEY_HEADER: 'x-api-key'
  };
  const config = assertRuntimeConfig(env);
  assert.equal(config.live, true);
  assert.deepEqual(config.missing_live_required, []);
  assert.equal(config.providers.apollo, 'configured');
  assert.equal(config.providers.smartlead_campaign, 'configured');
});

test('runtime config exposes Trademo auth details without requiring a guessed protocol', () => {
  const config = inspectRuntimeConfig({
    TRADEMO_BUYER_LIST_URL: 'https://trade.example/buyers',
    TRADEMO_API_KEY: 'trade-key',
    TRADEMO_API_KEY_HEADER: 'authorization',
    TRADEMO_API_KEY_PREFIX: 'Bearer '
  });
  assert.equal(config.providers.trademo, 'endpoint-configured');
  assert.equal(config.providers.trademo_auth.api_key, true);
  assert.equal(config.providers.trademo_auth.header, true);
  assert.equal(config.providers.trademo_auth.prefix, true);
});
