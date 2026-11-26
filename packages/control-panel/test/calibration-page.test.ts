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

const parent = process.env.XRB_TEST_ROOT ?? path.resolve(REPO, '.artifacts');
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
    const page = await fetch(base + '/calibration/'); assert.equal(page.status, 200); assert.match(await page.text(), /Camera B → A transform/);
    const status = await fetch(base + '/api/calibration').then(r => r.json());
    assert.equal(status.available, true, status.reason); assert.equal(status.capture.available, false); assert.match(status.capture.reason, /Native bridge/);
    assert.equal((await fetch(base + status.module)).status, 200);
    for (const file of ['src/main.ts', 'src/live/estimator.ts', 'src/live/rgbd/reconstruction.ts', 'src/live/multiview/fusion.ts', '../bridge/server.mjs']) assert.equal((await fetch(base + '/calibration/tools/' + file)).status, 404);
    for (const route of ['/hands-diagnostics/', '/hand-tracking/']) assert.equal((await fetch(base + route)).status, 404);
    const prefs = await fetch(base + '/api/calibration/preferences').then(r => r.json()); assert.deepEqual(prefs.values, {});
    await assert.rejects(fs.stat(path.join(root, 'config')), /ENOENT/); assert.equal(app.panel.jobs.list().length, 0); assert.equal(app.panel.runner.busy, false);
  });
});
test('shared capture exclusion blocks competing tools, setup and app preparation until release', async () => {
  await fixture(false, async (_base, _root, app) => {
    const release = app.panel.acquireCapture('Calibration');
    assert.throws(() => app.panel.acquireCapture('Other'), /owns capture/);
    assert.throws(() => app.panel.setupBundledServices(), /owns capture/);
    const project = { id: 'sample', dir: 'unused', manifest: { kind: 'app', name: 'Sample', version: '0.1.0' } } as any;
    await assert.rejects(app.panel.run(project, 'built'), /owns capture/);
    await assert.rejects(app.panel.preview(project, 'built', false, 'token', { clientPort: 1234 }), /owns capture/);
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
    assert.match(await browser.evaluate("document.querySelector('#calibration-availability').textContent"), /Native bridge/);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await browser.evaluate("document.querySelector('#calibration-menu-button').click()");
    assert.equal(await browser.evaluate("document.querySelector('[data-navigation=calibration]').getAttribute('aria-current')"), 'page');
    const shot = await browser.send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(parent, 'calibration-default.png'), Buffer.from(shot.data, 'base64'));
    await fs.writeFile(path.join(parent, 'calibration-default-dimensions.json'), JSON.stringify(await browser.evaluate('({outerWidth,outerHeight,innerWidth,innerHeight,dpr:devicePixelRatio})')));
    await assert.rejects(fs.stat(path.join(root, 'config')), /ENOENT/);
  }));
});

test('manual UI completes fit and held-out probes using injected native ports only', { skip: !process.env.XRB_TEST_BROWSER }, async () => {
  const input = inputFixture({ rotationRowMajor: [1,0,0,0,1,0,0,0,1], translationMeters: { x:0,y:0,z:0 } });
  await fixture(false, async (base, root) => withBrowser(async browser => {
    await browser.navigate(base + '/calibration/', "document.querySelector('#calibration-root')?.hidden === false");
    await browser.evaluate(`(async () => {
      const {mountCalibration} = await import('/calibration/tools/calibration-browser.mjs');
      const {framePacket,encodePacket} = await import('/calibration/tools/src/live/rgbd/protocol.ts');
      const old = document.getElementById('calibration-root'), root = old.cloneNode(true); old.replaceWith(root);
      const sources = ${JSON.stringify(input.sources)}, meta = ${JSON.stringify(plane().meta)};
      window.__ports = {}; window.__calls = []; window.__now = 1000;
      window.__dispose = await mountCalibration(root, {capture:{available:true}, now:()=>window.__now,
        request:async (_url, options) => {const value=JSON.parse(options.body); window.__calls.push(value); return value.action==='connect'?{id:'fake',cameras:[{},{}]}:{ok:true};},
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
    await browser.evaluate("document.getElementById('cal-stop').click()"); await new Promise(r=>setTimeout(r,30));
    assert.equal(await browser.evaluate('window.__controller.snapshot().phase'), 'idle');
    await browser.evaluate('window.__dispose()'); await assert.rejects(fs.stat(path.join(root,'config/hands/profile.json')), /ENOENT/);
  }));
});
