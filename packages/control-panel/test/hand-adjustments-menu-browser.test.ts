import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { withBrowser } from './browser-fixture.ts';

test('section reset gears provide accessible keyboard menus with scoped dismissal and disposal', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
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
      assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-reset-menu]'),button=>[button.getAttribute('aria-label'),button.className,button.getAttribute('aria-haspopup'),button.getAttribute('aria-expanded'),document.getElementById(button.getAttribute('aria-controls')).getAttribute('role')])`), [
        ['Position settings', 'xrb-icon-button', 'menu', 'false', 'menu'],
        ['Visual settings', 'xrb-icon-button', 'menu', 'false', 'menu'],
      ]);
      for (const section of ['geometry', 'appearance']) {
        const button = `[data-reset-menu="${section}"]`, item = `[data-reset="${section}"]`;
        await evaluate(`document.querySelector('[data-tab="${section}"]').click()`);
        assert.equal(await evaluate(`document.querySelector('[data-tab="${section}"]').getAttribute('aria-selected')`), 'true', 'each tab shows its own reset gear');
        await evaluate(`document.querySelector('${button}').focus()`);
        await key('Enter', 'Enter', 13);
        assert.equal(await evaluate(`document.activeElement.matches('${item}')`), true, 'Enter opens and focuses reset');
        assert.equal(await evaluate(`document.querySelector('${button}').getAttribute('aria-expanded')`), 'true');
        assert.deepEqual(await evaluate(`(()=>{const menu=document.querySelector('${item}').parentElement,rect=menu.getBoundingClientRect();return [menu.hidden,menu.querySelectorAll('[role="menuitem"]').length,menu.textContent.trim(),rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight];})()`), [false, 1, 'Reset to defaults', true]);
        await key('ArrowDown', 'ArrowDown', 40);
        assert.equal(await evaluate(`document.activeElement.matches('${item}')`), true);
        await key('Escape', 'Escape', 27);
        assert.equal(await evaluate(`document.activeElement.matches('${button}') && document.querySelector('${item}').parentElement.hidden && document.activeElement.getAttribute('aria-expanded')==='false'`), true);
        await key(' ', 'Space', 32);
        assert.equal(await evaluate(`document.activeElement.matches('${item}')`), true, 'Space opens and focuses reset');
        await evaluate('document.body.click()');
        assert.equal(await evaluate(`document.querySelector('${item}').parentElement.hidden`), true, 'outside click dismisses');
        await evaluate(`document.querySelector('${button}').click();document.querySelector('[role="tabpanel"]:not([hidden]) input[type="number"]').focus()`);
        assert.equal(await evaluate(`document.querySelector('${item}').parentElement.hidden`), true, 'focus leaving dismisses');
        await evaluate(`document.querySelector('${button}').focus()`); await key('ArrowDown', 'ArrowDown', 40);
        assert.equal(await evaluate(`document.activeElement.matches('${item}')`), true, 'arrow opens menu');
        await key('Tab', 'Tab', 9);
        assert.equal(await evaluate(`document.querySelector('${item}').parentElement.hidden`), true, 'Tab leaves without trapping focus');
      }
      assert.equal(await evaluate(`document.querySelector('#hands-view-reset').textContent.trim()`), 'Reset');
      assert.equal(await evaluate(`document.querySelector('#hands-view-reset').hasAttribute('data-reset-menu')`), false);
      await evaluate(`(async()=>{const {mountHandAdjustments}=await import('/hands-adjustments.js'),data=await (await fetch('/api/hands')).json();window.mounts=[];for(let i=0;i<2;i++){const holder=document.createElement('section'),root=document.createElement('aside');root.id='extra-adjustments-'+i;holder.append(root);document.body.append(holder);const editor=mountHandAdjustments(root,{load:async()=>data,apply:async()=>data});editor.refresh(data);mounts.push({root:holder,editor});}})()`);
      assert.equal(await evaluate(`(()=>{const buttons=[...document.querySelectorAll('[data-reset-menu]')];return new Set(buttons.map(b=>b.getAttribute('aria-controls'))).size===buttons.length;})()`), true, 'mount IDs do not collide');
      await evaluate(`mounts[0].root.querySelector('[data-reset-menu]').click();mounts[1].root.querySelector('[data-reset-menu]').click()`);
      assert.equal(await evaluate(`mounts[0].root.querySelector('[role="menu"]').hidden`), true, 'opening another mount dismisses the previous menu');
      assert.equal(await evaluate(`mounts[1].root.querySelector('[role="menu"]').hidden`), false);
      await evaluate(`mounts[1].editor.dispose();document.body.click();mounts[0].root.querySelector('[data-reset-menu]').click()`);
      assert.equal(await evaluate(`mounts[1].root.querySelectorAll('[data-reset-menu],[role="menu"],[role="tablist"]').length`), 0, 'dispose removes tabs and menus with their editor');
      assert.equal(await evaluate(`mounts[0].root.querySelector('[role="menu"]').hidden`), false, 'other mount remains usable');
      await evaluate(`const wrapper=document.createElement('div');document.body.append(wrapper);wrapper.append(mounts[0].root);mounts[0].root.querySelector('[role="menuitem"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);
      assert.equal(await evaluate(`document.activeElement===mounts[0].root.querySelector('[data-reset-menu]') && mounts[0].root.querySelector('[role="menu"]').hidden`), true, 'reparenting preserves Escape and focus');
      await evaluate(`mounts[0].editor.dispose();mounts.forEach(({root})=>root.remove())`);
    });
  } finally { await app.close(); await fs.rm(scratch, { recursive: true, force: true }); }
});
