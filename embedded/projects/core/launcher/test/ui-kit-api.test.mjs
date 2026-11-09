import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const core = process.env.XRB_CORE;

const publicImports = (source) => {
  const match = source.match(/import\s*\{([^}]*)\}\s*from\s*['"]@xr-build\/ui-kit['"]/s);
  return match ? match[1].split(',').map((name) => name.trim()).filter(Boolean) : [];
};

test('launcher consumes UI Kit components only through the public API', async () => {
  assert.ok(core, 'XRB_CORE is required for the UI Kit API contract test');
  const [api, main] = await Promise.all([
    readFile(path.join(core, 'packages/ui-kit/src/index.ts'), 'utf8'),
    readFile(path.join(root, 'src/main.js'), 'utf8'),
  ]);
  const used = new Set(publicImports(main));
  assert.deepEqual([...used].sort(), ['Button', 'COLORS', 'Dialog', 'Label', 'material', 'roundedBox', 'roundedDisc'].sort());
  for (const name of used) assert.match(api, new RegExp(`\\b${name}\\b`), `${name} must be exported by @xr-build/ui-kit`);
  assert.doesNotMatch(main, /@xr-build\/ui-kit\//);
});
