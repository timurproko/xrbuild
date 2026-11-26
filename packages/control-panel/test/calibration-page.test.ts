import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { REPO } from '../src/env.ts';
import { freePort } from '../src/host-runner.ts';
import { navigationItems, managedToolDestination } from '../ui/navigation.js';
import { validateToolLinks } from '../src/navigation.ts';
import { withBrowser } from './browser-fixture.ts';
import { inputFixture } from '../../../embedded/plugins/input-hands/samples/hand-tracking/test/calibration-helpers.ts';
import { plane } from '../../../embedded/plugins/input-hands/samples/hand-tracking/test/reconstruction-helpers.ts';
import { fitSpatialCalibration, exportSpatialCalibration, importSpatialCalibration } from '../../../embedded/plugins/input-hands/samples/hand-tracking/src/live/multiview/calibration.ts';
import { json } from '../../../embedded/plugins/input-hands/samples/hand-tracking/src/live/recording/format.ts';

const parent = process.env.XRB_TEST_ROOT ?? path.resolve(REPO, '.artifacts');
const freshRoot = `const old=document.getElementById('calibration-root'),root=old.cloneNode(true);for(const select of root.querySelectorAll('select')){const wrapper=select.closest('.xrb-select');if(wrapper)wrapper.replaceWith(select);delete select.dataset.xrbSelect;select.classList.remove('xrb-native-select');select.removeAttribute('tabindex');}old.replaceWith(root);`;
async function fixture(disabled: boolean, run: (base: string, root: string, app: ReturnType<typeof createServer>) => Promise<void>) {
  await fs.mkdir(parent, { recursive: true }); const root = await fs.mkdtemp(path.join(parent, 'calibration-')), port = await freePort();
  if (disabled) await fs.writeFile(path.join(root, 'xrb-plugins.json'), JSON.stringify({ disabled: ['input-hands'], settings: {} }));
  const app = createServer({ repo: REPO, workspace: root, port });
  await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${port}`, root, app); } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
}
test('Calibration is a reserved core module, not an optional or old laboratory route', async () => {
  const items = navigationItems('http://127.0.0.1:5180', [], 'calibration');
  assert.equal(items.find(i => i.id === 'calibration')?.current, true);
  assert.equal(items.find(i => i.id === 'calibration')?.href, 'http://127.0.0.1:5180/calibration/');
  assert.throws(() => managedToolDestination('/calibration/', 'http://127.0.0.1:5180'));
  assert.throws(() => validateToolLinks({ tools: [{ id: 'calibration', label: 'Other', route: '/other/', module: 'other.mjs' }] }));
  await fixture(false, async (base, root, app) => {
    const page = await fetch(base + '/calibration/'); assert.equal(page.status, 200); const html = await page.text(); assert.doesNotMatch(html, /Camera B → A transform|Checking calibration plugin/); assert.match(html, /xrb-spinner/);
    const status = await fetch(base + '/api/calibration').then(r => r.json());
    assert.equal(status.available, true, status.reason); assert.equal(status.capture.available, false); assert.match(status.capture.reason, /Native bridge|Camera device SDK/);
    assert.equal((await fetch(base + status.module)).status, 200);
    const marker = await fetch(base + '/calibration/tools/assets/tag36h11-0.svg'); assert.equal(marker.status, 200); assert.equal(marker.headers.get('content-type'), 'image/svg+xml'); assert.match(marker.headers.get('content-disposition') || '', /attachment/);
    assert.equal((await fetch(base + '/calibration/tools/assets/APRILTAG-LICENSE.txt')).status, 200);
    for (const file of ['src/main.ts', 'src/live/estimator.ts', 'src/live/rgbd/reconstruction.ts', 'src/live/multiview/fusion.ts', '../bridge/server.mjs']) assert.equal((await fetch(base + '/calibration/tools/' + file)).status, 404);
    for (const route of ['/hands-diagnostics/', '/hand-tracking/']) assert.equal((await fetch(base + route)).status, 404);
    const prefs = await fetch(base + '/api/calibration/preferences').then(r => r.json()); assert.deepEqual(prefs.values, {});
    await assert.rejects(fs.stat(path.join(root, 'config')), /ENOENT/); assert.equal(app.panel.jobs.list().length, 0); assert.equal(app.panel.runner.busy, false);
  });
});
test('shared capture exclusion blocks competing tools, setup and app preparation until release', async () => {
  await fixture(false, async (base, _root, app) => {
    const release = app.panel.acquireCapture('Calibration');
    assert.throws(() => app.panel.acquireCapture('Other'), /owns capture/);
    assert.throws(() => app.panel.setupBundledServices(), /owns capture/);
    const update = await fetch(base + '/api/update', { method: 'POST', headers: { Origin: base } }); assert.equal(update.status, 409); assert.match((await update.json()).error, /owns capture/);
    const project = { id: 'sample', dir: 'unused', manifest: { kind: 'app', name: 'Sample', version: '0.1.0' } } as any;
    await assert.rejects(app.panel.run(project, 'built'), /owns capture/);
    await assert.rejects(app.panel.preview(project, 'built', false, 'token', { clientPort: 1234 }), /owns capture/);
    // Prepared launches skip their own busy-job check, but must still respect capture ownership.
    const panel = app.panel as unknown as { refuseIfBusy(id: string): void };
    const refuseIfBusy = panel.refuseIfBusy;
    panel.refuseIfBusy = () => assert.fail('A prepared launch must not reject its own job');
    const prepared = { line() {}, async run() {} }, bundled = { ...project, readOnly: true };
    try {
      await assert.rejects(app.panel.run(bundled, 'built', undefined, undefined, undefined, prepared), /owns capture/);
      await assert.rejects(app.panel.preview(bundled, 'built', false, 'token', { clientPort: 1234 }, prepared), /owns capture/);
    } finally { panel.refuseIfBusy = refuseIfBusy; }
    release(); release(); const next = app.panel.acquireCapture('Other'); next();
  });
});
test('missing calibration contribution does not remove the page or silently start setup', async () => {
  await fixture(true, async (base, root) => {
    const status = await fetch(base + '/api/calibration').then(r => r.json()); assert.equal(status.available, false); assert.match(status.reason, /not installed/);
    assert.equal((await fetch(base + '/calibration/')).status, 200); await assert.rejects(fs.stat(path.join(root, 'config')), /ENOENT/);
  });
});
test('Calibration browser opens passively in existing panel styles', { skip: !process.env.XRB_TEST_BROWSER }, async () => {
  await fixture(false, async (base, root) => withBrowser(async browser => {
    await browser.navigate(base + '/calibration/', "document.querySelector('#calibration-root')?.hidden === false");
    assert.equal(await browser.evaluate("document.querySelector('#cal-connect').disabled"), true);
    assert.match(await browser.evaluate("document.querySelector('#calibration-availability').textContent"), /Native bridge|Camera device SDK/);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await browser.evaluate("document.getElementById('cal-method').closest('.dropdown').querySelector('.dropdown-btn').click()");
    await browser.evaluate("[...document.querySelectorAll('[role=option]')].find(option=>option.textContent==='Marker').click()");
    assert.equal(await browser.evaluate("document.getElementById('cal-marker-assets').hidden"), false);
    await browser.evaluate("document.getElementById('cal-method').closest('.dropdown').querySelector('.dropdown-btn').click()");
    await browser.evaluate("[...document.querySelectorAll('[role=option]')].find(option=>option.textContent==='Manual targets').click()");
    await browser.evaluate("document.querySelector('#calibration-menu-button').click()");
    assert.equal(await browser.evaluate("document.querySelector('[data-navigation=calibration]').getAttribute('aria-current')"), 'page');
    await browser.evaluate("document.querySelector('#calibration-menu-button').click()");
    const metrics = await browser.send('Page.getLayoutMetrics');
    const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: metrics.cssContentSize.width, height: metrics.cssContentSize.height, scale: 1 } }); await fs.writeFile(path.join(parent, 'calibration-default.png'), Buffer.from(shot.data, 'base64'));
    await fs.writeFile(path.join(parent, 'calibration-default-dimensions.json'), JSON.stringify(await browser.evaluate('({outerWidth,outerHeight,innerWidth,innerHeight,dpr:devicePixelRatio})')));
    await assert.rejects(fs.stat(path.join(root, 'config')), /ENOENT/);
  }));
});

test('fewer than two native depth cameras gives a concise reason and cannot start capture', { skip: !process.env.XRB_TEST_BROWSER }, async () => {
  await fixture(false, async base=>withBrowser(async browser=>{
    await browser.navigate(base+'/calibration/',"document.querySelector('#calibration-root')?.hidden === false");
    await browser.evaluate(`(async()=>{const {mountCalibration,calibrationRequest}=await import('/calibration/tools/calibration-browser.mjs');${freshRoot}window.__started=0;window.__dispose=await mountCalibration(root,{capture:{available:true},request:(url,options)=>url==='/api/calibration/capture'?Promise.resolve({id:'fake',cameras:[{},{}]}):calibrationRequest(url,options),createCamera:()=>({async connect(){},async start(){window.__started++;},async stop(){},disconnect(){},snapshot(){return{devices:[]};}})});document.getElementById('cal-connect').click();})()`);
    await new Promise(r=>setTimeout(r,30));assert.equal(await browser.evaluate("document.getElementById('cal-capture-status').textContent"),'Two compatible depth cameras are required.');assert.equal(await browser.evaluate("document.getElementById('cal-start').disabled"),true);assert.equal(await browser.evaluate('window.__started'),0);await browser.evaluate('window.__dispose()');
  }));
});

test('offline saved results, scalar/setup imports and export work with no bridge and preserve preferences', { skip: !process.env.XRB_TEST_BROWSER }, async () => {
  const result=await fitSpatialCalibration(inputFixture()),scalar=await exportSpatialCalibration(result).text();
  await fixture(false, async(base,root)=>{
    const preferences=path.join(root,'config/plugins/input-hands/preferences.json');await fs.mkdir(path.dirname(preferences),{recursive:true});
    const original=JSON.stringify({version:1,owner:'input-hands',values:{'handtracking.capture-preferences.v1':'{"keep":true}','handtracking.fusion-calibrations.v1':JSON.stringify({version:1,values:[scalar]})}});await fs.writeFile(preferences,original);
    const imported=path.join(root,'legacy-setup.json'),invalid=path.join(root,'invalid.json'),download=path.join(root,'downloads');await fs.mkdir(download);
    await fs.writeFile(imported,await json({format:'xrbuild-two-view-setup',version:1,privateEvaluationOnly:true,exposureSyncVerified:false,spatial:result,timing:null,options:{}}).text());await fs.writeFile(invalid,'{"format":"forged"}');
    await withBrowser(async browser=>{
      await browser.navigate(base+'/calibration/',"document.querySelector('#calibration-root')?.hidden === false");assert.equal(await browser.evaluate("document.getElementById('cal-connect').disabled"),true);
      await browser.evaluate("document.getElementById('cal-load').click()");
      for(let i=0;i<40;i++){if(await browser.evaluate("document.getElementById('cal-quality').textContent.includes('Spatial checks passed')"))break;await new Promise(r=>setTimeout(r,20));}
      assert.match(await browser.evaluate("document.getElementById('cal-result').textContent"),/fixture-camera-a.*640x480@30/);
      await browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:download});await browser.evaluate("document.getElementById('cal-export').click()");
      const exported=path.join(download,'hand-tracking-spatial-calibration.json');for(let i=0;i<40;i++){if(await fs.stat(exported).catch(()=>null))break;await new Promise(r=>setTimeout(r,20));}
      assert.equal((await importSpatialCalibration(new Blob([await fs.readFile(exported)]))).inputSha256,result.inputSha256);
      const doc=await browser.send('DOM.getDocument'),field=await browser.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#cal-import'});
      await browser.send('DOM.setFileInputFiles',{nodeId:field.nodeId,files:[imported]});
      for(let i=0;i<40;i++){if(await browser.evaluate("document.getElementById('cal-quality').textContent.includes('Spatial checks passed')"))break;await new Promise(r=>setTimeout(r,20));}
      assert.equal(await browser.evaluate("document.getElementById('cal-error').hidden"),true);
      await browser.send('DOM.setFileInputFiles',{nodeId:field.nodeId,files:[invalid]});for(let i=0;i<40;i++){if(await browser.evaluate("!document.getElementById('cal-error').hidden"))break;await new Promise(r=>setTimeout(r,20));}
      assert.match(await browser.evaluate("document.getElementById('cal-error').textContent"),/Unsupported calibration/);
      assert.equal(await fs.readFile(preferences,'utf8'),original);await assert.rejects(fs.stat(path.join(root,'config/hands/profile.json')),/ENOENT/);
    });
  });
});

test('marker UI shows progress and quality without inference, cancellation releases both ports', { skip: !process.env.XRB_TEST_BROWSER }, async () => {
  const sources = inputFixture().sources;
  await fixture(false, async base => withBrowser(async browser => {
    await browser.navigate(base + '/calibration/', "document.querySelector('#calibration-root')?.hidden === false");
    await browser.evaluate(`(async()=>{
      const {mountCalibration,calibrationRequest}=await import('/calibration/tools/calibration-browser.mjs');const {encodePacket,framePacket}=await import('/calibration/tools/src/live/rgbd/protocol.ts');
      ${freshRoot}const sources=${JSON.stringify(sources)},base=${JSON.stringify(plane().meta)};window.__now=1000;window.__ports={};window.__calls=[];
      window.__dispose=await mountCalibration(root,{capture:{available:true},now:()=>window.__now,request:async(url,options)=>{if(url!=='/api/calibration/capture')return calibrationRequest(url,options);window.__calls.push(JSON.parse(options.body));return{id:'fake',cameras:[{},{}]};},createCamera:(side,callbacks)=>window.__ports[side]={callbacks,async connect(){},async start(choice){window.__calls.push(choice);},async stop(){window.__calls.push({stop:side});},disconnect(){},snapshot(){return{devices:Object.values(sources).map(cal=>({...cal,supportsBaseline:true,profiles:[cal.color,cal.depth]}))};}},onController:c=>window.__controller=c});
      window.__frame=async(n,detected=true)=>{window.__now=1000+n*220;const depth=new Uint8Array(640*480*2),view=new DataView(depth.buffer);for(let i=0;i<640*480;i++)view.setUint16(i*2,1000,true);const meta=structuredClone(base);meta.sequence=n+1;for(const key of ['color','depth','alignedDepth']){meta[key].number=n+1;meta[key].timestampMs=1000+n*220;}meta.marker={version:1,family:'tag36h11',detector:'apriltag-3.4.5',colorFrame:n+1,detections:detected?[{id:42,hamming:0,margin:30,corners:[{x:290+n,y:210},{x:350+n,y:210},{x:350+n,y:270},{x:290+n,y:270}]}]:[]};for(const side of ['a','b'])await window.__ports[side].callbacks.frame({packet:framePacket(encodePacket(meta,new Uint8Array(640*480*3),depth,depth).buffer),calibration:sources[side],receivedPageMs:window.__now,pageOriginMs:100000});};
    })()`);
    await browser.evaluate("document.getElementById('cal-connect').click()");await new Promise(r=>setTimeout(r,30));
    await browser.evaluate("for(const [side,serial]of [['a','fixture-camera-a'],['b','fixture-camera-b']]){const s=document.getElementById('cal-camera-'+side);s.value=serial;s.dispatchEvent(new Event('change'));}document.getElementById('cal-method').value='marker';document.getElementById('cal-method').dispatchEvent(new Event('change'));");
    await browser.evaluate("document.getElementById('cal-start').click()");await new Promise(r=>setTimeout(r,30));
    await browser.evaluate('window.__frame(0,false)');assert.match(await browser.evaluate("document.getElementById('cal-capture-status').textContent"), /0\/12.*Place marker/);
    assert.equal(await browser.evaluate("document.getElementById('cal-stop').textContent"), 'Cancel');
    for(let n=0;n<12;n++)await browser.evaluate(`window.__frame(${n})`);
    assert.equal(await browser.evaluate('window.__controller.snapshot().result?.spatialQualified'),true);
    assert.match(await browser.evaluate("document.getElementById('cal-quality').textContent"),/Physical accuracy and timing unverified/);
    assert.equal(await browser.evaluate('window.__calls.filter(v=>v.handInference===false&&v.markers===true).length'),2);
    await browser.evaluate("document.getElementById('cal-save').click()");
    for(let i=0;i<40;i++){if(await browser.evaluate("document.getElementById('cal-quality').textContent.includes('Saved.')"))break;await new Promise(r=>setTimeout(r,20));}
    assert.match(await browser.evaluate("document.getElementById('cal-quality').textContent"),/Saved\./);
    const prefs=await fetch(base+'/api/calibration/preferences').then(r=>r.json());assert.equal(JSON.parse(prefs.values['handtracking.fusion-calibrations.v1']).values.length,1);
    const metrics=await browser.send('Page.getLayoutMetrics');const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});await fs.writeFile(path.join(parent,'calibration-marker-software.png'),Buffer.from(shot.data,'base64'));
    await browser.evaluate("document.getElementById('cal-stop').click()");await new Promise(r=>setTimeout(r,30));
    assert.equal(await browser.evaluate('window.__calls.filter(v=>v.stop).length'),2);
    await browser.evaluate('window.__dispose()');
  }));
});

test('manual UI completes fit and held-out probes using injected native ports only', { skip: !process.env.XRB_TEST_BROWSER }, async () => {
  const input = inputFixture({ rotationRowMajor: [1,0,0,0,1,0,0,0,1], translationMeters: { x:0,y:0,z:0 } });
  await fixture(false, async (base, root) => withBrowser(async browser => {
    await browser.navigate(base + '/calibration/', "document.querySelector('#calibration-root')?.hidden === false");
    await browser.evaluate(`(async () => {
      const {mountCalibration,calibrationRequest} = await import('/calibration/tools/calibration-browser.mjs');
      const {framePacket,encodePacket} = await import('/calibration/tools/src/live/rgbd/protocol.ts');
      ${freshRoot}
      const sources = ${JSON.stringify(input.sources)}, meta = ${JSON.stringify(plane().meta)};
      window.__ports = {}; window.__calls = []; window.__now = 1000;
      window.__dispose = await mountCalibration(root, {capture:{available:true}, now:()=>window.__now,
        request:async (url, options) => {if(url!=='/api/calibration/capture')return calibrationRequest(url,options);const value=JSON.parse(options.body); window.__calls.push(value); return value.action==='connect'?{id:'fake',cameras:[{},{}]}:{ok:true};},
        createCamera:(side,callbacks)=>window.__ports[side]={callbacks, async connect(){}, async start(choice){window.__calls.push(choice);}, async stop(){}, disconnect(){}, snapshot(){return {devices:Object.values(sources).map(cal=>({...cal,supportsBaseline:true,profiles:[cal.color,cal.depth]}))};}},
        onController:controller=>window.__controller=controller});
      window.__frame = async (side, raw) => {const depth=new Uint8Array(640*480*2);const view=new DataView(depth.buffer);for(let i=0;i<640*480;i++)view.setUint16(i*2,raw,true); await window.__ports[side].callbacks.frame({packet:framePacket(encodePacket(meta,new Uint8Array(640*480*3),depth,depth).buffer),calibration:sources[side],receivedPageMs:window.__now,pageOriginMs:100000});};
    })()`);
    await browser.evaluate("document.getElementById('cal-connect').click()");
    for (let i=0;i<30;i++) { if (await browser.evaluate("document.getElementById('cal-camera-a').options.length===3")) break; await new Promise(r=>setTimeout(r,20)); }
    await browser.evaluate(`for(const [side,serial] of [['a','fixture-camera-a'],['b','fixture-camera-b']]){const select=document.getElementById('cal-camera-'+side);select.value=serial;select.dispatchEvent(new Event('change'));}`);
    await browser.evaluate("document.getElementById('cal-start').click()");
    await new Promise(r=>setTimeout(r,30));
    assert.equal(await browser.evaluate('window.__controller.snapshot().phase'), 'running');
    for (const target of input.targets) {
      await browser.evaluate(`document.getElementById('cal-target-id').value=${JSON.stringify(target.id)};document.getElementById('cal-target-use').value=${JSON.stringify(target.use)};`);
      for (const side of ['a','b']) {
        await browser.evaluate(`window.__frame(${JSON.stringify(side)},${Math.round(target.a.point.z*1000)})`);
        await browser.evaluate(`{const canvas=document.getElementById('cal-preview-${side}'),rect=canvas.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('click',{clientX:rect.left+${target.a.pixel.x}*rect.width/640,clientY:rect.top+${target.a.pixel.y}*rect.height/480}));}`);
        await new Promise(r=>setTimeout(r,15));
      }
    }
    assert.equal(await browser.evaluate('window.__controller.snapshot().targets'), 9);
    await browser.evaluate("document.getElementById('cal-fixed').checked=true;document.getElementById('cal-description').value='Generated software targets, not physical acceptance';document.getElementById('cal-uncertainty').value='5';document.getElementById('cal-fit').click()");
    for(let i=0;i<30;i++){if(await browser.evaluate('!!window.__controller.snapshot().result'))break;await new Promise(r=>setTimeout(r,20));}
    assert.equal(await browser.evaluate('window.__controller.snapshot().result?.spatialQualified'), true);
    assert.match(await browser.evaluate("document.getElementById('cal-quality').textContent"), /Spatial checks passed.*Physical accuracy and timing unverified/);
    assert.equal(await browser.evaluate('window.__calls.some(value=>value.handInference===true||value.markers===true)'), false);
    await browser.evaluate("document.getElementById('cal-save').click()");
    for(let i=0;i<40;i++){if(await browser.evaluate("document.getElementById('cal-quality').textContent.includes('Saved.')"))break;await new Promise(r=>setTimeout(r,20));}
    assert.match(await browser.evaluate("document.getElementById('cal-quality').textContent"),/Saved\./);
    assert.equal(JSON.parse((await fetch(base+'/api/calibration/preferences').then(r=>r.json())).values['handtracking.fusion-calibrations.v1']).values.length,1);
    const metrics=await browser.send('Page.getLayoutMetrics');const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}});await fs.writeFile(path.join(parent,'calibration-manual-software.png'),Buffer.from(shot.data,'base64'));
    await browser.evaluate("document.getElementById('cal-stop').click()"); await new Promise(r=>setTimeout(r,30));
    assert.equal(await browser.evaluate('window.__controller.snapshot().phase'), 'idle');
    await browser.evaluate('window.__dispose()'); await assert.rejects(fs.stat(path.join(root,'config/hands/profile.json')), /ENOENT/);
  }));
});
