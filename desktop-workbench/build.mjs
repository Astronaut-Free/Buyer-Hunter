import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
const dir = dirname(fileURLToPath(import.meta.url));
const output = join(dir, 'qianpulse-desktop-workbench.html');
const prior = existsSync(output) ? readFileSync(output, 'utf8') : '';
const embedded = prior.match(/const ASSETS=\{background:'([^']+)',agent:'([^']+)',user:'([^']+)'/);
const fallback = embedded ? { BACKGROUND: embedded[1], AGENT: embedded[2], USER: embedded[3] } : {};
fallback.LOGO = prior.match(/logo:'([^']+)'/)?.[1];
let html = readFileSync(join(dir, 'workbench.source.html'), 'utf8');
html = html.replace('@@DESIGN_CSS@@', () => readFileSync(join(dir, 'workbench.v2.css'), 'utf8'));
for (const [key, path] of Object.entries({
  BACKGROUND: join(dir, 'assets/chat-background.jpg'),
  AGENT: join(dir, 'assets/agent-avatar.jpg'),
  USER: join(dir, 'assets/user-avatar.jpg'),
  LOGO: join(dir, 'assets/qianpulse-logo-original.jpg')
})) {
  const asset = existsSync(path) ? `data:image/jpeg;base64,${readFileSync(path).toString('base64')}` : fallback[key];
  if (!asset) throw new Error(`Missing supplied image and embedded fallback: ${key}`);
  html = html.replaceAll(`@@${key}@@`, () => asset);
}
if (/@@[A-Z_]+@@/.test(html)) throw new Error('Unresolved template placeholder');
for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(script);
writeFileSync(join(dir, 'qianpulse-desktop-workbench.html'), html);
console.log('Built self-contained qianpulse-desktop-workbench.html');
