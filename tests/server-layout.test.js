import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'server/index.js',
  'server/decision-engine.js',
  'server/capability-adapter.js',
  'server/output-guard.js',
  'server/repository.js',
  'db/free-opportunities.json',
  'db/schema.sql'
];

test('npm start points to an existing runtime entry', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.start, 'node server/index.js');
  await access(new URL('../server/index.js', import.meta.url));
});

test('server runtime dependencies and imported data paths exist', async () => {
  await Promise.all(requiredFiles.map(path => access(new URL(`../${path}`, import.meta.url))));
  const rows = JSON.parse(await readFile(new URL('../db/free-opportunities.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(rows));
});
