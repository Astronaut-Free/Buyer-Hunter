import { mountViewShell } from './view-shell.js';
import { registerV2Pages } from './pages/index.js';

let stop = null;

export function mountQianPulseV2(root) {
  if (!(root instanceof Element)) throw new TypeError('QianPulse V2 root element required');
  if (stop) stop();
  registerV2Pages();
  stop = mountViewShell(root);
  return () => {
    stop?.();
    stop = null;
  };
}

export function unmountQianPulseV2() {
  stop?.();
  stop = null;
}
