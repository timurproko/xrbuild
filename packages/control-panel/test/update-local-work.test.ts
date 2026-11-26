import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { runUpdate, fastForward, UpdateFailure, type GitRunner } from '../src/update.ts';
import { fixture, git } from './helpers/update-fixture.ts';

test('Update recovery reports its actual starting revision and retained defaults', async t => {
  const f = await fixture(t), dir = f.workspace.checkout;
  await f.workspace.publish('xrb-plugins.json', 'base settings\n');
  git(dir, 'fetch', '-q', 'origin'); git(dir, 'merge', '-q', '--ff-only', 'origin/main');
  const before = f.workspace.head();
  await fs.writeFile(path.join(dir, 'xrb-plugins.json'), 'personal settings\n');
  await f.workspace.publish('xrb-plugins.json', 'incoming settings\n'); const target = await f.workspace.publish();
  const interrupted: GitRunner = (args, cwd, opts) => args[0] === 'update-ref' && cwd === dir
    ? Promise.resolve({ code: 1, output: 'simulated interrupted publication' }) : f.runner(args, cwd, opts);
  const deps = { core: f.core.checkout, rebuild: async () => [] };
  await assert.rejects(runUpdate(dir, f.ctx, { ...deps, git: interrupted }), UpdateFailure);
  const result = await runUpdate(dir, f.ctx, { ...deps, git: f.runner });
  const workspace = result.repositories.find(repo => repo.role === 'workspace')!;
  assert.equal(workspace.from, before); assert.equal(workspace.to, target);
  assert.deepEqual(workspace.retained, ['xrb-plugins.json']);
  assert.match(result.summary, /upstream defaults skipped/);
  assert.equal(await fs.readFile(path.join(dir, 'xrb-plugins.json'), 'utf8'), 'personal settings\n');
});

test('a shared core/workspace checkout still treats the public core lock as source', async t => {
  const f = await fixture(t), dir = f.core.checkout;
  await f.core.publish('pnpm-lock.yaml', 'curated original\n');
  git(dir, 'fetch', '-q', 'origin'); git(dir, 'merge', '-q', '--ff-only', 'origin/main');
  const before = f.core.head();
  await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), 'local core source edit\n');
  await f.core.publish('pnpm-lock.yaml', 'curated incoming\n');
  await assert.rejects(fastForward(dir, f.ctx, { git: f.runner, role: 'core', lfs: 'optional', marker: 'fixture-pending', workspaceData: true }), /pnpm-lock.yaml/);
  assert.equal(f.core.head(), before);
});

for (const incoming of ['current', 'unrelated-source', 'settings-and-lock']) test(`ordinary panel-written state succeeds: ${incoming}`, async t => {
  const f = await fixture(t), dir = f.workspace.checkout;
  await f.workspace.publish('pnpm-lock.yaml', 'original lock\n');
  await f.workspace.publish('xrb-plugins.json', '{"settings":{}}\n');
  git(dir, 'fetch', '-q', 'origin'); git(dir, 'merge', '-q', '--ff-only', 'origin/main');
  await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), 'panel-generated lock\n');
  await fs.writeFile(path.join(dir, 'xrb-plugins.json'), '{"settings":{"tracker":{"enabled":true}}}\n');
  await fs.mkdir(path.join(dir, 'projects/Unsorted/demo'), { recursive: true });
  await fs.writeFile(path.join(dir, 'projects/.gitkeep'), '');
  await fs.writeFile(path.join(dir, 'projects/Unsorted/demo/xrb-project.json'), '{"name":"demo"}\n');
  if (incoming === 'settings-and-lock') {
    await f.workspace.publish('pnpm-lock.yaml', 'incoming lock\n');
    await f.workspace.publish('xrb-plugins.json', '{"settings":{"tracker":{"enabled":false}}}\n');
  } else if (incoming === 'unrelated-source') await f.workspace.publish('shared.txt', 'remote source\n');
  let builds = 0;
  const result = await runUpdate(dir, f.ctx, { git: f.runner, core: f.core.checkout, rebuild: async () => { builds++; return []; } });
  assert.equal(result.state, incoming === 'current' ? 'up-to-date' : 'updated');
  assert.equal(builds, incoming === 'current' ? 0 : 1);
  assert.equal(await fs.readFile(path.join(dir, 'pnpm-lock.yaml'), 'utf8'), 'panel-generated lock\n');
  assert.match(await fs.readFile(path.join(dir, 'xrb-plugins.json'), 'utf8'), /true/);
  assert.equal(await fs.readFile(path.join(dir, 'projects/Unsorted/demo/xrb-project.json'), 'utf8'), '{"name":"demo"}\n');
  assert.equal(f.workspace.head(), git(f.workspace.publisher, 'rev-parse', 'HEAD'));
  if (incoming === 'settings-and-lock') assert.match(f.lines.join('\n'), /upstream defaults were not applied.*git show/);
});
