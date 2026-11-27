import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

globalThis.innerWidth = 800;
globalThis.innerHeight = 450;
const core = process.env.XRB_CORE;
assert.ok(core, 'XRB_CORE is required, as for the sample build');
const requireCore = createRequire(path.join(core, 'packages/react/package.json'));
const React = requireCore('react');
const jsx = requireCore('react/jsx-runtime');
const THREE = requireCore('three');
const ts = createRequire(path.join(core, 'package.json'))('typescript');
const bridge = await import(pathToFileURL(path.join(core, 'packages/react/src/index.ts')).href);
const sdk = await import(pathToFileURL(path.join(core, 'packages/sdk/src/index.ts')).href);
const { fixture, settle } = await import(pathToFileURL(path.join(core, 'packages/react/test/fixture.ts')).href);
// Node selects Fiber's CJS main; match its Three catalogue, as Vite's dedupe does for ESM builds.
requireCore('@react-three/fiber').extend(THREE);

async function sample(entry = 'main.tsx') {
  const state = fixture(); state.app.dispose(); state.calls.length = 0;
  const window = new EventTarget();
  const log = [];
  let app, handle;
  class Controls {
    update() { state.calls.push('controls.update'); }
    dispose() { state.calls.push('controls.dispose'); }
  }
  const context = createContext({ window, document: { body: state.container }, console: { log: (value) => log.push(value) } });
  const dependencies = {
    react: { ...React, default: React }, 'react/jsx-runtime': jsx, three: THREE,
    'three/examples/jsm/controls/OrbitControls.js': { OrbitControls: Controls },
    '@xr-build/react': { ...bridge, mountXrbApp(container, children, options) {
      app = sdk.createXrbApp(state.renderer, { ...options, autoStart: false });
      handle = bridge.mountXrbApp(container, children, { ...options, app });
      let done;
      return { ...handle, dispose() {
        return done ??= handle.dispose().then(() => { app.dispose(); state.renderer.dispose(); state.canvas.remove(); });
      } };
    } },
  };
  const cache = new Map();
  async function load(name) {
    if (cache.has(name)) return cache.get(name);
    if (dependencies[name]) {
      const exports = dependencies[name];
      const module = new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
      cache.set(name, module); return module;
    }
    assert.ok(name.startsWith('./'), `unexpected import ${name}`);
    const source = await readFile(new URL(`../src/${name.slice(2)}`, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
    }, fileName: name }).outputText;
    const module = new SourceTextModule(compiled, { context });
    cache.set(name, module); await module.link(load); return module;
  }
  const module = await load(`./${entry}`); await module.evaluate(); await settle();
  return { ...state, window, log, app, handle, exports: module.namespace };
}
function pagehide(window, persisted = false) { window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted })); }
function cubes(state) {
  const objects = []; state.app.scene.traverse((object) => { if (object.name.startsWith('cube-')) objects.push(object); });
  return objects;
}

test('public component entry has no app, canvas or page lifecycle side effects', async () => {
  const state = await sample('index.ts');
  assert.equal(typeof state.exports.HelloCubeScene, 'function');
  assert.equal(typeof state.exports.RotatingCube, 'function');
  assert.equal(state.app, undefined); assert.deepEqual(state.calls, []);
});

test('components preserve cube geometry, animation, selection and owned-resource teardown', async () => {
  const state = await sample();
  const objects = cubes(state);
  assert.equal(objects.length, 3);
  assert.deepEqual(objects.map((cube) => cube.position.toArray()), [[-1.4, 0, -1.2], [0, 0, 0], [1.4, 0, 1.2]]);
  assert.deepEqual(objects.map((cube) => cube.geometry.parameters.width), [0.8, 0.8, 0.8]);
  state.tick(1000);
  assert.deepEqual(objects.map((cube) => cube.rotation.y), [0.3, 0.4, 0.5]);
  state.app.setProjection('orthographic'); state.tick(1016);
  state.canvas.dispatchEvent(Object.assign(new Event('click'), { clientX: 400, clientY: 225 }));
  await settle();
  assert.equal(objects[1].material.color.getHexString(), 'ffffff');
  assert.equal(state.log.at(-1), 'CLICK cube 1');
  state.canvas.dispatchEvent(Object.assign(new Event('click'), { clientX: 0, clientY: 0 }));
  await settle();
  assert.equal(objects[1].material.color.getHexString(), '5bd18b');
  assert.equal(state.log.at(-1), 'CLICK nothing');
  let resources = 0;
  state.app.scene.traverse((object) => {
    if (object.name.startsWith('cube-') || object instanceof THREE.GridHelper) {
      object.geometry.addEventListener('dispose', () => resources++);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.addEventListener('dispose', () => resources++);
    }
  });
  const done = state.exports.dispose(); assert.equal(state.exports.dispose(), done);
  await done; await settle();
  assert.equal(resources, 8);
  assert.equal(state.calls.filter((call) => call === 'renderer.dispose').length, 1);
  assert.equal(state.calls.filter((call) => call === 'canvas.remove').length, 1);
  assert.ok(state.calls.indexOf('loop.stop') < state.calls.indexOf('controls.dispose'));
  const count = state.calls.length;
  state.tick(2000); state.canvas.dispatchEvent(new Event('click')); pagehide(state.window);
  assert.equal(state.calls.length, count);
});

test('SDK compatibility picking matches the original whole-canvas raycaster in every view mode', async () => {
  const state = await sample(), objects = cubes(state);
  const raycaster = new THREE.Raycaster();
  for (const projection of ['perspective', 'orthographic']) for (const stereo of [false, true]) {
    state.app.setProjection(projection); state.app.xrb.setStereo(stereo); state.tick(1000);
    for (let x = 0; x <= 800; x += 100) {
      raycaster.setFromCamera(new THREE.Vector2(x / 800 * 2 - 1, 0), state.app.camera);
      const expected = raycaster.intersectObjects(objects)[0]?.object;
      state.canvas.dispatchEvent(Object.assign(new Event('click'), { clientX: x, clientY: 225 }));
      await settle();
      assert.equal(objects.find((cube) => cube.material.color.getHexString() === 'ffffff'), expected, `${projection}/${stereo}/${x}`);
    }
  }
  await state.exports.dispose();
});

test('page departure disposes, while persisted back-forward caching keeps the app usable', async () => {
  const state = await sample();
  pagehide(state.window, true);
  assert.equal(state.app.isRunning, true);
  state.tick(1000);
  pagehide(state.window);
  await state.exports.dispose();
  assert.equal(state.app.isDisposed, true);
  assert.equal(state.calls.filter((call) => call === 'renderer.dispose').length, 1);
});
