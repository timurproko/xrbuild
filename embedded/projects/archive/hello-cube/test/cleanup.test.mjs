import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as THREE from 'three';

async function sample() {
  const calls = [];
  const window = new EventTarget();
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  canvas.remove = () => calls.push('canvas.remove');
  let scene, frame;
  const app = {
    camera: new THREE.PerspectiveCamera(),
    xrb: { handsObject: new THREE.Group(), fps: 60, currentHands: [] },
    setFrame: (callback) => { frame = callback; },
    start: () => calls.push('app.start'),
    dispose: () => calls.push('app.dispose'),
  };
  class Renderer {
    domElement = canvas;
    dispose() { calls.push('renderer.dispose'); }
  }
  class Controls {
    update() { calls.push('controls.update'); }
    dispose() { calls.push('controls.dispose'); }
  }
  const context = createContext({
    window,
    document: { body: { appendChild: (element) => assert.equal(element, canvas) } },
    console: { log: () => calls.push('click') },
  });
  const dependencies = {
    three: { ...THREE, WebGLRenderer: Renderer },
    'three/examples/jsm/controls/OrbitControls.js': { OrbitControls: Controls },
    '@xr-build/sdk': {
      rendererOptions: () => ({}),
      createXrbApp: (_renderer, options) => {
        assert.equal(options.autoStart, false);
        scene = options.scene;
        return app;
      },
    },
    './icon.ts': { default: () => {} },
  };
  const source = stripTypeScriptTypes(await readFile(new URL('../src/main.ts', import.meta.url), 'utf8'));
  const module = new SourceTextModule(source, { context });
  await module.link((specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected import: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  const cubes = scene.children.filter((object) => object.isMesh);
  const grid = scene.children.find((object) => object instanceof THREE.GridHelper);
  const resources = [...cubes.flatMap((cube) => [cube.geometry, cube.material]), grid.geometry, grid.material];
  resources.forEach((resource, i) => resource.addEventListener('dispose', () => calls.push(`resource.${i}`)));
  return { calls, window, canvas, scene, cubes, frame, dispose: module.namespace.dispose };
}

function pagehide(window, persisted = false) {
  window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted }));
}

function assertCleanup({ calls, scene }) {
  assert.deepEqual(calls, [
    'app.dispose', 'controls.dispose',
    ...Array.from({ length: 8 }, (_, i) => `resource.${i}`),
    'renderer.dispose', 'canvas.remove',
  ]);
  assert.equal(scene.children.length, 0);
}

test('explicit teardown stops the app first and releases each owned resource exactly once', async () => {
  const state = await sample();
  assert.deepEqual(state.calls, ['app.start']);
  assert.equal(state.cubes.length, 3);
  state.frame({ timeMs: 1000 });
  assert.deepEqual(state.cubes.map((cube) => cube.rotation.y), [0.3, 0.4, 0.5]);
  state.canvas.dispatchEvent(Object.assign(new Event('click'), { clientX: 0, clientY: 0 }));
  assert.deepEqual(state.calls, ['app.start', 'controls.update', 'click']);
  state.calls.length = 0;
  state.dispose();
  state.dispose();
  pagehide(state.window);
  state.canvas.dispatchEvent(new Event('click'));
  assertCleanup(state);
});

test('page departure tears down safely, but a back-forward cached page stays usable', async () => {
  const state = await sample();
  state.calls.length = 0;
  pagehide(state.window, true);
  assert.deepEqual(state.calls, []);
  pagehide(state.window);
  pagehide(state.window);
  state.dispose();
  state.canvas.dispatchEvent(new Event('click'));
  assertCleanup(state);
});
