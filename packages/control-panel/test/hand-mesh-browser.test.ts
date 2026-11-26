import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('Hands mounts its selector once, preserves drafts, saves next-run only and disposes polling', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'mesh-ui-')), core = path.resolve(import.meta.dirname, '../../..'), workspace = path.join(root, 'user'), plugin = path.join(workspace, 'plugins/example');
  await fs.mkdir(plugin, { recursive: true });
  const manifest = path.join(plugin, 'xrb-plugin.json');
  await fs.writeFile(manifest, JSON.stringify({ title: 'Example mesh', type: 'plugin', version: '1.0.0', handMesh: { version: 1, id: 'surface', label: 'Example mesh', program: 'runtime.exe', settingsVersion: 1,
    settings: [{ key: 'quality', label: 'Quality', type: 'select', default: 'mid', options: [{ value: 'low', label: 'Low' }, { value: 'mid', label: 'Mid' }] },
      { key: 'iterations', label: 'Iterations', type: 'number', min: 1, max: 4, step: 1, default: 2 }, { key: 'normals', label: 'Normals', type: 'boolean', default: true }] } }));
  await fs.writeFile(path.join(plugin, 'runtime.exe'), 'not executed');
  await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  const initial = await fs.readFile(path.join(workspace, 'config/hands/profile.json'), 'utf8');
  const port = await freePort(), app = createServer({ repo: core, workspace, port });
  app.panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'fake' }], rejected: [], error: null });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.meshReads=0;const originalFetch=window.fetch;window.fetch=(...args)=>{if(String(args[0]).includes('/api/hands/postprocessing'))meshReads++;return originalFetch(...args)};window.captureCalls=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{captureCalls++;throw Error('forbidden')};if(navigator.xr)navigator.xr.requestSession=()=>{captureCalls++;throw Error('forbidden')};` });
      await navigate(`http://127.0.0.1:${port}/hands/`, `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-mesh-selector]').length`), 1);
      assert.equal(await evaluate(`document.querySelector('[data-mesh-selector]').closest('#hands-postprocessing-root')!==null`), true);
      assert.equal(await evaluate(`document.querySelector('#hands-form').contains(document.querySelector('[data-mesh-selector]'))`), false);
      assert.equal(await evaluate(`document.querySelector('#hands-view-error').hidden`), true, 'the real SDK viewer import graph still loads');
      for (let i = 0; i < 50; i++) { if (await evaluate(`document.querySelector('[data-mesh-selector]').options.length===2`)) break; await sleep(20); }
      assert.equal(await fs.readFile(path.join(workspace, 'config/hands/profile.json'), 'utf8'), initial, 'passive mount does not create/change state');
      await evaluate(`const size=document.querySelector('[data-field="sizeFactor"]');size.value='.9';size.dispatchEvent(new Event('input',{bubbles:true}));`);
      const choose = (value: string) => evaluate(`(()=>{const e=document.querySelector('[data-mesh-selector]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await choose('workspace:example/surface');
      assert.equal(await evaluate(`document.querySelectorAll('[data-mesh-field]').length`), 3);
      await evaluate(`const quality=document.querySelector('[data-mesh-field="quality"]');quality.value='low';quality.dispatchEvent(new Event('change',{bubbles:true}));const n=document.querySelector('[data-mesh-field="iterations"]');n.value='4';n.dispatchEvent(new Event('input',{bubbles:true}));const normals=document.querySelector('[data-mesh-field="normals"]');normals.checked=false;normals.dispatchEvent(new Event('change',{bubbles:true}));`);
      const save = async () => {
        await evaluate(`document.querySelector('[data-mesh-save]').click()`);
        for (let i = 0; i < 100; i++) { if (await evaluate(`!document.querySelector('[data-mesh-selector]').disabled`)) return; await sleep(20); }
        assert.fail('mesh Save did not finish');
      };
      await save(); let state = await readHandsState(core, workspace);
      assert.deepEqual(state.provider, { owner: 'core', id: 'simulated' }); assert.equal(state.profile.sizeFactor, 1);
      assert.ok(state.raw.postprocessing, await evaluate(`document.querySelector('[data-mesh-message]').textContent`));
      assert.deepEqual((state.raw.postprocessing as any).settings['workspace:example/surface'].values, { quality: 'low', iterations: 4, normals: false });
      assert.equal(await evaluate(`document.querySelector('#hands-provider').value`), 'core/simulated');
      assert.equal(await evaluate(`document.querySelector('#hands-postprocessing-root').hidden`), false);
      assert.equal(await evaluate(`document.querySelector('[data-field="sizeFactor"]').valueAsNumber`), 0.9);
      assert.match(await evaluate(`document.querySelector('[data-mesh-message]').textContent`), /Saved.*next desktop run/);
      // Capture the real production mount in the page-owned slot, without injecting or moving controls.
      if (process.env.XRB_PROOF_DIR) {
        await fs.mkdir(process.env.XRB_PROOF_DIR, { recursive: true });
        for (const [theme, width] of [['light', 1280], ['dark', 1280], ['light', 390]] as const) {
          await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
          await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.querySelector('#hands-postprocessing-root').scrollIntoView()`);
          const clip = await evaluate(`(()=>{const r=document.querySelector('#hands-postprocessing-root').getBoundingClientRect();return{x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height,scale:1};})()`);
          const picture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
          await fs.writeFile(path.join(process.env.XRB_PROOF_DIR, `mesh-selector-${theme}-${width}.png`), Buffer.from(picture.data, 'base64'));
        }
      }
      await choose(''); await save(); state = await readHandsState(core, workspace);
      assert.equal((state.raw.postprocessing as any).selected, null); assert.equal((state.raw.postprocessing as any).settings['workspace:example/surface'].values.iterations, 4);
      await choose('workspace:example/surface');
      await saveHandsState(core, workspace, null, state.revision); await save();
      assert.match(await evaluate(`document.querySelector('[data-mesh-message]').textContent`), /changed|reload/i);
      assert.equal(await evaluate(`document.querySelector('[data-mesh-selector]').value`), 'workspace:example/surface', 'conflict preserves draft');
      await evaluate(`document.querySelector('[data-mesh-reload]').click()`); await sleep(150);
      await choose('workspace:example/surface'); await save();
      await fs.unlink(manifest); await evaluate(`document.querySelector('[data-mesh-reload]').click()`); await sleep(150);
      assert.equal(await evaluate(`document.querySelector('[data-mesh-selector]').value`), 'workspace:example/surface');
      assert.match(await evaluate(`document.querySelector('[data-mesh-readiness]').textContent`), /missing/);
      await choose(''); await save();
      assert.equal(await evaluate(`document.querySelector('#hands-postprocessing-root').hidden`), true);
      assert.match(await evaluate(`document.querySelector('#hands-postprocessing-root').textContent`), /not browser previews, published web builds or offline packages/);
      assert.equal(await evaluate('captureCalls'), 0); assert.equal(app.panel.runner.state().phase, 'idle');
      await evaluate(`dispatchEvent(new Event('pagehide'))`);
      const stopped = await evaluate('meshReads'); await sleep(1100);
      assert.equal(await evaluate('meshReads'), stopped, 'page teardown stops the mounted selector polling');
    });
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('delayed mesh Save locks every setting and does not accept or claim a newer busy edit', { skip: !process.env.XRB_TEST_BROWSER, timeout: 30000 }, async () => {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(parent, 'mesh-save-race-')), port = await freePort();
  const app = createServer({ repo: path.resolve(import.meta.dirname, '../../..'), workspace, port });
  app.panel.nativeProviders = async () => ({ providers: [], rejected: [], error: null });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
      await navigate(`http://127.0.0.1:${port}/hands/`, `!!document.querySelector('[data-mesh-selector]')`);
      await evaluate(`(async()=>{
        const {mountHandsPostprocessing}=await import('/hands-postprocessing.js');
        const root=document.createElement('div');root.id='mesh-save-race';document.body.append(root);
        const plugin={owner:'workspace:fixture',id:'mesh',label:'Fixture',available:true,reason:'Not started',declaration:{settingsVersion:1,settings:[
          {key:'quality',label:'Quality',type:'select',default:'low',options:[{value:'low',label:'Low'},{value:'mid',label:'Mid'}]},
          {key:'iterations',label:'Iterations',type:'number',min:1,max:4,default:2},
          {key:'normals',label:'Normals',type:'boolean',default:true}
        ]}};
        const snapshot={plugins:[plugin],revision:'a'.repeat(64),registryRevision:'registry',choice:{version:1,selected:null,settings:{}},running:false};
        window.saveFixture={requests:[],resolve:null};
        saveFixture.component=mountHandsPostprocessing(root,{pollMs:0,load:async()=>snapshot,save:body=>{
          saveFixture.requests.push(structuredClone(body));return new Promise(resolve=>{saveFixture.resolve=()=>resolve({revision:String.fromCharCode(97+saveFixture.requests.length).repeat(64),choice:{version:1,selected:body.selected,settings:{'workspace:fixture/mesh':{version:1,values:{quality:'low',iterations:2,normals:true,...body.values}}}}})});
        }});
        await new Promise(resolve=>setTimeout(resolve,0));
        const selector=root.querySelector('[data-mesh-selector]');selector.value='workspace:fixture/mesh';selector.dispatchEvent(new Event('change',{bubbles:true}));
        root.querySelector('[data-mesh-save]').click();
      })()`);
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('#mesh-save-race input, #mesh-save-race select, #mesh-save-race button')).every(e=>e.disabled)`), true, 'settings and numeric stepper buttons lock with the selector');
      await evaluate(`(()=>{
        const root=document.querySelector('#mesh-save-race');
        const quality=root.querySelector('[data-mesh-field="quality"]');quality.value='mid';quality.dispatchEvent(new Event('change',{bubbles:true}));
        const iterations=root.querySelector('[data-mesh-field="iterations"]');iterations.value='4';iterations.dispatchEvent(new Event('input',{bubbles:true}));
        const normals=root.querySelector('[data-mesh-field="normals"]');normals.checked=false;normals.dispatchEvent(new Event('change',{bubbles:true}));
        const selector=root.querySelector('[data-mesh-selector]');selector.value='';selector.dispatchEvent(new Event('change',{bubbles:true}));
        saveFixture.resolve();
      })()`);
      await sleep(20);
      const state = await evaluate(`(()=>{const root=document.querySelector('#mesh-save-race');return{
        sent:saveFixture.requests[0].values,quality:root.querySelector('[data-mesh-field="quality"]').value,
        iterations:root.querySelector('[data-mesh-field="iterations"]').value,normals:root.querySelector('[data-mesh-field="normals"]').checked,
        selected:root.querySelector('[data-mesh-selector]').value,dirty:root.dataset.dirty,saveDisabled:root.querySelector('[data-mesh-save]').disabled,
        fieldsEnabled:Array.from(root.querySelectorAll('[data-mesh-field], [data-number-step]')).every(e=>!e.disabled),message:root.querySelector('[data-mesh-message]').textContent
      }})()`);
      assert.deepEqual(state.sent, {}); assert.equal(state.quality, 'low'); assert.equal(state.iterations, '2'); assert.equal(state.normals, true);
      assert.equal(state.selected, 'workspace:fixture/mesh'); assert.equal(state.dirty, 'false'); assert.equal(state.saveDisabled, true); assert.equal(state.fieldsEnabled, true); assert.match(state.message, /Saved/);
      // A real edit after Save completes is a new unsaved draft and can be saved normally.
      await evaluate(`(()=>{const root=document.querySelector('#mesh-save-race'),field=root.querySelector('[data-mesh-field="quality"]');field.value='mid';field.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await evaluate(`document.querySelector('#mesh-save-race').dataset.dirty`), 'true');
      assert.equal(await evaluate(`document.querySelector('#mesh-save-race [data-mesh-save]').disabled`), false);
      await evaluate(`document.querySelector('#mesh-save-race [data-mesh-save]').click();saveFixture.resolve()`); await sleep(20);
      assert.equal(await evaluate(`saveFixture.requests[1].values.quality`), 'mid');
      assert.equal(await evaluate(`document.querySelector('#mesh-save-race [data-mesh-field="quality"]').value`), 'mid');
      assert.equal(await evaluate(`document.querySelector('#mesh-save-race').dataset.dirty`), 'false');
      await evaluate(`saveFixture.component.dispose();dispatchEvent(new Event('pagehide'))`);
    });
  } finally { await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});
