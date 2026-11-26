import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { saveHandsState, readHandsState, saveHandAdjustments } from '../src/hands-state.ts';
import { HAND_APPEARANCE_DEFAULTS } from '../../sdk/src/hand-profile.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('isolated Hands sections keep drafts, exact colours, independent resets, conflicts and work after reparenting', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'adjustment-ui-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace'); await fs.mkdir(core);
  let state = await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  state = await saveHandAdjustments(core, workspace, { appearance: HAND_APPEARANCE_DEFAULTS }, state.revision);
  const file = path.join(workspace, 'config/hands/profile.json'), bytes = await fs.readFile(file, 'utf8');
  const port = await freePort(), app = createServer({ repo: core, workspace, port });
  app.panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'fake metadata only' }], error: null, rejected: [] });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.captureCalls=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{captureCalls++;throw Error('forbidden')};if(navigator.xr)navigator.xr.requestSession=()=>{captureCalls++;throw Error('forbidden')};` });
      await navigate(`http://127.0.0.1:${port}/hands/`, `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      const set = (field: string, value: unknown) => evaluate(`(()=>{const e=document.querySelector('[data-field="${field}"]');${typeof value === 'boolean' ? `e.checked=${value}` : `e.value=${JSON.stringify(String(value))}`};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      const value = (field: string) => evaluate(`document.querySelector('[data-field="${field}"]').value`);
      const apply = async () => { await evaluate(`document.querySelector('[data-action="apply"]').click()`); await sleep(250); };
      assert.equal(await evaluate(`document.querySelectorAll('#hands-adjustments [data-field]').length`), 15);
      assert.equal(await evaluate(`!!document.querySelector('#hands-form #hands-adjustments')`), false);
      assert.match(await evaluate(`document.querySelector('#hands-adjustments').textContent`), /Changes where the hand touches/);
      await evaluate(`const e=document.querySelector('#hands-provider');e.value='core/webxr';e.dispatchEvent(new Event('change',{bubbles:true}));`);
      await set('offsetMm.x', 40); await set('offsetMm.y', -10); await set('offsetMm.z', 30); await set('sizeFactor', .8);
      await set('appearance.opacity', .456); await set('appearance.showBones', false);
      assert.equal(await fs.readFile(file, 'utf8'), bytes, 'drafts never persist or deliver');
      await apply(); state = await readHandsState(core, workspace);
      assert.deepEqual(state.profile.offsetMm, { x: 40, y: -10, z: 30 }); assert.equal(state.profile.sizeFactor, .8);
      assert.deepEqual(state.profile.appearance.jointColorLinear, [0, .541, 1]); assert.deepEqual(state.profile.appearance.boneColorLinear, [0, .482, 1]);
      assert.equal(state.profile.appearance.opacity, .456); assert.deepEqual(state.provider, { owner: 'core', id: 'simulated' });
      assert.equal(await evaluate(`document.querySelector('#hands-provider').value`), 'core/webxr', 'adjustment Apply preserves unsaved picker choice');
      await set('appearance.showJoints', false); await set('appearance.jointDiameterMm', 22); await set('appearance.boneDiameterMm', 12);
      await set('appearance.showPinchGrabIndicator', false); await set('appearance.indicatorDiameterMm', 40); await set('appearance.indicatorOpacity', .6);
      for (const key of ['jointColorLinear', 'boneColorLinear', 'indicatorColorLinear']) await set('appearance.' + key, '#ff0000');
      await apply(); state = await readHandsState(core, workspace);
      assert.deepEqual(state.profile.appearance.indicatorColorLinear, [1, 0, 0]); assert.equal(state.profile.appearance.showJoints, false);
      await evaluate(`document.querySelector('[data-reset="appearance"]').click()`);
      assert.equal(await value('offsetMm.x'), '40'); assert.equal(await value('appearance.opacity'), '0.333');
      await apply(); state = await readHandsState(core, workspace); assert.deepEqual(state.profile.appearance, {}); assert.equal(state.profile.sizeFactor, .8);
      await set('appearance.showBones', false); await evaluate(`document.querySelector('[data-reset="geometry"]').click()`);
      assert.equal(await value('sizeFactor'), '1'); assert.equal(await value('offsetMm.x'), '0'); assert.equal(await evaluate(`document.querySelector('[data-field="appearance.showBones"]').checked`), false);
      // Move the already-mounted component into a narrow future side-panel slot. No rebuilding or page IDs.
      await evaluate(`const aside=document.createElement('aside');aside.style.width='340px';document.querySelector('main').append(aside);aside.append(document.querySelector('#hands-adjustments'));`);
      await apply(); state = await readHandsState(core, workspace); assert.equal(state.profile.sizeFactor, 1); assert.equal(state.profile.appearance.showBones, false);
      await set('sizeFactor', .9); await saveHandsState(core, workspace, null, state.revision);
      await apply(); assert.match(await evaluate(`document.querySelector('[data-status]').textContent`), /changed|reload/i);
      assert.equal(await evaluate(`document.querySelector('[data-action="reload"]').hidden`), false);
      await evaluate(`document.querySelector('[data-action="reload"]').click()`); await sleep(150); assert.equal(await value('sizeFactor'), '1');
      assert.equal(await evaluate('captureCalls'), 0); assert.equal(await evaluate(`!!document.querySelector('canvas')`), false);
      assert.equal(app.panel.runner.state().phase, 'idle'); assert.equal(app.panel.jobs.list().length, 0);
      const valid = await readHandsState(core, workspace), invalid = JSON.stringify({ ...valid.raw, sizeFactor: 4 });
      await fs.writeFile(file, invalid);
      await evaluate(`document.querySelector('#hands-reload').click()`); await sleep(150);
      assert.match(await evaluate(`document.querySelector('#hands-message').textContent`), /sizeFactor.*0.5..1.5/);
      assert.equal(await fs.readFile(file, 'utf8'), invalid, 'visible error never overwrites invalid stored state');
    });
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
