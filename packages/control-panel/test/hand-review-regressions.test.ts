import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { Panel } from '../src/panel.ts';
import { freePort } from '../src/host-runner.ts';
import { discoverProjectCatalog } from '../src/extension-catalog.ts';
import { readProjectRunSettings, saveProjectRunSettings } from '../src/project-run-settings.ts';
import { readHandsState, saveHandsState, saveHandAdjustments, validHandProviderKey } from '../src/hands-state.ts';
import { readProject } from '../src/projects.ts';
import { writeBuildReceipt } from '../src/publication.ts';
import { portableHostConfig } from '../src/package-content.ts';

async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hand-review-')));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace');
  await fs.mkdir(core); await fs.mkdir(workspace);
  const write = async (file: string, value: unknown) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  const choose = async (provider: { owner: string; id: string }) => saveHandsState(core, workspace, provider, (await readHandsState(core, workspace)).revision);
  return { root, core, workspace, write, choose, close: () => fs.rm(root, { recursive: true, force: true }) };
}

test('preview stamps effective bundled inputs in both directions and retains the authenticated launch snapshot', async () => {
  const f = await fixture(), dir = path.join(f.core, 'embedded/projects/core/demo');
  let server: ReturnType<typeof createServer> | undefined;
  try {
    const original = { name: 'Demo', kind: 'app', target: 'webxr', entry: 'dist', inputs: ['mouse'] };
    await f.write(path.join(dir, 'xrb-project.json'), original);
    await f.write(path.join(dir, 'dist/index.html'), '<html><head></head><body>demo</body></html>');
    const p = (await discoverProjectCatalog(f.core, f.workspace)).projects[0].project;
    const setInputs = async (inputs: string[]) => saveProjectRunSettings(f.core, f.workspace, p, { inputs }, (await readProjectRunSettings(f.core, f.workspace, p)).revision);
    await setInputs(['hand']); await f.choose({ owner: 'core', id: 'webxr' });
    const port = await freePort(); server = createServer({ repo: f.core, workspace: f.workspace, port });
    server.server.listen(port, '127.0.0.1'); await once(server.server, 'listening');
    const base = `http://127.0.0.1:${port}`;
    const document = async (url: string) => { const r = await fetch(url); assert.equal(r.status, 200, await r.clone().text()); return r.text(); };
    assert.match(await document(base + '/preview/bundled%3Ademo/?xrb-hand=webxr'), /__XRB_HAND_POLICY__="webxr"/);
    await setInputs(['mouse']);
    assert.match(await document(base + '/preview/bundled%3Ademo/?xrb-hand=webxr'), /__XRB_HAND_POLICY__="off"/, 'query policy cannot enable input disabled by effective personal settings');

    server.panel.launchBrowser = async () => ({} as never);
    server.panel.runner.startPreview = async (_request, _mode, launch) => { await launch(null); };
    const launch = async () => {
      const r = await fetch(base + '/api/projects/bundled%3Ademo/preview', { method: 'POST', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'built' }) });
      assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).url as string;
    };
    await setInputs(['hand']); const handRun = await launch();
    await setInputs(['mouse']); await f.choose({ owner: 'core', id: 'simulated' });
    assert.match(await document(handRun), /__XRB_HAND_POLICY__="webxr"/, 'later settings/source changes do not rewrite this launch decision');
    const foreign = new URL(handRun); foreign.searchParams.set('xrb-preview-token', 'wrong-token');
    assert.match(await document(foreign.href), /__XRB_HAND_POLICY__="off"/, 'a foreign token cannot borrow the launch snapshot');
    const offRun = await launch();
    await setInputs(['hand']); await f.choose({ owner: 'core', id: 'webxr' });
    assert.match(await document(offRun), /__XRB_HAND_POLICY__="off"/, 'the off snapshot cannot be enabled by later settings either');
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'xrb-project.json'), 'utf8')), original);
  } finally { await server?.close(); await f.close(); }
});

