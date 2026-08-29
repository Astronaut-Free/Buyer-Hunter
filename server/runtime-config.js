const LIVE_REQUIRED = Object.freeze([
  'SMARTLEAD_API_KEY',
  'SMARTLEAD_CAMPAIGN_ID',
  'SMARTLEAD_WEBHOOK_SECRET',
  'APOLLO_API_KEY',
  'TRADEMO_BUYER_LIST_URL'
]);

function present(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function inspectRuntimeConfig(env = process.env) {
  const externalMode = String(env.QIANPULSE_EXTERNAL_MODE || 'sandbox').trim().toLowerCase();
  const missing = LIVE_REQUIRED.filter(key => !present(env[key]));
  const trademAuth = {
    api_key: present(env.TRADEMO_API_KEY),
    header: present(env.TRADEMO_API_KEY_HEADER),
    prefix: present(env.TRADEMO_API_KEY_PREFIX)
  };
  return {
    external_mode: externalMode,
    live: externalMode === 'live',
    missing_live_required: missing,
    providers: {
      apollo: present(env.APOLLO_API_KEY) ? 'configured' : 'not-configured',
      trademo: present(env.TRADEMO_BUYER_LIST_URL) ? 'endpoint-configured' : 'not-configured',
      trademo_auth: trademAuth,
      smartlead: present(env.SMARTLEAD_API_KEY) ? 'configured' : 'not-configured',
      smartlead_campaign: present(env.SMARTLEAD_CAMPAIGN_ID) ? 'configured' : 'not-configured',
      smartlead_webhook: present(env.SMARTLEAD_WEBHOOK_SECRET) ? 'configured' : 'not-configured'
    }
  };
}

export function assertRuntimeConfig(env = process.env) {
  const config = inspectRuntimeConfig(env);
  if (config.live && config.missing_live_required.length) {
    const error = new Error(`QianPulse live mode missing required configuration: ${config.missing_live_required.join(', ')}`);
    error.code = 'LIVE_CONFIG_INCOMPLETE';
    error.missing = config.missing_live_required;
    throw error;
  }
  return config;
}

export { LIVE_REQUIRED };
