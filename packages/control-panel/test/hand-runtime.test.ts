import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Panel } from '../src/panel.ts';
import { handProfile } from '../../sdk/src/hand-profile.ts';
import { readHandsState, saveHandsState, saveHandAdjustments } from '../src/hands-state.ts';
import { handPolicyDocument } from '../src/hand-policy-document.ts';
import { stagePackagerInputs } from '../src/package-staging.ts';
import { portableHostConfig } from '../src/package-content.ts';
import type { ProviderList } from '../src/host-build.ts';

test('native/dev host config resolves every old input to the global source and retains provider settings', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hand-runtime-')));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace'), plugin = path.join(workspace, 'plugins', 'input-example');
  await fs.mkdir(core); await fs.mkdir(path.join(plugin, 'bin'), { recursive: true });
  await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: 'Real source', type: 'input', version: '1.0.0',
    handProviders: [{ version: 1, id: 'live', runtimeName: 'live', transport: 'native', purpose: 'tracked' }],
    settings: [{ key: 'gain', type: 'number', label: 'Gain', default: 0.5 }] }));
  const list: ProviderList = { providers: [{ name: 'live', role: 'input', builtin: false, path: path.join(plugin, 'bin/live.dll'), description: '', version: '1' }], error: null, rejected: [], pluginBins: [path.join(plugin, 'bin')] };
  const panel = new Panel(core, workspace, { send() {} } as ConstructorParameters<typeof Panel>[2]);
  panel.nativeProviders = async () => list;
  try {
    await saveHandAdjustments(core, workspace, { sizeFactor: .75, offsetMm: { z: 30 } }, (await readHandsState(core, workspace)).revision, { owner: 'workspace:input-example', id: 'live' });
    for (const [id, inputs] of [['old', ['mouse', 'historical']], ['multi', ['keyboard', 'first-old', 'second-old']]] as Array<[string, string[]]>) {
      const manifest = { name: id, kind: 'app' as const, inputs, plugins: { live: { gain: 0.8, nativeGrab: true }, unused: { gain: 99 } } };
      const args = await panel.hostArgs({ id, dir: root, manifest } as Parameters<Panel['hostArgs']>[0], manifest);
      const config = JSON.parse(await fs.readFile(args[0].slice('--config='.length), 'utf8'));
      assert.equal(config.input, 'live'); assert.equal(config.inputs.filter((n: string) => !['mouse', 'keyboard'].includes(n)).length, 1);
      assert.deepEqual(config.plugins.live, { gain: 0.8, nativeGrab: true });
      assert.equal(config.handProfile.sizeFactor, .75); assert.equal(config.handProfile.offsetMm.z, 30);
      const portable = portableHostConfig({ plugins: ['live'], selection: config, config });
      assert.deepEqual(Object.keys(portable.plugins), ['live']);
      assert.deepEqual(portable.handProfile, config.handProfile); assert.equal('handProfileRun' in portable, false);
      assert.ok(!JSON.stringify(portable).includes('historical'));
      assert.deepEqual(manifest.inputs, inputs, 'launch preparation never changes the app manifest');
    }
    const state = await readHandsState(core, workspace);
    assert.deepEqual(state.provider, { owner: 'workspace:input-example', id: 'live' });
    await assert.rejects(panel.browserHandPolicy({ name: 'Browser', kind: 'app', target: 'webxr', input: 'historical' }), /incompatible/);
    list.providers = [];
    await assert.rejects(panel.hostArgs({ id: 'missing', dir: root } as Parameters<Panel['hostArgs']>[0], { name: 'Missing', kind: 'app', inputs: ['hand'] }), /missing|rejected/);
    await saveHandsState(core, workspace, { owner: 'core', id: 'webxr' }, state.revision);
    assert.equal(await panel.browserHandPolicy({ name: 'Browser', kind: 'app', inputs: ['hand'] }), 'webxr');
    assert.equal(await panel.browserHandPolicy({ name: 'Off', kind: 'app', inputs: [] }), 'off');
    await assert.rejects(panel.hostArgs({ id: 'bad', dir: root } as Parameters<Panel['hostArgs']>[0], { name: 'Bad', kind: 'app', host: { args: ['--input=other'] } }), /Choose the hand provider in Hands/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('checked browser package snapshots carry a bounded policy without modifying source or requiring panel state', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hand-policy-package-'));
  try {
    const app = path.join(root, 'source'); await fs.mkdir(app);
    const html = '<!doctype html><html><head><script type="module" src="main.js"></script></head><body></body></html>';
    await fs.writeFile(path.join(app, 'index.html'), html); await fs.writeFile(path.join(app, 'main.js'), 'export const app=true;');
    const profile = handProfile({ sizeFactor: .7, appearance: { opacity: .456 } });
    const staged = await stagePackagerInputs({ handProfile: profile, app, runtimeDir: '', plugins: [], selection: { input: 'none', inputs: [], display: 'desktop', platform: '' }, handPolicy: 'webxr',
      projectName: 'Example', identity: {}, out: path.join(root, 'out'), workDir: path.join(root, 'work'), log() {} }, path.join(root, 'snapshot'));
    const document = await fs.readFile(path.join(staged.app, 'index.html'), 'utf8');
    assert.ok(document.indexOf('__XRB_HAND_POLICY__="webxr"') < document.indexOf('type="module"'));
    assert.equal(await fs.readFile(path.join(app, 'index.html'), 'utf8'), html);
    assert.equal(staged.handPolicy, 'webxr');
    assert.equal(document.includes('workspace'), false);
    assert.equal(handPolicyDocument(document, 'webxr', profile), document, 'restaging is idempotent');
    assert.ok(document.includes('__XRB_HAND_PROFILE_FROZEN__=true'));
    assert.ok(document.includes('"sizeFactor":0.7')); profile.sizeFactor = 1.3;
    assert.ok((await fs.readFile(path.join(staged.app, 'index.html'), 'utf8')).includes('"sizeFactor":0.7'));
    assert.ok(!/runId|revision|token|scope|config\/hands/.test(document));
    assert.ok(handPolicyDocument(document, 'off').includes('__XRB_HAND_POLICY__="off"'));
    assert.throws(() => handPolicyDocument(html, 'unbounded' as never), /Invalid/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
