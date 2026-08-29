// Compatibility entrypoint. The canonical A6 implementation lives in the
// modular runtime so intent, evidence, stage, safety, and contract rules are
// shared by every caller.
export {
  runA6Skill,
  A6_CAPABILITY_ID,
  A6_VERSION
} from './a6/index.js';
