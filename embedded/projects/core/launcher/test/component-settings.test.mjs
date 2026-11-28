import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
const core = process.env.XRB_CORE;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { componentApp } = await import(pathToFileURL(path.join(core, 'packages/react/test/component-app.fixture.mjs')));
const sdk = await import(pathToFileURL(path.join(core, 'packages/sdk/src/index.ts')));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const href = 'http://127.0.0.1:5398/?xrb-panel=http://127.0.0.1:5191/&xrb-project=launcher&xrb-hand-profile-run=run-1';
const objects = (state, predicate) => { const found = []; state.app.scene.traverse(o => { if (predicate(o)) found.push(o); }); return found; };
const controls = state => objects(state, o => o.userData.control === o);
const cards = state => objects(state, o => o.userData.launcherCard);
function native(state, type, control) {
  state.app.scene.updateMatrixWorld(true);
  const point = control.getWorldPosition(state.app.camera.position.clone()).project(state.app.camera);
  state.canvas.dispatchEvent(Object.assign(new Event(type), { clientX: (point.x + 1) * 400, clientY: (1 - point.y) * 225, pointerId: 1, pointerType: 'mouse', button: 0 }));
}

test('a standalone/package start applies the saved build snapshot without panel access', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'xrb-project.json'), 'utf8'));
  const state = await componentApp(root, { env: { VITE_XRB_COMPONENTS: { ...manifest, componentSettings: { 'bundled:ui-kit': { theme: 'accent' } } } } });
  try {
    for (let i = 0; i < 60; i++) state.tick(i * 16);
    assert.ok(controls(state).length);
    assert.ok(controls(state).every(control => control.themeId === 'accent'));
  } finally { await state.exports.dispose(); await state.dispose(); }
});

test('saved managed theme updates the actual run entry without remount, capture loss or navigation reset', async () => {
  let theme = 'accent', requests = 0;
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'xrb-project.json'), 'utf8'));
  const state = await componentApp(root, { href, env: { VITE_XRB_COMPONENTS: manifest }, fetch: async () => Response.json({ projects: Array.from({ length: 5 }, (_, i) => ({ id: `scene-${i + 1}`, entryExists: true, manifest: { kind: 'app', name: `Scene ${i + 1}` } })) }),
    dependencies: { '@xr-build/sdk': { ...sdk, connectComponentSettings: metadata => sdk.connectComponentSettings(metadata, { href, intervalMs: 5, fetch: async () => { requests++; return Response.json({ 'bundled:ui-kit': { theme } }); } }) } } });
  try {
    state.canvas.clientWidth = 800;
    state.app.setProjection('orthographic');
    for (let i = 0; i < 60; i++) state.tick(i * 16);
    const app = state.app, mount = state.handle, next = controls(state).find(c => c.title.text === 'Next page');
    assert.equal(next.themeId, 'accent', 'saved selection is applied on the initial mount');
    native(state, 'pointermove', next); native(state, 'pointerdown', next);
    const held = state.app.xrb.interaction.captured(-1); assert.ok(held);
    theme = 'default';
    for (let i = 0; i < 50 && next.themeId !== theme; i++) await sleep(10);
    assert.equal(next.themeId, 'default'); assert.equal(state.app, app); assert.equal(state.handle, mount);
    assert.equal(controls(state).find(c => c.title.text === 'Next page'), next);
    assert.equal(state.app.xrb.interaction.captured(-1), held);
    native(state, 'pointerup', next); await state.fire(60);
    assert.deepEqual(cards(state).map(c => c.userData.launcherCard.entry.title), ['Scene 4', 'Scene 5']);
    for (let i = 0; i < 60; i++) state.tick(1500 + i * 16);
    const open = controls(state).find(c => c.title.text === 'Open Scene 4');
    native(state, 'pointermove', open); native(state, 'pointerdown', open); native(state, 'pointerup', open); await state.fire(60);
    const accepted = [...state.pending].find(([, timer]) => timer.delay === 1150); assert.ok(accepted);
    const original = cards(state)[0]; theme = 'accent';
    for (let i = 0; i < 50 && open.themeId !== theme; i++) await sleep(10);
    assert.equal(open.themeId, 'accent'); assert.equal(cards(state)[0], original);
    assert.equal(state.pending.get(accepted[0]), accepted[1], 'the accepted URL/deadline is not replaced');
    await state.fire(1150);
    assert.equal(state.calls.filter(c => c.startsWith('navigate:')).length, 1);
    await state.exports.dispose();
    const stopped = requests; await sleep(30); assert.equal(requests, stopped); assert.equal(state.pending.size, 0);
  } finally { await state.exports.dispose(); await state.dispose(); }
});
