import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withPostprocessing, pictures } from './helpers/postprocessing-browser.ts';
const skip = !process.env.XRB_TEST_BROWSER;

test('post-processing declared controls, paired numeric layout and scoped accessible reset', { skip, timeout: 60000 }, async () => {
  await withPostprocessing(async browser => {
    const { evaluate } = browser;
    await pictures(browser, 'after');
    assert.equal(await evaluate(`root.querySelectorAll('[data-mesh-field]').length`), 3);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-range]').value`), '0.6');
    await evaluate(`const field=root.querySelector('[data-mesh-field="detail"]');field.value='.75';field.dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-range]').value`), '0.75');
    assert.equal(await evaluate('requests.length'), 0, 'preview is local');
    await evaluate(`const range=root.querySelector('[data-mesh-range]');range.value='.3';range.dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').value`), '0.3');
    for (const theme of ['light', 'dark']) for (const width of [368, 320]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}';root.style.width='${width}px'`);
      assert.equal(await evaluate(`(()=>{const n=root.querySelector('[data-mesh-field="detail"]').getBoundingClientRect(),r=root.querySelector('[data-mesh-range]').getBoundingClientRect();return n.right<r.left && Math.abs(n.top-r.top)<20 && root.scrollWidth<=root.clientWidth})()`), true);
    }
    await pictures(browser, 'after-controls');
    await evaluate(`root.querySelector('[data-mesh-gear]').click()`);
    assert.equal(await evaluate(`document.activeElement===root.querySelector('[data-mesh-reset]')`), true);
    assert.equal(await evaluate(`root.querySelectorAll('[role="menuitem"]').length`), 1);
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    assert.equal(await evaluate(`root.querySelector('[role="menu"]').hidden && document.activeElement===root.querySelector('[data-mesh-gear]')`), true);
    await evaluate(`root.querySelector('[data-mesh-gear]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));document.querySelector('#outside').click()`);
    assert.equal(await evaluate(`root.querySelector('[role="menu"]').hidden`), true);
    await evaluate(`root.querySelector('[data-mesh-gear]').click();root.querySelector('[data-mesh-reset]').click()`);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').value`), '0.6');
    assert.equal(await evaluate(`root.querySelector('[data-mesh-selector]').value`), 'workspace:example/surface');
  });
});

test('arbitrary declaration defaults, any-step values, escaped metadata and passive visibility', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    await evaluate(`(async()=>{component.dispose();plugin.declaration.settings=[{key:'arbitrary',label:'<img src=x onerror="window.injected=true">',hint:'<b>Plain hint</b>',type:'number',min:-2,max:2,default:.12345}];component=mountMesh(root,options);await new Promise(r=>setTimeout(r,0))})()`);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field]').value`), '0.12345');
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field]').step`), 'any');
    assert.equal(await evaluate(`root.querySelector('img,b')!==null || !!window.injected`), false);
    assert.equal(await evaluate(`root.textContent.includes('<b>Plain hint</b>')`), true);
    await evaluate(`component.refresh({...snapshot,choice:{...snapshot.choice,selected:null}},{discard:true})`);
    assert.equal(await evaluate(`root.hidden`), false);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-reset]').disabled`), true);
    await evaluate(`component.refresh({...snapshot,plugins:[]},{discard:true})`);
    assert.equal(await evaluate('root.hidden'), true);
    assert.equal(await evaluate('requests.length'), 0);
    await evaluate(`component.refresh({...snapshot,choice:{...snapshot.choice,selected:{owner:'workspace:missing',id:'gone'}}},{discard:true})`);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-selector]').value`), 'workspace:missing/gone');
    assert.equal(await evaluate('root.hidden'), false);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-reset]').disabled`), true);
    const id = await evaluate(`root.querySelector('[data-mesh-gear]').id`);
    await evaluate(`const second=document.createElement('div');document.body.append(second);window.secondComponent=mountMesh(second,options)`);
    assert.notEqual(await evaluate(`document.querySelectorAll('[data-mesh-gear]')[1].id`), id);
    await evaluate('secondComponent.dispose()');
  });
});

