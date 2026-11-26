import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { readProject } from '../src/projects.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { listProviders } from '../src/host-build.ts';
import { discoverHandProviders } from '../src/hand-providers.ts';
import { providerRunSchemas } from '../src/project-provider-settings.ts';
import { appLaunchUrl, appResumeUrl } from '../../sdk/src/launch-context.ts';

async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hand-context-')));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace');
  const write = async (file: string, value: unknown) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  await fs.mkdir(core); await fs.mkdir(workspace);
  const port = await freePort(), app = createServer({ repo: core, workspace, port });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  return { root, core, workspace, app, base: `http://127.0.0.1:${port}`, write,
    choose: async (owner: string, id: string) => saveHandsState(core, workspace, { owner, id }, (await readHandsState(core, workspace)).revision),
    close: async () => { Reflect.deleteProperty(app.panel.runner, 'busy'); Reflect.deleteProperty(app.panel.runner, 'projectId'); app.panel.runner.emit('state', { phase: 'idle' }); await app.close(); await fs.rm(root, { recursive: true, force: true }); },
  };
}
const simulated = { name: 'simulated', role: 'input' as const, builtin: true, path: null, version: '1', description: 'fake metadata only' };

test('native Launcher destinations and returns reuse native hands, not browser resolution or a newly selected provider', async () => {
  const f = await fixture();
  try {
    await f.write(path.join(f.core, 'native/host/build/Release/xrb-host.exe'), 'fake; start is intercepted');
    const project = async (id: string, inputs: string[]) => {
      const dir = path.join(f.workspace, 'projects/unsorted', id);
      await f.write(path.join(dir, 'xrb-project.json'), { name: id, kind: 'app', entry: 'dist', inputs });
      await f.write(path.join(dir, 'dist/index.html'), '<html><head></head><body>native destination</body></html>');
      return (await readProject(dir, id, 'unsorted'))!;
    };
    const launcher = await project('launcher', ['hand']); await project('demo', ['hand']); await project('second', ['hand']); await project('off', []);
    f.app.panel.nativeProviders = async () => ({ providers: [simulated], rejected: [], error: null });
    await f.choose('core', 'simulated');
    const root = `https://app.local/index.html?xrb-panel=${encodeURIComponent(f.base + '/')}&xrb-hand=native`;
    const document = async (url: string) => { const r = await fetch(url); assert.equal(r.status, 200, await r.clone().text()); return r.text(); };
    const link = (id: string, parent: string) => appLaunchUrl(`${f.base}/preview/${id}/`, { returnUrl: parent });
    // The review's metadata-only HTTP reproduction works without starting a host/device.
    assert.match(await document(link('demo', root)), /__XRB_HAND_POLICY__="native"/);
    assert.equal((await fetch(`${f.base}/preview/demo/?xrb-hand=native`)).status, 409, 'a bare hint cannot claim a native Launcher context');
    const foreign = `https://app.local/?xrb-panel=${encodeURIComponent('http://127.0.0.1:1/')}&xrb-hand=native`;
    assert.equal((await fetch(link('demo', foreign))).status, 409, 'native return context must belong to this panel');

    let nativeRoot = '';
    const runner = f.app.panel.runner;
    runner.start = async request => {
      nativeRoot = request.builtUrl!;
      Object.defineProperty(runner, 'busy', { configurable: true, value: true });
      Object.defineProperty(runner, 'projectId', { configurable: true, value: request.projectId });
    };
    await f.app.panel.run(launcher, 'built');
    await f.choose('core', 'webxr'); // Next-run preference must not retarget the already-running host.
    const first = link('demo', nativeRoot), second = link('second', first);
    for (const url of [first, second, appResumeUrl(first, 'perspective')]) assert.match(await document(url), /__XRB_HAND_POLICY__="native"/);
    assert.match(await document(link('off', nativeRoot)), /__XRB_HAND_POLICY__="off"/, 'destination Hand-off still gates native frames');
    const devRoot = `http://localhost:5173/?xrb-panel=${encodeURIComponent(f.base + '/')}&xrb-hand=native`;
    assert.match(await document(link('demo', devRoot)), /__XRB_HAND_POLICY__="native"/, 'active native dev runs share the same hand-off context');

    Reflect.deleteProperty(runner, 'busy'); Reflect.deleteProperty(runner, 'projectId'); runner.emit('state', { phase: 'idle' });
    const offLauncher = await project('launcher', []);
    await f.app.panel.run(offLauncher, 'built');
    const unavailable = await fetch(link('demo', nativeRoot));
    assert.equal(unavailable.status, 409); assert.match(await unavailable.text(), /started without Hand/);
  } finally { await f.close(); }
});

