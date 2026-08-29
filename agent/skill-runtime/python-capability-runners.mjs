/**
 * Python-delegating dependency runners.
 *
 * A6's buyer-reply cycle refreshes invalidated A3/A4/A5/A8 through synchronous
 * "runners" (skill-runtime/dependency-refresh.js). These runners shell out to
 * Free's authoritative Python implementation (scripts/capability_cli.py) and
 * fall back to the bundled Node runner on any failure — so the agent behaves
 * identically when Python is unavailable.
 *
 * Wire in via createLiveA2A6Runtime({ dependencyRunners }).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DEPENDENCY_RUNNERS } from './dependency-refresh.js';
import { A3_CAPABILITY_ID } from './a3.js';
import { A4_CAPABILITY_ID } from './a4.js';
import { A5_CAPABILITY_ID } from './a5.js';
import { A8_CAPABILITY_ID } from './a8.js';

const DEFAULT_CLI = fileURLToPath(new URL('../../scripts/capability_cli.py', import.meta.url));

/**
 * @param {object} [opts]
 * @param {string} [opts.pythonBin='python']  python interpreter
 * @param {string} [opts.cliPath]             path to scripts/capability_cli.py
 * @param {number} [opts.timeoutMs=8000]
 * @param {object} [opts.fallback]            capability_id -> Node runner (defaults to bundled)
 * @param {(msg: string) => void} [opts.onFallback]
 */
export function createPythonDependencyRunners({
  pythonBin = process.env.PYTHON_BIN || 'python',
  cliPath = DEFAULT_CLI,
  timeoutMs = 8000,
  fallback = DEFAULT_DEPENDENCY_RUNNERS,
  onFallback = () => {},
} = {}) {
  function delegate(capabilityId, context) {
    const nodeRunner = fallback[capabilityId];
    try {
      const stdout = execFileSync(pythonBin, [cliPath], {
        input: JSON.stringify({ capability: capabilityId, context }),
        encoding: 'utf8',
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const envelope = JSON.parse(stdout);
      if (!envelope || !envelope.capability_id || !envelope.run_status) {
        throw new Error('capability CLI returned a malformed envelope');
      }
      envelope.domain_result = { ...(envelope.domain_result || {}), source: 'python' };
      return envelope;
    } catch (error) {
      const reason = error.code || error.message || 'unknown';
      onFallback(`${capabilityId}: python capability unavailable (${reason}); using node runner`);
      if (typeof nodeRunner !== 'function') {
        return {
          capability_id: capabilityId,
          capability_version: 'fallback',
          run_status: 'MORE_EVIDENCE',
          changed_fields: context?.changed_fields || [],
          missing_evidence: [`runner:${capabilityId}`],
          evidence_refs: [],
          human_review_required: false,
          domain_result: { source: 'node-fallback', fallback_reason: reason },
          error: null,
        };
      }
      const envelope = nodeRunner(context) || {};
      envelope.domain_result = {
        ...(envelope.domain_result || {}),
        source: 'node-fallback',
        fallback_reason: reason,
      };
      return envelope;
    }
  }

  return {
    [A3_CAPABILITY_ID]: (context) => delegate(A3_CAPABILITY_ID, context),
    [A4_CAPABILITY_ID]: (context) => delegate(A4_CAPABILITY_ID, context),
    [A5_CAPABILITY_ID]: (context) => delegate(A5_CAPABILITY_ID, context),
    [A8_CAPABILITY_ID]: (context) => delegate(A8_CAPABILITY_ID, context),
  };
}

/** One-shot probe used at boot to decide whether to enable Python runners. */
export function pythonCapabilitiesAvailable({
  pythonBin = process.env.PYTHON_BIN || 'python',
  cliPath = DEFAULT_CLI,
} = {}) {
  try {
    const out = execFileSync(pythonBin, [cliPath], {
      input: JSON.stringify({
        capability: A4_CAPABILITY_ID,
        context: {
          opportunity_id: '__probe__',
          changed_fields: [],
          opportunity_state: { fields: { product: 'MATCHA', demand_title: 'probe', quantity: '100 kg', destination: 'US' } },
          seller_context: {},
          latest_buyer_message: { content: '' },
        },
      }),
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const env = JSON.parse(out);
    return Boolean(env && env.capability_id === A4_CAPABILITY_ID);
  } catch {
    return false;
  }
}

export { DEFAULT_CLI as CAPABILITY_CLI_PATH };
