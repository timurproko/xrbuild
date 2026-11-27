import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { handMeshDeclaration } from '../src/hand-mesh-contract.ts';
import { MESH_CAPABILITIES } from '../../sdk/src/hand-mesh-protocol.ts';
import { decodeMessage } from '../../sdk/src/protocol.ts';
import { handsMessage } from '../../sdk/test/fixtures.ts';
import { handProfile } from '../../sdk/src/hand-profile.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('Hands viewport loads the complete SDK mesh graph, samples final pose and clears/disposes retired geometry', { skip: !process.env.XRB_TEST_BROWSER || !process.env.XRB_TEST_MESH_SUPERVISOR, timeout: 60000 }, async () => {
  const root = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(root, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(root, 'mesh-view-')), core = path.resolve(import.meta.dirname, '../../..'), port = await freePort();
  const app = createServer({ repo: core, workspace, port });
  app.panel.nativeProviders = async () => ({ providers: [], rejected: [], error: null });
  await new Promise<void>(r => app.server.listen(port, '127.0.0.1', r));
  const origin = new URL(app.url).origin, run = new HandMeshRun(() => [origin], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR });
  const plugin = { owner: 'workspace:fixture', id: 'surface', label: 'Surface', available: true, reason: '', program: process.execPath,
    declaration: handMeshDeclaration({ version: 2, id: 'surface', label: 'Surface', program: 'worker.exe', args: [fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url))], capabilities: MESH_CAPABILITIES, settingsVersion: 1,
      settings: [{ key: 'vertices', label: 'Quality', type: 'number', min: 3, max: 9, default: 3, changeMode: 'live' }] }) };
  const descriptor = await run.start(plugin), profile = handProfile({ offsetMm: { x: 20, y: -10, z: 5 }, sizeFactor: 1.2 });
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
      await navigate(app.url + 'hands/', `document.querySelector('#hands-view-error') && (!document.querySelector('#hands-view-error').hidden || document.querySelector('#hands-render-fps')?.textContent !== '—')`);
      assert.equal(await evaluate(`document.querySelector('#hands-view-error').hidden`), true);
      await evaluate(`(async()=>{window.v=(await import('/hands.js')).handsPage.view;window.meshFrames=[];const original=fetch;window.fetch=(url,init)=>{if(String(url).endsWith('/frame'))meshFrames.push(JSON.parse(init.body));return original(url,init)};await v.setProfile(${JSON.stringify(profile)});v.beginSession({epoch:'mesh-fixture'});v.setMeshRuntime(${JSON.stringify(descriptor)});})()`);
      const frame = decodeMessage(handsMessage([{ id: 1 }], 0));
      await evaluate(`window.inputFrame=${JSON.stringify(frame)};window.sourceSeq=0;window.feed=setInterval(()=>{const f=structuredClone(inputFrame),at=performance.now();f.hostTimeMs=f.captureTimeMs=at;v.pushFrame({epoch:'mesh-fixture',sequence:sourceSeq++,capturePageMs:at,frame:f});},16)`);
      for (let i = 0; i < 100 && !await evaluate(`v.meshState?.drawingGeneration !== null && v.meshState?.phase === 'Ready'`); i++) await sleep(20);
      assert.equal(await evaluate(`v.meshStatus`), 'Running');
      const input = await evaluate(`meshFrames.find(f=>f.hands.length)?.hands[0]`), pose = await evaluate(`v.currentHands[0]`);
      assert.deepEqual(input.keypoints, pose.keypoints); assert.equal(input.keypoints[0][0], .02);
      assert.equal(input.observations.confidence.length, 21); assert.equal(await evaluate(`v.active`), true);
      run.configure(plugin, { vertices: 9 }, 'changed');
      for (let i = 0; i < 100 && await evaluate(`v.meshState?.appliedGeneration`) !== 2; i++) await sleep(20);
      assert.equal(await evaluate(`v.meshState.appliedGeneration`), 2);
      await evaluate(`clearInterval(feed);v.clearHands()`); assert.equal(await evaluate(`v.currentHands.length`), 0); assert.equal(await evaluate(`v.meshState.drawingGeneration`), null);
      await evaluate(`v.clearSession()`); assert.equal(await evaluate(`v.meshState`), null); assert.equal(await evaluate(`v.setMeshRuntime(${JSON.stringify(descriptor)})`), false);
      await evaluate(`dispatchEvent(new Event('pagehide'))`);
    });
  } finally { await run.stop(); await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});
