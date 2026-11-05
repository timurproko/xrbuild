import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { panelFreshness, panelSourceRoots } from '../src/panel-freshness.ts';

async function write(root: string, rel: string, mtimeMs: number) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, 'x');
  // Windows file times move in ~16 ms ticks: date every file explicitly.
  await fs.utimes(file, mtimeMs / 1000, mtimeMs / 1000);
}

test('panel code changed after the start makes the panel outdated, naming the newest file', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-freshness-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'core'), workspace = path.join(root, 'ws');
  const publisher = path.join(workspace, 'plugins', 'publisher-web');
  const started = Date.now() - 60_000;
  await write(repo, 'packages/control-panel/src/server.ts', started - 10_000);
  await write(repo, 'packages/app-icon/src/icon.ts', started - 10_000);
  await write(publisher, 'publisher.mjs', started - 10_000);
  const roots = panelSourceRoots(repo, workspace, [publisher]);
  assert.deepEqual(panelFreshness(roots, started, 7), { pid: 7, startedMs: started, outdated: false, newestSource: null });

  // UI files, installed packages, build output and tests do not need a restart.
  await write(repo, 'packages/control-panel/ui/app.js', started + 1_000);
  await write(publisher, 'node_modules/dep/index.js', started + 1_000);
  await write(publisher, 'bin/plugin.dll', started + 1_000);
  await write(publisher, 'test/publisher.test.mjs', started + 1_000);
  // State a plugin keeps next to its code is not code.
  await write(publisher, 'state.json', started + 1_000);
  await write(publisher, 'README.md', started + 1_000);
  assert.equal(panelFreshness(roots, started).outdated, false);

  await write(repo, 'packages/app-icon/src/icon.ts', started + 1_000);
  await write(publisher, 'config/production.json', started + 2_000);
  assert.deepEqual(panelFreshness(roots, started, 7),
    { pid: 7, startedMs: started, outdated: true, newestSource: path.join('plugins', 'publisher-web', 'config', 'production.json') });
});