test('disabled duplicate runtime names affect presentation only, never usable discovery, dropdowns, schemas or launch', async () => {
  const f = await fixture();
  try {
    await f.write(path.join(f.core, 'native/host/build/Release/xrb-host.exe'), 'fake; queries are intercepted');
    for (const id of ['a', 'b']) {
      await f.write(path.join(f.workspace, 'plugins', id, 'xrb-plugin.json'), { title: id, type: 'input', version: '1.0.0',
        settings: [{ key: 'gain', type: 'number', label: 'Gain', default: 1 }],
        handProviders: [{ version: 1, id: 'live', runtimeName: 'live', transport: 'native', purpose: 'tracked' }] });
      await f.write(path.join(f.workspace, 'plugins', id, 'bin/xrb_live.dll'), 'fake; never loaded');
    }
    await f.write(path.join(f.workspace, 'xrb-plugins.json'), { disabled: ['b'], settings: {}, panelSettings: {} });
    // Real listProviders validates/merges metadata-only independent probes. No DLL or host is executed.
    const probe: typeof listProviders = (core, workspace, includeDisabled = false) => listProviders(core, workspace, includeDisabled, async (_exe, bins) => ({
      providers: bins.length ? [{ ...simulated, name: 'live', builtin: false, path: path.join(bins[0], 'xrb_live.dll') }] : [simulated], rejected: [], error: null,
    }));
    f.app.panel.nativeProviders = probe;
    assert.ok((await probe(f.core, f.workspace, false)).providers.some(p => p.name === 'live'));
    assert.ok(!(await probe(f.core, f.workspace, true)).providers.some(p => p.name === 'live'), 'the all-plugin presentation probe really does contain a duplicate');
    const registry = await discoverHandProviders(f.core, f.workspace, probe);
    assert.equal(registry.providers.find(p => p.owner === 'workspace:a')?.available, true);
    assert.equal(registry.providers.find(p => p.owner === 'workspace:b')?.available, false);
    assert.match(registry.providers.find(p => p.owner === 'workspace:b')!.reason, /disabled/);
    const menu = await fetch(f.base + '/api/plugins').then(r => r.json());
    assert.equal(menu.handProviders.find((p: { owner: string }) => p.owner === 'workspace:a').available, true);
    const managed = await f.app.panel.managedPlugins();
    assert.equal(managed.find(p => p?.key === 'workspace:a')?.problem, null, 'enabled manager row must not inherit disabled-binary conflicts');
    assert.deepEqual(registry.problems, [], 'disabled-only collisions do not become active discovery errors');
    const manifest = { name: 'Demo', kind: 'app' as const, inputs: ['hand'] };
    await f.choose('workspace:b', 'live');
    await assert.rejects(f.app.panel.hostArgs({ id: 'demo', dir: f.root } as Parameters<typeof f.app.panel.hostArgs>[0], manifest), /disabled/);
    await f.choose('workspace:a', 'live');
    const args = await f.app.panel.hostArgs({ id: 'demo', dir: f.root } as Parameters<typeof f.app.panel.hostArgs>[0], manifest);
    const config = JSON.parse(await fs.readFile(args[0].slice('--config='.length), 'utf8'));
    assert.equal(config.input, 'live'); assert.deepEqual(config.plugins.live, { gain: 1 });
    const schemas = await providerRunSchemas(f.core, f.workspace, { id: 'demo', dir: f.root, manifest } as Parameters<typeof providerRunSchemas>[2], { inputs: ['hand'] }, { probe: (c, w) => probe(c, w, false) });
    assert.deepEqual(schemas.map(s => s.owner), ['workspace:a']);
    assert.deepEqual(await f.app.panel.pluginDirs(), { live: path.join(f.workspace, 'plugins/a/bin') });

    await f.write(path.join(f.workspace, 'xrb-plugins.json'), { disabled: [], settings: {}, panelSettings: {} });
    const conflicted = await discoverHandProviders(f.core, f.workspace, probe);
    assert.equal(conflicted.providers.find(p => p.owner === 'workspace:a')?.available, false);
    assert.equal(conflicted.providers.find(p => p.owner === 'workspace:b')?.available, false);
    await assert.rejects(f.app.panel.hostArgs({ id: 'demo', dir: f.root } as Parameters<typeof f.app.panel.hostArgs>[0], manifest), /missing|rejected|unsafe/);
    assert.deepEqual((await readHandsState(f.core, f.workspace)).provider, { owner: 'workspace:a', id: 'live' }, 'an enabled conflict is not silently replaced by synthetic input');
  } finally { await f.close(); }
});
