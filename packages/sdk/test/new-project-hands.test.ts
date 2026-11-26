import assert from 'node:assert/strict';
import { decodeMessage, type HandsMessage } from '../src/protocol.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as THREE from 'three';
import { createXrbApp, PinchTarget } from '../src/index.ts';
import { FakeSocket, handsMessage, openHand } from './fixtures.ts';
import { createProject } from '../../control-panel/src/workspace.ts';
import { readProject, saveManifest } from '../../control-panel/src/projects.ts';
import { Panel } from '../../control-panel/src/panel.ts';

const core = path.resolve(import.meta.dirname, '../../..');
function renderer() {
  const rendered: THREE.Scene[] = [];
  return { rendered, domElement: { style: {}, addEventListener() {}, removeEventListener() {} },
    xr: { isPresenting: false, enabled: false, getSession: () => null },
    setPixelRatio() {}, setSize() {}, setScissorTest() {}, setViewport() {}, setScissor() {}, setAnimationLoop() {}, render(scene: THREE.Scene) { rendered.push(scene); },
  } as unknown as THREE.WebGLRenderer & { rendered: THREE.Scene[] };
}

test('a newly created Unsorted project resolves Hand and shows SDK hands from fake binary provider frames without app wiring', async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'fresh-project-hands-')));
  const g = globalThis as Record<string, any>, previous = { host: g.__XRB_HOST__, socket: g.WebSocket, location: g.location, width: g.innerWidth, height: g.innerHeight };
  let app: ReturnType<typeof createXrbApp> | undefined;
  try {
    assert.equal(root, await fs.realpath(root), 'fake binary paths use the same canonical root as catalog ownership, including Windows short temp paths');
    await createProject(core, root, 'fresh-hand', 'Fresh Hand', 'combined');
    assert.match(await fs.readFile(path.join(root, '.gitignore'), 'utf8'), /config\/hands\//);
    const dir = path.join(root, 'projects/unsorted/fresh-hand');
    let project = (await readProject(dir, 'fresh-hand', 'unsorted'))!;
    assert.deepEqual(project.manifest!.inputs, ['mouse']);
    assert.equal(project.manifest!.plugins, undefined); assert.equal(project.manifest!.platformSettings, undefined);
    const source = await fs.readFile(path.join(dir, 'src/main.js'), 'utf8');
    assert.match(source, /createXrbApp\(renderer/); assert.doesNotMatch(source, /handsObject|runtimeName|nativePinch|handCapabilities/);
    await saveManifest(dir, { ...project.manifest!, inputs: ['mouse', 'hand'] }, project.manifestMtimeMs);
    project = (await readProject(dir, 'fresh-hand', 'unsorted'))!;
    const plugin = path.join(root, 'plugins/input-fixture'); await fs.mkdir(path.join(plugin, 'bin'), { recursive: true });
    await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: 'Fake provider', type: 'input', version: '1.0.0', handProviders: [
      { version: 1, id: 'fixture', runtimeName: 'fixture', transport: 'native', purpose: 'tracked' },
    ] }));
    const panel = new Panel(core, root, { send() {} } as ConstructorParameters<typeof Panel>[2]);
    panel.nativeProviders = async () => ({ error: null, rejected: [], providers: [{ name: 'fixture', role: 'input', builtin: false, path: path.join(plugin, 'bin/fixture.dll'), description: 'fake', version: '1' }] });
    const args = await panel.hostArgs(project, project.manifest!);
    const config = JSON.parse(await fs.readFile(args[0].slice('--config='.length), 'utf8'));
    assert.equal(config.input, 'fixture'); assert.deepEqual(config.inputs, ['mouse', 'fixture']);
    assert.equal(config.handPolicy, 'native');
    const embedded = (await readProject(path.join(core, 'embedded/projects/core/ui-kit'), 'bundled:ui-kit', 'core'))!;
    const embeddedManifest = { ...embedded.manifest!, inputs: ['mouse', 'hand'] };
    const embeddedArgs = await panel.hostArgs({ ...embedded, origin: 'bundled', readOnly: true }, embeddedManifest);
    const embeddedConfig = JSON.parse(await fs.readFile(embeddedArgs[0].slice('--config='.length), 'utf8'));
    assert.deepEqual(embeddedConfig.inputs, config.inputs, 'Unsorted and embedded apps use the same resolved input path');

    FakeSocket.all.length = 0;
    Object.assign(g, { innerWidth: 1280, innerHeight: 720, WebSocket: FakeSocket, location: { search: '?xrb-hand=native' },
      __XRB_HOST__: { version: 2, stereo: false, switchable: false, display: { widthM: 0.6, heightM: 0.34, tiltRad: 0, pixelsW: 1280, pixelsH: 720 },
        eye: { width: 1280, height: 720 }, channel: { url: 'ws://127.0.0.1:1/fake' }, hostNow: () => performance.now() },
    });
    const r = renderer();
    // Same managed API and pointer option used by the generated app; no scene.add(handsObject).
    app = createXrbApp(r, { xrb: { pointer: false }, autoStart: false });
    assert.equal(app.xrb.handsObject.parent, app.scene);
    const now = performance.now(), points = openHand([0, 0, 0.1]);
    FakeSocket.all[0].receive(handsMessage([{ id: 1, keypoints: points }], now));
    app.xrb.render(app.scene, app.camera);
    assert.equal(app.xrb.currentHands.length, 1); assert.equal(app.xrb.sceneHands.length, 1);
    assert.equal(app.xrb.handsObject.visible, true);
    assert.equal((app.xrb.handsObject.children[0] as THREE.InstancedMesh).count, 21);
    assert.ok(r.rendered.some(scene => scene.getObjectByName('xrb-hands') === app!.xrb.handsObject));
    assert.equal(app.scene.children.filter(child => child === app!.xrb.handsObject).length, 1);
    app.scene.add(app.xrb.handsObject); // Existing apps that attach it explicitly do not get duplicates.
    assert.equal(app.scene.children.filter(child => child === app!.xrb.handsObject).length, 1);

    const targetObject = new THREE.Object3D(); targetObject.position.copy(app.xrb.sceneHands[0].pinchPoint); app.scene.add(targetObject);
    const target = app.xrb.interaction.add(new PinchTarget(targetObject, { radius: 0.1 }));
    const events: string[] = []; target.on(e => events.push(e.type));
    points[4] = [...points[8]];
    for (let i = 1; i <= 4; i++) {
      FakeSocket.all[0].receive(handsMessage([{ id: 1, keypoints: points }], now + i * 16));
      app.xrb.render(app.scene, app.camera);
    }
    assert.equal(app.xrb.currentHands[0].pinching, true);
    assert.ok(events.includes('start'), 'the same SDK interaction core works without provider-specific app code');
    app.dispose();
    assert.equal(app.xrb.handsObject.parent, null);
  } finally {
    app?.dispose();
    for (const [name, value] of Object.entries({ __XRB_HOST__: previous.host, WebSocket: previous.socket, location: previous.location, innerWidth: previous.width, innerHeight: previous.height })) {
      if (value === undefined) delete g[name]; else g[name] = value;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('Launcher, UI Kit and the template use the same managed API without hand-provider assumptions', async () => {
  for (const relative of ['templates/app/src/main.js', 'embedded/projects/core/launcher/src/main.js', 'embedded/projects/core/ui-kit/src/main.ts']) {
    const source = await fs.readFile(path.join(core, relative), 'utf8');
    assert.match(source, /createXrbApp\(renderer/);
    assert.doesNotMatch(source, /runtimeName|handCapabilities|nativePinch|nativeGrab|getHostInfo|__XRB_HOST__/);
    assert.doesNotMatch(source, /scene\.add\(xrb\.handsObject/);
  }
});

test('an explicit managed visual opt-out does not remove the shared hand API', () => {
  const g = globalThis as Record<string, any>, previous = { width: g.innerWidth, height: g.innerHeight };
  Object.assign(g, { innerWidth: 1280, innerHeight: 720 });
  const app = createXrbApp(renderer(), { handVisual: false, xrb: { pointer: false }, autoStart: false });
  try {
    assert.equal(app.xrb.handsObject.parent, null); assert.ok(app.xrb.interaction);
    const ingress = (app.xrb as any).handIngress;
    ingress.profile = { version: 1, offsetMm: { x: 100, y: 0, z: 0 }, sizeFactor: 1, appearance: {} };
    const raw = decodeMessage(handsMessage([{ id: 1 }], performance.now())) as HandsMessage;
    ingress.push('webxr', raw, performance.now()); app.xrb.render(app.scene, app.camera);
    assert.ok(Math.abs(app.xrb.currentHands[0].keypoints[0][0] - raw.hands[0].keypoints[0][0] - .1) < 1e-6);
    assert.equal(app.xrb.handsObject.parent, null);
  }
  finally { app.dispose(); if (previous.width === undefined) delete g.innerWidth; else g.innerWidth = previous.width; if (previous.height === undefined) delete g.innerHeight; else g.innerHeight = previous.height; }
});
