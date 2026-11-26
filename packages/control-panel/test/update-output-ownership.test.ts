import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { runUpdate, UpdateFailure } from '../src/update.ts';
import type { BuildScope } from '../src/update-followup.ts';
import { fixture, git } from './helpers/update-fixture.ts';

for (const partial of [false, true]) test(`native completion belongs to the selected workspace, not shared core Git metadata (partial=${partial})`, async t => {
  const f = await fixture(t), workspaceB = path.join(f.root, 'workspace-b');
  git(f.root, 'clone', '-q', f.workspace.remote, workspaceB); git(workspaceB, 'config', 'core.autocrlf', 'false');
  await f.core.publish('other.txt', 'new core\n'); await f.workspace.publish('shared.txt', 'incoming workspace\n');
  if (partial) await fs.writeFile(path.join(f.workspace.checkout, 'shared.txt'), 'local source\n');
  const calls: Array<{ workspace: string; scope: BuildScope | undefined; pluginsOnly: boolean }> = [];
  const deps = (workspace: string) => {
    const host = path.join(workspace, 'build/native/fixture-host'), plugin = path.join(workspace, 'build/native/fixture-plugin');
    const exists = (file: string) => fs.stat(file).then(() => true, () => false);
    return { git: f.runner, core: f.core.checkout,
      coreHostCurrent: () => exists(host),
      outputsReady: async (scope: BuildScope) => await exists(host) && (scope === 'core' || await exists(plugin)),
      rebuild: async (pluginsOnly: boolean, _ctx: unknown, scope?: BuildScope) => {
        calls.push({ workspace, scope, pluginsOnly });
        if (pluginsOnly && !await exists(host)) throw new Error('No host output in the selected workspace');
        await fs.mkdir(path.dirname(host), { recursive: true });
        if (!pluginsOnly) await fs.writeFile(host, 'verified host fixture');
        if (scope !== 'core') await fs.writeFile(plugin, 'verified plugin fixture');
        return [];
      } };
  };
  if (partial) await assert.rejects(runUpdate(f.workspace.checkout, f.ctx, deps(f.workspace.checkout)), UpdateFailure);
  else await runUpdate(f.workspace.checkout, f.ctx, deps(f.workspace.checkout));
  assert.equal(calls[0]!.scope, partial ? 'core' : 'all');
  // Legacy Update commit receipts are deliberately not output proof, even if their hashes match B exactly.
  await fs.writeFile(path.join(f.core.checkout, '.git', `xrb-update-step-${partial ? 'core-build' : 'workspace-build'}`),
    partial ? f.core.head() : `${f.core.head()}:${git(f.workspace.publisher, 'rev-parse', 'HEAD')}`);
  const result = await runUpdate(workspaceB, f.ctx, deps(workspaceB));
  assert.equal(result.state, 'updated');
  assert.deepEqual(calls.filter(call => call.workspace === workspaceB), [{ workspace: workspaceB, scope: 'all', pluginsOnly: false }]);
  assert.equal(result.steps.find(step => step.id === 'workspace-build')!.state, 'completed');
  await runUpdate(workspaceB, f.ctx, deps(workspaceB));
  assert.equal(calls.filter(call => call.workspace === workspaceB).length, 1, 'no missing-host retry loop');
});
