import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { saveHandsState, readHandsState } from '../src/hands-state.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

const settled = `document.querySelector('#hands-adjustments-root').dataset.saving==='false' && document.querySelector('#hands-adjustments-root').dataset.dirty==='false'`;
async function until(evaluate: (s: string) => Promise<any>, expression: string) {
  for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await sleep(25); }
  assert.fail(expression);
}
test('autosave retains network failures, queues finished edits with source writes, validates fields and respects the active view owner', { skip: !process.env.XRB_TEST_BROWSER, timeout: 45000 }, async () => {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(parent, 'hands-auto-')), core = path.resolve(import.meta.dirname, '../../..'), port = await freePort();
  // Two metadata-only workspace trackers: the picker lists installed workspace providers, not built-in sources.
  for (const id of ['alpha', 'beta']) {
    const plugin = path.join(workspace, 'plugins', id); await fs.mkdir(plugin, { recursive: true });
    await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: `Tracker ${id}`, type: 'input', version: '1.0.0', handProviders: [{ version: 1, id, runtimeName: `tracker-${id}`, transport: 'native', purpose: 'tracked' }] }));
  }
  await saveHandsState(core, workspace, { owner: 'workspace:alpha', id: 'alpha' }, (await readHandsState(core, workspace)).revision);
  const app = createServer({ repo: core, workspace, port });
  app.panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'metadata only' }, ...['alpha', 'beta'].map(id => ({ name: `tracker-${id}`, role: 'input' as const, builtin: false, path: path.join(workspace, 'plugins', id, 'bin', `${id}.dll`), version: '1', description: 'metadata only' }))], error: null, rejected: [] });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.adjustmentWrites=0;window.failApply=false;window.delayNext=false;const original=fetch;window.fetch=async(url,options)=>{if(url==='/api/hands/apply'){adjustmentWrites++;if(failApply)throw Error('Offline');}const response=await original(url,options);if(url==='/api/hands/apply'&&delayNext){delayNext=false;await new Promise(resolve=>window.releaseApply=resolve);}return response;};` });
      await navigate(`http://127.0.0.1:${port}/hands/`, `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      const commit = (key: string, value: number) => evaluate(`(()=>{const e=document.querySelector('[data-field="${key}"]');e.value='${value}';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await evaluate('failApply=true'); await commit('offsetMm.x', 20);
      await until(evaluate, `!document.querySelector('[data-recovery]').hidden && document.querySelector('#hands-adjustments-root').dataset.saving==='false'`);
      assert.equal((await readHandsState(core, workspace)).profile.offsetMm.x, 0);
      assert.equal(await evaluate(`document.querySelector('[data-field="offsetMm.x"]').value`), '20');
      assert.match(await evaluate(`document.querySelector('[data-status]').textContent`), /Couldn't save.*Offline/);
      await evaluate(`failApply=false;document.querySelector('[data-action="retry"]').click()`); await until(evaluate, settled);
      assert.equal((await readHandsState(core, workspace)).profile.offsetMm.x, 20);
      await evaluate('delayNext=true'); await commit('offsetMm.x', 25);
      await until(evaluate, `!!window.releaseApply`);
      await commit('offsetMm.x', 30); await commit('offsetMm.y', 7);
      await evaluate(`(()=>{const p=document.querySelector('#hands-provider');p.value='workspace:beta/beta';p.dispatchEvent(new Event('change',{bubbles:true}));releaseApply();})()`);
      await until(evaluate, `(${settled}) && !document.querySelector('#hands-provider').disabled`);
      const state = await readHandsState(core, workspace);
      assert.equal(state.profile.offsetMm.x, 30); assert.equal(state.profile.offsetMm.y, 7); assert.equal(state.provider?.id, 'beta');
      assert.equal(await evaluate(`document.querySelector('[data-recovery]').hidden`), true);
      const before = await evaluate('adjustmentWrites'); await commit('offsetMm.x', 151); await sleep(150);
      assert.equal(await evaluate('adjustmentWrites'), before);
      assert.equal((await readHandsState(core, workspace)).profile.offsetMm.x, 30);
      assert.equal(await evaluate(`document.querySelector('[data-field="offsetMm.x"]').getAttribute('aria-invalid')`), 'true');
      await commit('offsetMm.x', 30); await until(evaluate, settled);
      // A mounted live component owns the view. Neither the save callback nor idle polling may apply to it.
      await evaluate(`(async()=>{const {handsPage}=await import('/hands.js');window.ownedView=handsPage.view;window.activeDescriptor=Object.getOwnPropertyDescriptor(ownedView,'active');window.originalSetProfile=ownedView.setProfile;window.foreignProfileCalls=0;Object.defineProperty(ownedView,'active',{configurable:true,get:()=>true});ownedView.setProfile=async()=>{foreignProfileCalls++;return true};})()`);
      await commit('offsetMm.y', 8); await until(evaluate, settled); await sleep(1200);
      assert.equal((await readHandsState(core, workspace)).profile.offsetMm.y, 8);
      assert.equal(await evaluate('foreignProfileCalls'), 0);
      await evaluate(`Object.defineProperty(ownedView,'active',activeDescriptor);ownedView.setProfile=originalSetProfile;`);
      // A committed custom number-step click saves without an extra Apply or blur.
      await evaluate(`document.querySelector('[data-field="offsetMm.y"]').closest('.xrb-number-control').querySelector('[data-number-step="up"]').click()`); await until(evaluate, settled);
      assert.equal((await readHandsState(core, workspace)).profile.offsetMm.y, 9);
    });
  } finally { await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});
