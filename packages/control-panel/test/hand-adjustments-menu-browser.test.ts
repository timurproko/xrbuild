import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { withBrowser } from './browser-fixture.ts';

test('one presets menu saves, applies, manages and resets every Hands value, with scoped dismissal and disposal', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const scratch = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'adjustment-menu-'));
  const port = await freePort(), app = createServer({ repo: path.resolve(import.meta.dirname, '../../..'), workspace: path.join(scratch, 'workspace'), port });
  app.panel.nativeProviders = async () => ({ providers: [], error: null, rejected: [] });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Emulation.setDeviceMetricsOverride', { width: 660, height: 1000, deviceScaleFactor: 1, mobile: false });
      await navigate(`http://127.0.0.1:${port}/hands/`, `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      const key = async (key: string, code: string, value: number) => {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: value, ...(key === ' ' || key === 'Enter' ? { text: key === 'Enter' ? '\r' : ' ' } : {}) });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: value });
      };
      const P = '[data-presets-button]', M = '.hands-presets-menu';
      const menuItems = `[...document.querySelector('${M}').querySelectorAll('[role^="menuitem"]')].map(item=>[item.textContent.trim(),item.getAttribute('aria-checked'),item.disabled])`;
      assert.equal(await evaluate(`document.querySelectorAll('[data-reset-menu]').length`), 0, 'no per-tab reset gears remain');
      assert.deepEqual(await evaluate(`[document.querySelector('${P}').getAttribute('aria-label'),document.querySelector('${P}').getAttribute('aria-haspopup'),document.querySelector('${P}').getAttribute('aria-expanded'),document.querySelector('${M}').getAttribute('role')]`), ['Presets', 'menu', 'false', 'menu']);
      for (const [tab, shown] of [['setup', false], ['geometry', true], ['appearance', true], ['post', true]] as const) {
        await evaluate(`document.querySelector('[data-tab="${tab}"]').click()`);
        assert.equal(await evaluate(`!document.querySelector('.hands-presets').hidden`), shown, `presets icon on ${tab}`);
      }
      await evaluate(`document.querySelector('[data-tab="geometry"]').click()`);
      // Custom values: Add preset is available; the new preset is saved checked and Add becomes unavailable.
      await evaluate(`document.querySelector('${P}').click()`);
      assert.equal(await evaluate(`document.querySelector('${P}').getAttribute('aria-expanded')`), 'true');
      assert.deepEqual(await evaluate(`(()=>{const r=document.querySelector('${M}').getBoundingClientRect();return [document.querySelector('${M}').hidden,r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight];})()`), [false, true]);
      assert.deepEqual(await evaluate(menuItems), [['Add preset', null, false], ['Reset to defaults', null, false]]);
      await evaluate(`document.querySelector('[data-preset-add]').click()`);
      assert.equal(await evaluate(`document.activeElement.matches('[data-preset-input]')`), true, 'Add preset focuses the name field');
      await evaluate(`document.activeElement.value='Wide'`);
      await key('Enter', 'Enter', 13);
      assert.deepEqual(await evaluate(menuItems), [['Wide', 'true', false], ['Add preset', null, true], ['Reset to defaults', null, false]]);
      assert.equal(await evaluate(`JSON.parse(localStorage.getItem('xrb.hands.presets.v2'))[0].values.adjust.sizeFactor`), 1, 'the preset stores the Transform values');
      await key('Escape', 'Escape', 27);
      assert.equal(await evaluate(`document.activeElement.matches('${P}') && document.querySelector('${M}').hidden && document.activeElement.getAttribute('aria-expanded')==='false'`), true, 'Escape closes and returns focus');
      // An edit that matches no preset clears the check; choosing the preset applies it again.
      await evaluate(`{const field=document.querySelector('[data-field="sizeFactor"]');field.value='1.5';field.dispatchEvent(new Event('change',{bubbles:true}))}`);
      await evaluate(`document.querySelector('${P}').click()`);
      assert.deepEqual(await evaluate(menuItems), [['Wide', 'false', false], ['Add preset', null, false], ['Reset to defaults', null, false]]);
      await evaluate(`document.querySelector('[data-preset-name="Wide"]').click()`);
      assert.equal(await evaluate(`document.querySelector('[data-field="sizeFactor"]').value`), '1');
      assert.equal(await evaluate(`document.querySelector('${M}').hidden`), true, 'choosing a preset closes the menu');
      // Right-click manages a preset without changing the current values.
      const contextOn = (name: string) => `(()=>{const item=document.querySelector('[data-preset-name="${name}"]'),r=item.getBoundingClientRect();item.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+4,clientY:r.top+4}));return !document.querySelector('.hands-presets-context').hidden;})()`;
      const names = async () => (await evaluate(menuItems)).map((item: unknown[]) => item[0]);
      await evaluate(`document.querySelector('${P}').click()`);
      assert.equal(await evaluate(contextOn('Wide')), true, 'right-click opens Rename, Duplicate and Delete');
      await evaluate(`document.querySelector('[data-preset-action="duplicate"]').click()`);
      assert.deepEqual(await names(), ['Wide', 'Wide copy', 'Add preset', 'Reset to defaults']);
      await evaluate(contextOn('Wide copy'));
      await evaluate(`document.querySelector('[data-preset-action="rename"]').click()`);
      await evaluate(`document.activeElement.value='Narrow'`); await key('Enter', 'Enter', 13);
      assert.deepEqual(await names(), ['Wide', 'Narrow', 'Add preset', 'Reset to defaults']);
      await evaluate(contextOn('Narrow'));
      await evaluate(`document.querySelector('[data-preset-action="delete"]').click()`);
      assert.deepEqual(await names(), ['Wide', 'Add preset', 'Reset to defaults']);
      assert.equal(await evaluate(`document.querySelector('[data-field="sizeFactor"]').value`), '1', 'managing presets keeps the current values');
      await evaluate(`document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
      assert.equal(await evaluate(`document.querySelector('${M}').hidden`), true, 'outside press dismisses');
      // Reset to defaults restores every section from the same menu.
      await evaluate(`{const field=document.querySelector('[data-field="sizeFactor"]');field.value='1.5';field.dispatchEvent(new Event('change',{bubbles:true}))}`);
      await evaluate(`document.querySelector('${P}').click();document.querySelector('[data-preset-reset]').click()`);
      assert.equal(await evaluate(`document.querySelector('[data-field="sizeFactor"]').value`), '1');
      // Let the reset save finish so the reload below raises no unsaved-changes prompt.
      for (let i = 0; i < 100 && !/"sizeFactor":1[,}]/.test(await evaluate(`fetch('/api/hands').then(r=>r.text())`)); i++) await sleep(50);
      await sleep(300);
      // Color swatches open the shared popover under the swatch; right-click copies and pastes between swatches.
      await evaluate(`document.querySelector('[data-tab="appearance"]').click()`);
      const popover = await evaluate(`(()=>{const swatch=document.querySelector('[data-color="appearance.jointColorLinear"]');swatch.click();const pop=document.querySelector('.xrb-color-popover'),r=pop.getBoundingClientRect(),s=swatch.getBoundingClientRect();return {open:!!pop,right:Math.round(s.right-r.right),clear:r.top>=s.bottom||r.bottom<=s.top,hex:pop.querySelector('.xrb-color-hex').value,field:document.querySelector('[data-field="appearance.jointColorLinear"]').value};})()`);
      assert.equal(popover.open, true); assert.equal(popover.right, 0, 'popover is right-aligned with its swatch'); assert.equal(popover.clear, true, 'popover opens beside the swatch without covering it'); assert.equal(popover.hex, popover.field);
      await key('Escape', 'Escape', 27);
      assert.equal(await evaluate(`!!document.querySelector('.xrb-color-popover')`), false, 'Escape closes the popover');
      await evaluate(`document.querySelector('[data-color="appearance.jointColorLinear"]').click()`);
      assert.equal(await evaluate(`!!document.querySelector('.xrb-color-popover')`), true);
      await evaluate(`document.querySelector('[data-color="appearance.jointColorLinear"]').click()`);
      assert.equal(await evaluate(`!!document.querySelector('.xrb-color-popover')`), false, 'clicking the open swatch again closes its popover');
      // Hovering a slider highlights only the slider, never its paired number field.
      const slider = await evaluate(`(()=>{const r=document.querySelector('[data-range="appearance.jointDiameterMm"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...slider });
      assert.deepEqual(await evaluate(`[document.querySelector('[data-range="appearance.jointDiameterMm"]').matches(':hover'),document.querySelector('[data-field="appearance.jointDiameterMm"]').matches(':hover')]`), [true, false]);
      // Swatches show no idle outline and hover with the shared 1px field hover line, like slider thumbs.
      const swatchStyle = `(()=>{const c=getComputedStyle(document.querySelector('[data-color="appearance.jointColorLinear"]'));return [c.outlineStyle,c.outlineWidth,c.boxShadow];})()`;
      await evaluate('document.activeElement?.blur()');
      assert.deepEqual((await evaluate(swatchStyle)).filter((_: string, i: number) => i !== 1), ['none', 'none'], 'idle swatch has no outline or ring');
      const swatchPoint = await evaluate(`(()=>{const r=document.querySelector('[data-color="appearance.jointColorLinear"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...swatchPoint });
      assert.deepEqual((await evaluate(swatchStyle)).slice(0, 2), ['solid', '1px'], 'hovered swatch shows the 1px hover line');
      // The selected tab survives a reload (restart) without first flashing Setup.
      await evaluate(`document.querySelector('[data-tab="appearance"]').click()`);
      await navigate(`http://127.0.0.1:${port}/hands/`, `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      assert.deepEqual(await evaluate(`[document.querySelector('[data-tab="appearance"]').getAttribute('aria-selected'),document.getElementById('hands-setup').hidden]`), ['true', true]);
      await evaluate(`document.querySelector('[data-tab="setup"]').click()`);
      await evaluate(`document.querySelector('[data-tab="appearance"]').click()`);
      const menuFor = (key: string) => `(()=>{const s=document.querySelector('[data-color="appearance.${key}"]'),r=s.getBoundingClientRect();s.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+2,clientY:r.top+2}));return !document.querySelector('[data-color-action="copy"]').closest('.menu').hidden;})()`;
      assert.equal(await evaluate(menuFor('jointColorLinear')), true, 'right-click opens the color menu');
      await evaluate(`document.querySelector('[data-color-action="copy"]').click()`); await sleep(50);
      assert.equal(await evaluate(menuFor('indicatorColorLinear')), true);
      await evaluate(`document.querySelector('[data-color-action="paste"]').click()`); await sleep(100);
      assert.equal(await evaluate(`document.querySelector('[data-field="appearance.indicatorColorLinear"]').value`), popover.field, 'paste copies the color between pickers');
      assert.equal(await evaluate(`document.querySelector('#hands-view-reset').textContent.trim()`), 'Reset');
      assert.equal(await evaluate(`document.querySelector('#hands-view-reset').hasAttribute('data-reset-menu')`), false);
      await evaluate(`(async()=>{const {mountHandAdjustments}=await import('/hands-adjustments.js'),data=await (await fetch('/api/hands')).json();const holder=document.createElement('section'),root=document.createElement('aside');holder.append(root);document.body.append(holder);const editor=mountHandAdjustments(root,{load:async()=>data,apply:async()=>data});editor.refresh(data);window.extra={holder,editor};})()`);
      assert.equal(await evaluate(`extra.holder.querySelectorAll('[data-reset-menu],[data-presets-button]').length`), 0, 'an extra editor mounts without reset gears or a presets menu of its own');
      await evaluate(`extra.editor.dispose()`);
      assert.equal(await evaluate(`extra.holder.querySelectorAll('[role="tablist"],[role="menu"]').length`), 0, 'dispose removes the tabs and menus with their editor');
      await evaluate(`extra.holder.remove()`);
    });
  } finally { await app.close(); await fs.rm(scratch, { recursive: true, force: true }); }
});
