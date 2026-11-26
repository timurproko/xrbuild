import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import type { UpdateResult } from '../src/update.ts';
import { fixture, git } from './helpers/update-fixture.ts';

function gate() {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  return { wait, release };
}

async function serverFixture(t: TestContext) {
  const f = await fixture(t), builds: boolean[] = [];
  const server = createServer({ repo: f.core.checkout, workspace: f.workspace.checkout, port: await freePort() });
  server.panel.desktopSetup = { isBusy: async () => false } as never;
  server.panel.updateDeps = { core: f.core.checkout, git: f.runner, rebuild: async pluginsOnly => { builds.push(pluginsOnly); return []; } };
  await new Promise<void>(resolve => server.server.listen(server.port, '127.0.0.1', resolve));
  t.after(() => server.close());
  const request = async (method: string, route = '/api/update') => {
    const response = await fetch(new URL(route, server.url), { method, headers: { origin: new URL(server.url).origin, 'content-type': 'application/json' } });
    return { status: response.status, data: await response.json() as any };
  };
  const finish = async (id: number) => server.panel.jobs.wait(server.panel.jobs.get(id)!);
  const project = { id: 'demo', dir: path.join(f.workspace.checkout, 'projects/demo'), manifest: { name: 'Demo' } } as never;
  return { ...f, server, request, finish, builds, project };
}

test('regression: stale or unavailable plugin services cannot veto independent Git recovery', async t => {
  for (const state of ['dirty plugin code', 'unavailable runtime']) await t.test(state, async t => {
    const f = await serverFixture(t), plugin = path.join(f.workspace.publisher, 'plugins/demo');
    await fs.mkdir(plugin, { recursive: true });
    await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: 'Demo', type: 'input', version: '1.0.0' }));
    await fs.writeFile(path.join(plugin, 'demo.js'), 'export const version=1;\n');
    await f.workspace.publish('other.txt', 'plugin added\n');
    git(f.workspace.checkout, 'fetch', 'origin'); git(f.workspace.checkout, 'merge', '--ff-only', 'origin/main');
    await f.server.panel.synchronizePluginServices(true);
    assert.equal(f.server.panel.pluginServiceStatus().pending, false);
    const target = await f.core.publish(), workspaceBefore = f.workspace.head();
    const edited = path.join(f.workspace.checkout, 'plugins/demo/demo.js');
    await fs.writeFile(edited, 'export const version=2;\n');
    if (state === 'unavailable runtime') f.server.panel.onPluginSourcesChanged = async () => { throw new Error('Plugin runtime unavailable'); };
    await f.server.panel.synchronizePluginServices(true);
    assert.equal(f.server.panel.pluginServiceStatus().pending, true);
    // Neither status nor Update admission should depend on another successful service-discovery pass.
    f.server.panel.synchronizePluginServices = async () => { assert.fail('Update must not require plugin discovery'); };
    const started = await f.request('POST'); assert.equal(started.status, 202);
    const job = await f.finish(started.data.id), result = job.result as UpdateResult;
    assert.equal(job.state, 'failed'); assert.equal(f.core.head(), target); assert.equal(f.workspace.head(), workspaceBefore);
    assert.equal(result.repositories.find(repo => repo.role === 'core')!.state, 'updated');
    assert.match(result.repositories.find(repo => repo.role === 'workspace')!.error!, /Uncommitted/);
    assert.equal(await fs.readFile(edited, 'utf8'), 'export const version=2;\n'); assert.equal(f.builds.length, 0);
    assert.match(job.lines.at(-1)!, /Restart required/);
    // After preserving/reconciling the local edit, pending native work can finish despite stale loaded services.
    await fs.writeFile(edited, 'export const version=1;\n');
    const retry = await f.request('POST'); assert.equal(retry.status, 202);
    assert.equal((await f.finish(retry.data.id)).state, 'done'); assert.equal(f.builds.length, 1);
  });
});

