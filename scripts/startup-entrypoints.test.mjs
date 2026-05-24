import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('stable launch uses the supervisor by default', () => {
  assert.equal(packageJson.scripts.start, 'node scripts/start-server.mjs');
  assert.equal(packageJson.scripts['start:raw'], 'node server/index.js');
  assert.equal(packageJson.scripts['dev:server'], 'node server/index.js');
});
