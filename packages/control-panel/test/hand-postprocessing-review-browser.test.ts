import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withPostprocessing } from './helpers/postprocessing-browser.ts';
import { handProfile, HAND_APPEARANCE_DEFAULTS } from '../../sdk/src/hand-profile.ts';
const skip = !process.env.XRB_TEST_BROWSER;
type Browser = Parameters<Parameters<typeof withPostprocessing>[0]>[0];
async function wait(browser: Browser, expression: string) {
  for (let i = 0; i < 100; i++) {
    if (await browser.evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`Did not settle: ${expression}`);
}
async function key(browser: Browser, value: string, code: string, text?: string) {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code, ...(text ? { text } : {}) });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code });
}
async function beginMinus(browser: Browser, selector: string) {
  await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
  await key(browser, '-', 'Minus', '-');
  assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).validity.badInput`), true, 'Chrome holds an incomplete minus, not a valid assigned value');
}

for (const next of ['', 'workspace:other/surface']) test(`completed settings drain before queued selection ${next || 'None'}`, { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async browser => {
    const { evaluate } = browser;
    await evaluate(`const other=structuredClone(plugin);other.owner='workspace:other';other.label='Other surface';snapshot.plugins.push(other);component.refresh(snapshot);window.release=null;window.saveGate=()=>new Promise(r=>release=r);const f=root.querySelector('[data-mesh-field="detail"]');f.value='.7';f.dispatchEvent(new Event('change',{bubbles:true}))`);
    await wait(browser, '!!window.release');
    await evaluate(`(()=>{const f=root.querySelector('[data-mesh-field="detail"]');f.value='.8';f.dispatchEvent(new Event('change',{bubbles:true}));const s=root.querySelector('[data-mesh-selector]');s.value=${JSON.stringify(next)};s.dispatchEvent(new Event('change',{bubbles:true}));window.saveGate=null;release()})()`);
    await wait(browser, `root.dataset.saving==='false'`);
    assert.deepEqual(await evaluate(`requests.map(r=>[r.selected?.owner??null,r.values.detail??null])`), [
      ['workspace:example', .7], ['workspace:example', .8], [next ? 'workspace:other' : null, next ? .6 : null],
    ]);
    assert.equal(await evaluate(`snapshot.choice.settings['workspace:example/surface'].values.detail`), .8);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-selector]').value`), next);
    assert.equal(await evaluate('root.dataset.dirty'), 'false');
    assert.equal(await evaluate(`root.querySelector('[data-mesh-message]').textContent`), '');
    assert.notEqual(await evaluate(`root.querySelector('[data-mesh-runtime]').textContent`), 'Not yet saved.');
  });
});

test('completed settings for several plugins drain without losing the final requested selection', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async browser => {
    const { evaluate } = browser;
    await evaluate(`const other=structuredClone(plugin);other.owner='workspace:other';other.label='Other surface';snapshot.plugins.push(other);component.refresh(snapshot);window.release=null;window.saveGate=()=>new Promise(r=>release=r);const f=root.querySelector('[data-mesh-field="detail"]');f.value='.7';f.dispatchEvent(new Event('change',{bubbles:true}))`);
    await wait(browser, '!!window.release');
    await evaluate(`(()=>{const f=root.querySelector('[data-mesh-field="detail"]');f.value='.8';f.dispatchEvent(new Event('change',{bubbles:true}));const s=root.querySelector('[data-mesh-selector]');s.value='workspace:other/surface';s.dispatchEvent(new Event('change',{bubbles:true}));const other=root.querySelector('[data-mesh-field="detail"]');other.value='.9';other.dispatchEvent(new Event('change',{bubbles:true}));s.value='workspace:example/surface';s.dispatchEvent(new Event('change',{bubbles:true}));window.saveGate=null;release()})()`);
    await wait(browser, `root.dataset.saving==='false' && root.dataset.dirty==='false'`);
    assert.deepEqual(await evaluate('requests.map(r=>[r.selected.owner,r.values.detail])'), [
      ['workspace:example', .7], ['workspace:example', .8], ['workspace:other', .9], ['workspace:example', .8],
    ]);
    assert.equal(await evaluate(`snapshot.choice.settings['workspace:other/surface'].values.detail`), .9);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-selector]').value`), 'workspace:example/surface');
  });
});