test('a missing prerequisite shows Prerequisite and leaves only Install and the setting that asks for it', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async browser => {
    const { evaluate } = browser;
    const remount = async (patch: string) => {
      await evaluate(`component.dispose();snapshot.plugins=[{...plugin,setup:true,${patch}}];component=mountMesh(root,options)`);
      await evaluate('new Promise(resolve=>setTimeout(resolve,0))');
    };
    const state = () => evaluate(`({badge:root.querySelector('[data-mesh-ready]').textContent,install:root.querySelector('[data-mesh-install]').hidden?null:root.querySelector('[data-mesh-install]').textContent.trim(),
      installEnabled:!root.querySelector('[data-mesh-install]').disabled,enabled:[...root.querySelectorAll('[data-mesh-field],[data-mesh-range],#hands-mesh-brightness,#hands-mesh-color,[data-mesh-layer-enabled]')].filter(e=>!e.disabled).map(e=>e.dataset.meshField??e.dataset.meshRange??e.id??'switch')})`);
    await remount(`setupNeeded:{kind:'gpu',label:'GPU runtime',setting:'mode'}`);
    assert.deepEqual(await state(), { badge: 'Prerequisite', install: 'Install', installEnabled: true, enabled: ['mode'] }, 'the device-like setting can still switch back');
    await remount(`available:false,needsSetup:true,setupNeeded:null`);
    assert.deepEqual(await state(), { badge: 'Prerequisite', install: 'Install', installEnabled: true, enabled: [] });
    await evaluate(`window.saveGate=()=>new Promise(r=>window.openSave=r);root.querySelector('[data-mesh-selector]').value='';root.querySelector('[data-mesh-selector]').dispatchEvent(new Event('change',{bubbles:true}));root.querySelector('[data-mesh-selector]').value=plugin.owner+'/'+plugin.id;root.querySelector('[data-mesh-selector]').dispatchEvent(new Event('change',{bubbles:true}))`);
    assert.equal((await state() as { badge: string }).badge, 'Prerequisite', 'the badge shows with Install while the layer choice saves');
    await evaluate(`window.saveGate=null;window.openSave?.()`);
    await remount(`setupNeeded:null`);
    const ready = await state() as { badge: string; install: string | null };
    assert.deepEqual([ready.badge, ready.install], ['Ready', null]);
  });
});

test('the layer switch moves and locks on click, never flashes back, and unlocks once the saved state matches', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async browser => {
    const { evaluate } = browser;
    // A save that waits for the test and records enabled like the real server does.
    await evaluate(`component.dispose();options.save=async body=>{requests.push(structuredClone(body));await new Promise(r=>window.releaseSave=r);if(window.saveError)throw saveError;
      snapshot={...snapshot,revision:String.fromCharCode(97+requests.length).repeat(64),choice:{...snapshot.choice,enabled:body.enabled}};return structuredClone(snapshot)};
      component=mountMesh(root,options)`);
    await evaluate('new Promise(resolve=>setTimeout(resolve,0))');
    const look = () => evaluate(`(()=>{const s=root.querySelector('[data-mesh-layer-enabled]');return {checked:s.checked,disabled:s.disabled,badge:root.querySelector('[data-mesh-ready]').textContent}})()`);
    assert.deepEqual(await look(), { checked: true, disabled: false, badge: 'Ready' });
    await evaluate(`root.querySelector('[data-mesh-layer-enabled]').click()`);
    await evaluate('new Promise(resolve=>setTimeout(resolve,20))');
    assert.deepEqual(await look(), { checked: false, disabled: true, badge: 'Off' }, 'off at once, and locked');
    await evaluate(`component.reload?.()`);
    await evaluate('new Promise(resolve=>setTimeout(resolve,20))');
    assert.deepEqual(await look(), { checked: false, disabled: true, badge: 'Off' }, 'a repaint from older data cannot move it back');
    await evaluate('window.releaseSave()'); await evaluate('new Promise(resolve=>setTimeout(resolve,20))');
    assert.deepEqual(await look(), { checked: false, disabled: false, badge: 'Off' }, 'unlocked once saved');
    await evaluate(`root.querySelector('[data-mesh-layer-enabled]').click()`);
    await evaluate('new Promise(resolve=>setTimeout(resolve,20))');
    assert.deepEqual(await look(), { checked: true, disabled: true, badge: 'Starting' });
    await evaluate('window.releaseSave()'); await evaluate('new Promise(resolve=>setTimeout(resolve,20))');
    assert.deepEqual(await look(), { checked: true, disabled: false, badge: 'Ready' });
    // A failed save puts the switch back where it was and unlocks it.
    await evaluate(`window.saveError=new Error('offline');root.querySelector('[data-mesh-layer-enabled]').click()`);
    await evaluate('new Promise(resolve=>setTimeout(resolve,20))');
    await evaluate('window.releaseSave()'); await evaluate('new Promise(resolve=>setTimeout(resolve,20))');
    assert.deepEqual(await look(), { checked: true, disabled: false, badge: 'Ready' });
  });
});
