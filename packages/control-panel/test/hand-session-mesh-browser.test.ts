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
import { surfaceFor, poseAt } from '../../sdk/test/mesh-motion-bench.ts';

test('opaque SDK skin has single-sided lighting from front and rear without inheriting skeleton opacity', { skip: !process.env.XRB_TEST_BROWSER, timeout: 30000 }, async () => {
  const root = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(root, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(root, 'mesh-material-')), core = path.resolve(import.meta.dirname, '../../..'), port = await freePort();
  const app = createServer({ repo: core, workspace, port }); app.panel.nativeProviders = async () => ({ providers: [], rejected: [], error: null });
  await new Promise<void>(r => app.server.listen(port, '127.0.0.1', r));
  const surface = surfaceFor(poseAt(0, 'still', 1));
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await navigate(app.url + 'hands/', `document.querySelector('#hands-render-fps')?.textContent && document.querySelector('#hands-render-fps').textContent !== '—'`);
      const properties = await evaluate(`(async()=>{
        const T=await import('three'),{HandVisual}=await import('/sdk/hand-visual.js'),{PanelFrame}=await import('/sdk/stereo.js');
        window.skinRenderer=new T.WebGLRenderer({antialias:true});skinRenderer.setSize(640,480);skinRenderer.domElement.id='skin-proof';document.body.replaceChildren(skinRenderer.domElement);
        window.skinScene=new T.Scene();skinScene.background=new T.Color('#172233');skinScene.add(new T.HemisphereLight('#ffffff','#26334a',3));const l=new T.DirectionalLight('#ffffff',3);l.position.set(-.3,.4,.6);skinScene.add(l);
        window.skinCamera=new T.PerspectiveCamera(30,640/480,.01,10);skinCamera.position.set(-.1,.08,.5);skinCamera.lookAt(-.1,.08,0);
        const v=new HandVisual();skinScene.add(v);v.applyAppearance({showJoints:false,showBones:false,opacity:0,boneColorLinear:[.1,.4,.7]});
        v.updateMeshes([{id:1,topology:'proof',positions:new Float32Array(${JSON.stringify(Array.from(surface.positions))}),indices:new Uint32Array(${JSON.stringify(Array.from(surface.indices))})}],new PanelFrame());
        window.skinVisual=v;skinRenderer.render(skinScene,skinCamera);const m=v.getObjectByName('xrb-hand-mesh').children[0].material;
        return{opaque:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,side:m.side,color:m.color.toArray()};
      })()`);
      assert.deepEqual(properties, { opaque: 1, transparent: false, depthWrite: true, side: 0, color: [.1, .4, .7] });
      for (const side of ['front', 'rear']) {
        await evaluate(`skinCamera.position.z=${side === 'front' ? .5 : -.5};skinCamera.lookAt(-.1,.08,0);skinRenderer.render(skinScene,skinCamera)`);
        if (process.env.XRB_PROOF_DIR) { await fs.mkdir(process.env.XRB_PROOF_DIR, { recursive: true }); const picture = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(process.env.XRB_PROOF_DIR, `opaque-skin-${side}.png`), Buffer.from(picture.data, 'base64')); }
      }
      await evaluate(`skinVisual.disposeMeshes();skinRenderer.dispose();dispatchEvent(new Event('pagehide'))`);
    });
  } finally { await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});

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
