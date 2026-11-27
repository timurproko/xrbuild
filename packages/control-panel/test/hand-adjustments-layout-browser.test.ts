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

const numeric = [
  ['offsetMm.x', -150, 150, 1], ['offsetMm.y', -150, 150, 1], ['offsetMm.z', -150, 150, 1],
  ['sizeFactor', .5, 1.5, .01], ['appearance.jointDiameterMm', 1, 40, 1],
  ['appearance.boneDiameterMm', 1, 30, 1], ['appearance.opacity', 0, 1, .001],
  ['appearance.indicatorDiameterMm', 1, 60, 1], ['appearance.indicatorOpacity', 0, 1, .01],
] as const;

async function until(evaluate: (s: string) => Promise<any>, expression: string) {
  for (let i = 0; i < 200; i++) { if (await evaluate(expression)) return; await sleep(25); }
  assert.fail(expression);
}

test('all numeric adjustments pair with sliders, retain commit timing and fit narrow themed sidebars', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const scratch = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'adjustment-layout-'));
  const core = path.resolve(import.meta.dirname, '../../..'), workspace = path.join(scratch, 'workspace');
  const state = await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  await saveHandAdjustments(core, workspace, { appearance: HAND_APPEARANCE_DEFAULTS }, state.revision);
  const port = await freePort(), app = createServer({ repo: core, workspace, port });
  app.panel.nativeProviders = async () => ({ providers: [], error: null, rejected: [] });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.adjustmentWrites=0;const original=fetch;window.fetch=(url,options)=>{if(url==='/api/hands/apply')adjustmentWrites++;return original(url,options)};` });
      await navigate(`http://127.0.0.1:${port}/hands/`, `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      const settled = () => until(evaluate, `document.querySelector('#hands-adjustments-root').dataset.saving==='false' && document.querySelector('#hands-adjustments-root').dataset.dirty==='false'`);
      assert.equal(await evaluate(`document.querySelectorAll('#hands-adjustments-root [data-range]').length`), 9);
      for (const [key, min, max, step] of numeric) {
        const field = `[data-field="${key}"]`, range = `[data-range="${key}"]`;
        assert.deepEqual(await evaluate(`(()=>{const n=document.querySelector('${field}'),r=document.querySelector('${range}');return [Number(n.min),Number(n.max),Number(n.step),Number(r.min),Number(r.max),Number(r.step),n.closest('label')===r.closest('label')];})()`), [min, max, step, min, max, step, true]);
        const before = await evaluate('adjustmentWrites');
        await evaluate(`(()=>{const r=document.querySelector('${range}');r.value=${min};r.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        assert.equal(await evaluate(`Number(document.querySelector('${field}').value)`), min);
        await sleep(30); assert.equal(await evaluate('adjustmentWrites'), before, `${key}: range drafts never save`);
        await evaluate(`document.querySelector('${range}').dispatchEvent(new Event('change',{bubbles:true}))`); await settled();
        assert.equal(await evaluate('adjustmentWrites'), before + 1);
        await evaluate(`(()=>{const n=document.querySelector('${field}');n.value=${max};n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        assert.equal(await evaluate(`Number(document.querySelector('${range}').value)`), max);
        assert.equal(await evaluate('adjustmentWrites'), before + 1);
        await evaluate(`document.querySelector('${field}').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`); await settled();
        await evaluate(`document.querySelector('${field}').dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(30);
        assert.equal(await evaluate('adjustmentWrites'), before + 2, `${key}: Enter plus change commits once`);
      }
      const beforeInvalid = await evaluate('adjustmentWrites');
      await evaluate(`(()=>{const n=document.querySelector('[data-field="offsetMm.x"]');n.value='151';n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      assert.equal(await evaluate(`document.querySelector('[data-field="offsetMm.x"]').getAttribute('aria-invalid')`), 'true');
      assert.equal(await evaluate(`document.querySelector('[data-field="offsetMm.x"]').value`), '151');
      assert.equal(await evaluate('adjustmentWrites'), beforeInvalid);
      assert.equal((await readHandsState(core, workspace)).profile.offsetMm.x, 150);
      await evaluate(`(()=>{const n=document.querySelector('[data-field="offsetMm.x"]');n.value='149';n.dispatchEvent(new Event('change',{bubbles:true}));})()`); await settled();
      await evaluate(`document.querySelector('[data-field="offsetMm.x"]').closest('.xrb-number-control').querySelector('[data-number-step="down"]').click()`); await settled();
      assert.equal((await readHandsState(core, workspace)).profile.offsetMm.x, 148);
      assert.equal(await evaluate(`document.querySelector('[data-range="offsetMm.x"]').value`), '148');
      assert.deepEqual((await readHandsState(core, workspace)).profile.appearance.jointColorLinear, [0, .541, 1]);
      for (const theme of ['light', 'dark']) for (const width of [340, 320]) {
        await evaluate(`document.documentElement.dataset.theme='${theme}'`);
        // Reparent into an isolated sidebar width without changing the mounted editor's identity.
        await evaluate(`(()=>{let aside=document.querySelector('#layout-sidebar');if(!aside){aside=document.createElement('aside');aside.id='layout-sidebar';aside.className='hands-panel xrb-sidebar';document.body.append(aside);}aside.style.width='${width}px';aside.append(document.querySelector('#hands-adjustments-root'));})()`);
        const layout = await evaluate(`(()=>{const root=document.querySelector('#hands-adjustments-root');const rows=[];for(const tab of document.querySelectorAll('[data-tab]')){tab.click();rows.push(...[...root.querySelectorAll('[role="tabpanel"]:not([hidden]) .hands-number-row')].map(row=>{const n=row.querySelector('.xrb-number-control').getBoundingClientRect(),r=row.querySelector('[data-range]').getBoundingClientRect(),s=row.querySelector('[data-color]')?.getBoundingClientRect();return r.width>0 && n.right<=r.left && Math.abs(n.y+n.height/2-r.y-r.height/2)<1 && (!s || r.right<=s.left);}));}document.querySelector('[data-tab]').click();return {overflow:root.scrollWidth>root.clientWidth,rows};})()`);
        assert.equal(layout.overflow, false, `${theme}/${width}: no horizontal scrolling`);
        assert.deepEqual(layout.rows, Array(9).fill(true), `${theme}/${width}: paired alignment and swatches`);
      }
    });
  } finally { await app.close(); await fs.rm(scratch, { recursive: true, force: true }); }
});
