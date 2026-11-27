/** Explicit disposable real HTTP/process/browser measurement. No camera or person's panel. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createServer } from '../../src/server.ts';
import { freePort } from '../../src/host-runner.ts';
import { HandMeshRun } from '../../src/hand-mesh-run.ts';
import { handMeshDeclaration } from '../../src/hand-mesh-contract.ts';
import { MESH_CAPABILITIES } from '../../../sdk/src/hand-mesh-protocol.ts';
import { decodeMessage } from '../../../sdk/src/protocol.ts';
import { handsMessage, openHand } from '../../../sdk/test/fixtures.ts';
import { poseAt } from '../../../sdk/test/mesh-motion-bench.ts';
import { withBrowser, sleep } from '../browser-fixture.ts';
const out = process.env.XRB_PROOF_DIR;
if (!out || !process.env.XRB_TEST_MESH_SUPERVISOR || !process.env.XRB_TEST_BROWSER) throw new Error('Explicit owned proof/test paths, fake supervisor and disposable browser required');
await fs.mkdir(out, { recursive: true });
const core = path.resolve(import.meta.dirname, '../../../..'), workspace = await fs.mkdtemp(path.join(out, 'wall-workspace-')), port = await freePort();
const app = createServer({ repo: core, workspace, port }); app.panel.nativeProviders = async () => ({ providers: [], rejected: [], error: null });
await new Promise<void>(r => app.server.listen(port, '127.0.0.1', r));
const origin = new URL(app.url).origin;
const BeforeRun = (await import(pathToFileURL(path.join(out, 'baseline-run.ts')).href)).HandMeshRun;
const runs = [new BeforeRun(() => [origin], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }), new HandMeshRun(() => [origin], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR })];
const plugin = { owner: 'workspace:fixture', id: 'surface', label: 'Synthetic surface', available: true, reason: '', program: process.execPath,
  declaration: handMeshDeclaration({ version: 2, id: 'surface', label: 'Synthetic surface', program: 'worker.exe', args: [fileURLToPath(new URL('./mesh-motion-worker.ts', import.meta.url))], capabilities: MESH_CAPABILITIES, settingsVersion: 1, settings: [] }) };
try {
  const descriptors = await Promise.all(runs.map(r => r.start(plugin)));
  for (let i = 0; i < 1000 && runs.some(r => r.state().phase === 'Preparing'); i++) await sleep(10);
  if (runs.some(r => r.state().phase !== 'Ready')) throw new Error('Fake processor preparation failed');
  let source = await fs.readFile(path.join(out, 'baseline-client.ts'), 'utf8');
  source = stripTypeScriptTypes(source, { mode: 'strip' }).replace(/from 'file:[^']+hand-mesh-protocol.ts'/, `from '${origin}/sdk/hand-mesh-protocol.js'`);
  await withBrowser(async ({ navigate, evaluate, send }) => {
    await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
    await navigate(app.url + 'hands/', `document.querySelector('#hands-render-fps')?.textContent && document.querySelector('#hands-render-fps').textContent !== '—'`);
    await evaluate(`(async()=>{
      window.THREE=await import('three'); window.openHand=${openHand.toString()}; window.poseAt=${poseAt.toString()};
      window.trace=[];window.httpRows=[];const realFetch=fetch;window.fetch=async(...args)=>{const started=performance.now();try{const r=await realFetch(...args);if(window.recording&&String(args[0]).endsWith('/frame'))httpRows.push({motion,before:String(args[0]).startsWith(${JSON.stringify(descriptors[0].url)}),headersMs:performance.now()-started,status:r.status});if(String(args[0]).includes('/connect')||String(args[0]).endsWith('/frame')){trace.push({url:args[0],status:r.status,text:r.status>=400?await r.clone().text():null});if(trace.length>30)trace.shift();}return r;}catch(e){trace.push({error:String(e)});throw e;}};
      window.v=(await import('/hands.js')).handsPage.view; window.rows=[];window.motion='still';window.beforePicture=false;window.seq=0;
      const Before=(await import('data:text/javascript;base64,${Buffer.from(source).toString('base64')}')).HandMeshClient;
      window.legacy=new Before(${JSON.stringify(descriptors[0])});
      const {HandVisual}=await import('/sdk/hand-visual.js'); const draw=HandVisual.prototype.updateMeshes;
      HandVisual.prototype.updateMeshes=function(surfaces,panel){
        const at=performance.now();legacy.observed(v.currentHands.map(h=>h.id));const old=legacy.update(v.currentHands,at);
        if(window.recording && v.currentHands.length===2){
          for(const [before,list] of [[true,old],[false,surfaces]]) for(const h of v.currentHands){
            const s=list.find(m=>m.id===h.id);rows.push({at,motion,before,id:h.id,shown:!!s,ageMs:s?(s.sourceAgeMs??at-legacy.accepted.frame.sampleMs):null,residualM:s?.residualM??null});
          }
        }
        draw.call(this,beforePicture?old:surfaces,panel);
      };
      await v.setProfile({appearance:{showJoints:false,showBones:false}});v.beginSession({epoch:'wall-fixture'});v.setMeshRuntime(${JSON.stringify(descriptors[1])});
      window.frameTemplate=${JSON.stringify(decodeMessage(handsMessage([{ id: 1 }, { id: 2 }], 0)))};
      window.alive=true;window.motionStart=performance.now();
      function feed(at){if(!alive)return;const f=structuredClone(frameTemplate);f.hostTimeMs=f.captureTimeMs=at;
        f.hands.forEach((h,i)=>{h.keypoints=poseAt(at-motionStart,motion,i+1).keypoints;});v.pushFrame({epoch:'wall-fixture',sequence:seq++,frame:f,capturePageMs:at});requestAnimationFrame(feed);}
      requestAnimationFrame(feed);
    })()`);
    for (let i = 0; i < 100 && !await evaluate('v.meshState !== null'); i++) await sleep(20);
    if (!await evaluate('v.meshState !== null')) throw new Error('Mesh negotiation failed; do not record a missing connection as motion evidence');
    for (const motion of ['still', 'normal', 'fast', 'articulation-stress']) {
      await evaluate(`motion=${JSON.stringify(motion)};motionStart=performance.now();recording=false`); await sleep(1200);
      await evaluate('recording=true'); await sleep(5000); await evaluate('recording=false');
      for (const before of [false, true]) {
        await evaluate(`beforePicture=${before}`); await sleep(150);
        const image = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, `${motion}-${before ? 'before' : 'after'}.png`), Buffer.from(image.data, 'base64'));
        if (motion === 'fast' && !before) for (let i = 0; i < 12; i++) {
          await sleep(80); const frame = await send('Page.captureScreenshot', { format: 'png' });
          await fs.writeFile(path.join(out, `fast-motion-${String(i).padStart(2, '0')}.png`), Buffer.from(frame.data, 'base64'));
        }
      }
      await evaluate('beforePicture=false');
    }
    const rows = await evaluate('rows');
    console.log(JSON.stringify({ runs: runs.map(r => ({ state: r.state(), status: r.status })), browser: await evaluate('({status:v.meshStatus,legacy:legacy.status,state:v.meshState,trace})') }));
    await fs.writeFile(path.join(out, 'wall-motion-results.json'), JSON.stringify({ method: 'actual contained fake processor (3-10-ms worker delay plus 1% 45-ms tail), private pipes, loopback HTTP, SDK clients and Hands WebGL viewport; paired baseline service/client at e57eaac', httpRows: await evaluate('httpRows'), rows }, null, 2));
    await evaluate('alive=false;legacy.close();v.clearSession();dispatchEvent(new Event("pagehide"))');
  });
} finally { await Promise.all(runs.map(r => r.stop())); await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