test('regression: reserving Update before status yields excludes real launches and a second Update', async t => {
  const f = await serverFixture(t), entered = gate(), scan = gate(); t.after(scan.release);
  await f.core.publish();
  let blocked = false;
  f.server.panel.updateDeps.git = async (args, cwd, opts) => {
    if (!blocked && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
      blocked = true; entered.release(); await scan.wait;
    }
    return f.runner(args, cwd, opts);
  };
  // A GET that began first must drain, but Update must already own maintenance admission while it waits.
  const status = f.request('GET'); await entered.wait;
  const started = await f.request('POST'); assert.equal(started.status, 202);
  assert.equal(f.server.panel.jobs.active()[0]!.kind, 'update');
  const before = f.calls.length;
  assert.equal((await f.request('GET')).data.updating, true); assert.equal(f.calls.length, before);
  assert.equal((await f.request('POST')).status, 409); assert.equal(f.calls.length, before);
  assert.equal((await f.request('POST', '/api/host/rebuild')).status, 409);
  f.server.panel.synchronizePluginServices = async () => {};
  await assert.rejects(f.server.panel.run(f.project, 'built'), /wait for the update to finish/);
  await assert.rejects(f.server.panel.preview(f.project, 'built', false, 'token', { clientPort: f.server.port }), /wait for the update to finish/);
  await assert.rejects(f.server.panel.saveRunSettings(f.project, {}, null), /wait for the update to finish/);
  await assert.rejects(f.server.panel.packageSetupStatus(f.project), /wait for the update to finish/);
  scan.release(); await status;
  assert.equal((await f.finish(started.data.id)).state, 'done');
});

for (const kind of ['native', 'preview']) test(`launch winning the final desktop-status await excludes Update (${kind})`, async t => {
  const f = await serverFixture(t), checked = gate(), check = gate(), launchEntered = gate(), launch = gate();
  t.after(() => { check.release(); launch.release(); });
  await f.core.publish(); const before = f.core.head();
  f.server.panel.synchronizePluginServices = async () => {};
  let first = true;
  f.server.panel.desktopSetup = { isBusy: async () => {
    if (first) { first = false; checked.release(); await check.wait; } return false;
  } } as never;
  const panel = f.server.panel as unknown as { runNative: () => Promise<void>; preparePreview: () => Promise<string> };
  panel.runNative = async () => { launchEntered.release(); await launch.wait; };
  panel.preparePreview = async () => { launchEntered.release(); await launch.wait; return 'http://127.0.0.1/'; };
  const update = f.request('POST'); await checked.wait;
  const starting = kind === 'native' ? f.server.panel.run(f.project, 'built')
    : f.server.panel.preview(f.project, 'built', false, 'token', { clientPort: f.server.port });
  await launchEntered.wait; check.release();
  const response = await update;
  assert.equal(response.status, 409); assert.match(response.data.error, /starting/);
  assert.equal(f.server.panel.jobs.list().length, 0); assert.equal(f.core.head(), before);
  assert.equal(f.calls.length, 0, 'refusal occurs before Git'); launch.release(); await starting;
});

test('Update keeps active mutation, restart and setup guards despite the services-only recovery exception', async t => {
  const f = await serverFixture(t), panel = f.server.panel as unknown as Record<string, unknown>;
  for (const [field, value] of [['restartPending', true], ['changingPlugins', true], ['maintainingCache', true],
    ['pluginConsumers', 1], ['savingHands', true], ['settingsWrites', new Set(['demo'])]] as const) {
    const original = panel[field]; panel[field] = value;
    try { assert.equal((await f.request('POST')).status, field === 'restartPending' ? 503 : 409, field); }
    finally { panel[field] = original; }
  }
  f.server.panel.desktopSetup = { isBusy: async () => true } as never;
  assert.equal((await f.request('POST')).status, 409);
  assert.equal(f.calls.length, 0); assert.equal(f.server.panel.jobs.list().length, 0);
});