test('publication always resolves browser context even when the selected package target is desktop', async () => {
  const f = await fixture();
  try {
    const dir = path.join(f.workspace, 'projects/unsorted/demo'), plugin = path.join(f.workspace, 'plugins/input-example');
    await f.write(path.join(plugin, 'xrb-plugin.json'), { title: 'Native source', type: 'input', version: '1.0.0', handProviders: [{ version: 1, id: 'live', transport: 'native', runtimeName: 'live', purpose: 'tracked' }] });
    await f.write(path.join(plugin, 'bin/example.dll'), 'fake; never loaded');
    await f.write(path.join(dir, 'xrb-project.json'), { name: 'Demo', kind: 'app', entry: 'dist', inputs: ['hand'], publication: { enabled: true, publisher: 'fixture', id: '11111111-1111-4111-8111-111111111111', slug: 'demo' } });
    const html = '<html><head></head><body>publication</body></html>';
    await f.write(path.join(dir, 'dist/index.html'), html);
    const p = (await readProject(dir, 'demo', 'unsorted'))!;
    await writeBuildReceipt(f.workspace, p.id, p.manifestMtimeMs, path.join(dir, 'dist'));
    const panel = new Panel(f.core, f.workspace, { send() {} } as ConstructorParameters<typeof Panel>[2]);
    panel.nativeProviders = async () => ({ providers: [{ name: 'live', role: 'input', builtin: false, path: path.join(plugin, 'bin/example.dll'), description: '', version: '1' }], rejected: [], error: null });
    let published = '';
    panel.publishers = { found: [{ dir: plugin, publisher: { name: 'fixture', origin: 'https://example.test', validate: () => [],
      async publish(input) { published = await fs.readFile(path.join(input.app, 'index.html'), 'utf8'); return {}; }, async unpublish() { return {}; } } }], problems: [] };
    await f.choose({ owner: 'workspace:input-example', id: 'live' });
    await assert.rejects(panel.publish(p), /incompatible with browser preview\/publication/);
    assert.equal(published, ''); assert.equal(panel.jobs.list().length, 0);
    await f.choose({ owner: 'core', id: 'webxr' });
    await saveHandAdjustments(f.core, f.workspace, { sizeFactor: 1.1 }, (await readHandsState(f.core, f.workspace)).revision);
    const job = await panel.publish(p), done = await panel.jobs.wait(job);
    assert.equal(done.state, 'done', done.error ?? '');
    assert.match(published, /__XRB_HAND_POLICY__="webxr"/);
    assert.doesNotMatch(published, /__XRB_HAND_POLICY__="native"/);
    assert.equal(p.manifest!.target, undefined, 'publishing did not rewrite the desktop package selection');
    assert.match(published, /"sizeFactor":1.1/); assert.match(published, /__XRB_HAND_PROFILE_FROZEN__=true/);
    const sourceBeforeVersioned = await fs.readFile(path.join(dir, 'dist/index.html'), 'utf8');
    assert.doesNotMatch(sourceBeforeVersioned, /__XRB_HAND_PROFILE__/);
    (panel.publishers.found[0].publisher as any).releases = { catalog: async () => ({ revision: 'fixture', releases: [] }),
      publish: async input => { published = await fs.readFile(path.join(input.app, 'index.html'), 'utf8'); return { releaseId: 'release-1', version: '1.0.0' }; } };
    const versioned = await panel.publish(p, { version: '1.0.0', expectedRevision: 'fixture' });
    assert.equal((await panel.jobs.wait(versioned)).state, 'done'); assert.match(published, /"sizeFactor":1.1/);
    assert.equal(await fs.readFile(path.join(dir, 'dist/index.html'), 'utf8'), sourceBeforeVersioned);
  } finally { await f.close(); }
});

test('implicit native identities preserve underscores, capitals, dots and long names through picker, profile and launch', async () => {
  const f = await fixture(); let server: ReturnType<typeof createServer> | undefined;
  try {
    const plugin = path.join(f.workspace, 'plugins/input-example');
    await f.write(path.join(plugin, 'xrb-plugin.json'), { title: 'Existing native source', type: 'input', version: '1.0.0' });
    await f.write(path.join(plugin, 'bin/example.dll'), 'fake; never loaded');
    const port = await freePort(); server = createServer({ repo: f.core, workspace: f.workspace, port });
    let name = 'hand_sensor';
    server.panel.nativeProviders = async () => ({ providers: [{ name, role: 'input', builtin: false, path: path.join(plugin, 'bin/example.dll'), description: '', version: '1' }], rejected: [], error: null });
    server.server.listen(port, '127.0.0.1'); await once(server.server, 'listening');
    const base = `http://127.0.0.1:${port}`;
    const launch = async () => {
      const args = await server!.panel.hostArgs({ id: 'demo', dir: f.root } as Parameters<Panel['hostArgs']>[0], { name: 'Demo', kind: 'app', inputs: ['hand'] });
      return JSON.parse(await fs.readFile(args[0].slice('--config='.length), 'utf8'));
    };
    assert.equal((await launch()).input, name, 'unique-real initial default is also persistable');
    for (name of ['hand_sensor', 'Hand.Sensor_V2', `Sensor_${'x'.repeat(100)}`]) {
      const state = await fetch(base + '/api/hands').then(r => r.json());
      const provider = { owner: 'workspace:input-example', id: name };
      assert.equal(validHandProviderKey(provider), true);
      assert.equal(state.providers.find((p: { id: string }) => p.id === name).available, true);
      const saved = await fetch(base + '/api/hands', { method: 'PUT', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ provider, revision: state.revision, registryRevision: state.registryRevision }) });
      assert.equal(saved.status, 200, await saved.text());
      assert.deepEqual((await readHandsState(f.core, f.workspace)).provider, provider);
      const config = await launch(); assert.equal(config.input, name);
      assert.deepEqual(portableHostConfig({ plugins: [name], selection: config, config }).inputs, [name]);
    }
    for (const id of ['../escape', 'with/slash', 'bad\\path', 'x'.repeat(129)]) assert.equal(validHandProviderKey({ owner: 'workspace:input-example', id }), false);
  } finally { await server?.close(); await f.close(); }
});
