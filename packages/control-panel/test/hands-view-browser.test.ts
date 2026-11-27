import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('core Hands opens the real SDK scene without optional tools, generated data, capture or setup', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  const parent = process.env.XRB_TEST_ROOT ?? path.resolve(import.meta.dirname, '../../../.artifacts'); await fs.mkdir(parent, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(parent, 'hands-view-'));
  await fs.writeFile(path.join(workspace, 'xrb-plugins.json'), JSON.stringify({ disabled: ['input-hands'], settings: {} }));
  const port = await freePort(), panel = createServer({ repo: REPO, workspace, port });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await panel.close(); await fs.rm(workspace, { recursive: true, force: true }); });
  const mutations: string[] = []; panel.server.on('request', req => { if (!['GET', 'HEAD'].includes(req.method!)) mutations.push(req.method + ' ' + req.url); });
  await withBrowser(async ({ send, navigate, evaluate }) => {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.captureCalls=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{captureCalls++;throw Error('Camera forbidden')};` });
    await navigate(`${panel.url}hands/`, `document.body?.dataset.handsView==='ready' && !!document.querySelector('[data-field="sizeFactor"]')`);
    assert.equal(await evaluate(`document.title`), 'XR Build · Hands');
    assert.equal(await evaluate(`!!document.querySelector('canvas')`), true);
    assert.equal(await evaluate(`document.querySelector('#hands-view-error').hidden`), true);
    assert.equal(await evaluate(`document.querySelector('#hands-tracking-fps').textContent`), '—');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[role="tab"]')].map(tab=>tab.textContent)`), ['Setup', 'Transform', 'Visual', 'Post', 'Log'], 'only the side panel tabs exist');
    assert.equal(await evaluate(`!!document.querySelector('#hands-recording-actions')`), false);
    await evaluate(`document.querySelector('#hands-view-reset').click()`); await sleep(100);
    const fullscreen = await evaluate(`(()=>{const r=document.querySelector('#hands-fullscreen').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...fullscreen });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...fullscreen });
    await sleep(100);
    const fullscreenState = await evaluate(`({active:document.fullscreenElement?.id,error:document.querySelector('#hands-view-error').textContent,errorHidden:document.querySelector('#hands-view-error').hidden})`);
    // Headless Windows may deny the native permission even for trusted input. It must be visible, not swallowed.
    if (fullscreenState.active) { assert.equal(fullscreenState.active, 'hands-viewport'); await evaluate('document.exitFullscreen()'); }
    else { assert.equal(fullscreenState.error, 'not granted'); assert.equal(fullscreenState.errorHidden, false); }
    assert.equal(await evaluate(`captureCalls`), 0); assert.deepEqual(mutations, []);
    assert.equal(panel.panel.jobs.list().length, 0); assert.equal(panel.panel.runner.busy, false);
    await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 800, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  });
  await assert.rejects(fs.stat(path.join(workspace, 'config/hands/profile.json')), /ENOENT/);
});
