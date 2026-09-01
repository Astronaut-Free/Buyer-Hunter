/** Async adapter for the authoritative Python A3/A4/A5 runtimes. */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID } from './capability-ids.js';
import { validateCapabilityEnvelope } from './validators.js';

const DEFAULT_CLI = fileURLToPath(new URL('../../scripts/capability_cli.py', import.meta.url));
const CAPABILITY_IDS = [A3_CAPABILITY_ID, A4_CAPABILITY_ID, A5_CAPABILITY_ID];

function executeCapability({ pythonBin, cliPath, timeoutMs, maxBuffer }, payload) {
  return new Promise((resolve, reject) => {
    const child = execFile(pythonBin, [cliPath], {
      encoding: 'utf8', timeout: timeoutMs, maxBuffer, windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(error);
      } else {
        resolve(stdout);
      }
    });
    child.stdin.on('error', reject);
    child.stdin.end(JSON.stringify(payload));
  });
}

function runtimeError(capabilityId, context, error) {
  const reason = error?.code || error?.message || 'unknown';
  return {
    capability_id: capabilityId,
    capability_version: 'runtime-error',
    run_status: 'ERROR',
    changed_fields: context?.changed_fields || [],
    missing_evidence: [],
    evidence_refs: [],
    human_review_required: true,
    domain_result: {},
    error: {
      code: 'CAPABILITY_RUNTIME_UNAVAILABLE',
      message: String(reason),
      stderr: error?.stderr ? String(error.stderr).slice(0, 2000) : null
    }
  };
}

export function createPythonDependencyRunners({
  pythonBin = process.env.PYTHON_BIN || 'python',
  cliPath = DEFAULT_CLI,
  timeoutMs = 8000,
  maxBuffer = 1024 * 1024,
  onError = () => {}
} = {}) {
  async function delegate(capabilityId, context) {
    try {
      const stdout = await executeCapability(
        { pythonBin, cliPath, timeoutMs, maxBuffer },
        { capability: capabilityId, context }
      );
      const envelope = JSON.parse(stdout);
      const validation = validateCapabilityEnvelope(envelope);
      if (!validation.valid || envelope.capability_id !== capabilityId) {
        throw new Error(`invalid capability envelope: ${validation.errors.join(', ')}`);
      }
      envelope.domain_result = { ...(envelope.domain_result || {}), source: 'python' };
      return envelope;
    } catch (error) {
      const envelope = runtimeError(capabilityId, context, error);
      onError(envelope.error);
      return envelope;
    }
  }

  return Object.fromEntries(CAPABILITY_IDS.map(capabilityId => [
    capabilityId,
    context => delegate(capabilityId, context)
  ]));
}

export async function pythonCapabilitiesAvailable({
  pythonBin = process.env.PYTHON_BIN || 'python',
  cliPath = DEFAULT_CLI,
  timeoutMs = 10000
} = {}) {
  const runners = createPythonDependencyRunners({ pythonBin, cliPath, timeoutMs });
  const envelope = await runners[A3_CAPABILITY_ID]({
    opportunity_id: '__probe__', evaluated_at: '2000-01-01T00:00:00Z',
    latest_buyer_message: { content: '', evidence_refs: [] }, opportunity_state: { fields: {} }
  });
  return envelope.run_status !== 'ERROR';
}

export { DEFAULT_CLI as CAPABILITY_CLI_PATH };