for (const refresh of ['none', 'poll', 'unrelated completion']) test(`real keyboard partial number survives ${refresh} in post-processing`, { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async browser => {
    const selector = '[data-mesh-field="detail"]';
    await browser.evaluate(`component.dispose();plugin.declaration.settings[0].min=-2;plugin.declaration.settings[0].max=2;component=mountMesh(root,options)`);
    await wait(browser, `root.querySelector('[data-mesh-field="detail"]')?.value==='0.6'`);
    if (refresh === 'unrelated completion') {
      await browser.evaluate(`window.release=null;window.saveGate=()=>new Promise(r=>release=r);const s=root.querySelector('[data-mesh-field="smooth"]');s.checked=false;s.dispatchEvent(new Event('change',{bubbles:true}))`);
      await wait(browser, '!!window.release');
    }
    await beginMinus(browser, selector);
    if (refresh === 'poll') await browser.evaluate('component.refresh(snapshot)');
    if (refresh === 'unrelated completion') {
      await browser.evaluate('window.saveGate=null;release()');
      await wait(browser, `root.dataset.saving==='false'`);
    }
    assert.equal(await browser.evaluate(`root.querySelector('${selector}').validity.badInput`), true, 'refresh/completion preserves browser-held incomplete text');
    await key(browser, '1', 'Digit1', '1');
    await key(browser, 'Enter', 'Enter');
    await wait(browser, `root.dataset.saving==='false' && root.dataset.dirty==='false'`);
    assert.equal(await browser.evaluate(`snapshot.choice.settings['workspace:example/surface'].values.detail`), -1);
    assert.equal(await browser.evaluate('requests.at(-1).values.detail'), -1);
  });
});

for (const refresh of ['none', 'poll', 'unrelated completion']) test(`real keyboard partial number survives ${refresh} in adjustments`, { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async browser => {
    await browser.evaluate(`(async()=>{component.dispose();const {mountHandAdjustments}=await import('/hands-adjustments.js');snapshot={revision:'a'.repeat(64),registryRevision:'registry',profile:${JSON.stringify(handProfile())},appearanceDefaults:${JSON.stringify(HAND_APPEARANCE_DEFAULTS)}};window.component=mountHandAdjustments(root,{load:async()=>structuredClone(snapshot),apply:async body=>{requests.push(structuredClone(body));if(window.saveGate)await saveGate();snapshot={...snapshot,profile:body.profile,revision:String.fromCharCode(97+requests.length).repeat(64)};return structuredClone(snapshot)}});component.refresh(snapshot)})()`);
    if (refresh === 'unrelated completion') {
      await browser.evaluate(`window.release=null;window.saveGate=()=>new Promise(r=>release=r);const s=root.querySelector('[data-field="appearance.showBones"]');s.checked=false;s.dispatchEvent(new Event('change',{bubbles:true}))`);
      await wait(browser, '!!window.release');
    }
    await beginMinus(browser, '[data-field="offsetMm.x"]');
    if (refresh === 'poll') await browser.evaluate(`snapshot.revision='z'.repeat(64);component.refresh(structuredClone(snapshot))`);
    if (refresh === 'unrelated completion') {
      await browser.evaluate('window.saveGate=null;release()');
      await wait(browser, `root.dataset.saving==='false'`);
    }
    assert.equal(await browser.evaluate(`root.querySelector('[data-field="offsetMm.x"]').validity.badInput`), true);
    await key(browser, '1', 'Digit1', '1'); await key(browser, 'Enter', 'Enter');
    await wait(browser, `root.dataset.saving==='false' && root.dataset.dirty==='false'`);
    assert.equal(await browser.evaluate('snapshot.profile.offsetMm.x'), -1);
    assert.equal(await browser.evaluate('requests.at(-1).profile.offsetMm.x'), -1);
  });
});
