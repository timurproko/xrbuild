import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withPostprocessing, pictures } from './helpers/postprocessing-browser.ts';
const skip = !process.env.XRB_TEST_BROWSER;
const settle = 'new Promise(r=>setTimeout(r,30))';

test('saved settings are not Applied before the matching generation ACK, including repreparation', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async browser => {
    const { evaluate } = browser;
    await evaluate(`snapshot.running=true;snapshot.sessionRunning=true;snapshot.delivery=meshState();component.refresh(snapshot)`);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-runtime]').textContent`), 'Applied');
    assert.equal(await evaluate('snapshot.delivery.drawingGeneration'), null, 'application does not imply drawing');
    await evaluate(`window.release=null;window.saveGate=()=>new Promise(r=>release=r);const f=root.querySelector('[data-mesh-field="mode"]');f.value='simple';f.dispatchEvent(new Event('change',{bubbles:true}))`); await evaluate(settle);
    assert.equal(await evaluate('root.dataset.meshState'), 'saving');
    await evaluate(`window.saveGate=null;release()`); await evaluate(settle);
    assert.notEqual(await evaluate('root.dataset.meshState'), 'applied', 'HTTP 200 and an older ACK do not prove the new saved revision');
    await evaluate(`snapshot.delivery=meshState({phase:'Preparing',requestedGeneration:2,appliedGeneration:1,progress:.45});component.refresh(snapshot)`);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-runtime]').textContent`), 'Preparing · 45%');
    await pictures(browser, 'after-preparing');
    assert.equal(await evaluate('snapshot.sessionRunning'), true);
    await evaluate(`snapshot.delivery=meshState({requestedGeneration:2,appliedGeneration:1});component.refresh(snapshot)`);
    assert.notEqual(await evaluate('root.dataset.meshState'), 'applied');
    await evaluate(`snapshot.delivery=meshState({requestedGeneration:2,appliedGeneration:2});component.refresh(snapshot)`);
    assert.equal(await evaluate('root.dataset.meshState'), 'applied');
    await evaluate(`root.querySelector('[data-mesh-gear]').click()`);
    await pictures(browser, 'after-applied-menu');
    assert.equal(await evaluate('requests.length'), 1);
  });
});

test('Failed preserves desired values and Retry uses exact current run/revision, without another write', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    await evaluate(`snapshot.running=true;snapshot.delivery=meshState({phase:'Failed',requestedGeneration:2,appliedGeneration:1,reason:'Preparation failed'});component.refresh(snapshot)`);
    assert.match(await evaluate(`root.querySelector('[data-mesh-runtime]').textContent`), /Failed: Preparation failed/);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-delivery-retry]').hidden`), false);
    await evaluate(`window.releaseRetry=null;window.retryGate=()=>new Promise(r=>releaseRetry=r);root.querySelector('[data-mesh-delivery-retry]').click()`); await evaluate(settle);
    assert.deepEqual(await evaluate('retries'), [{ runId: 'run-a', revision: 'a'.repeat(64) }]);
    assert.equal(await evaluate('requests.length'), 0);
    assert.equal(await evaluate('root.dataset.meshState'), 'applying');
    await evaluate(`snapshot.delivery=meshState({phase:'Preparing',requestedGeneration:3,appliedGeneration:1});releaseRetry()`); await evaluate(settle);
    assert.equal(await evaluate('root.dataset.meshState'), 'preparing');
    await evaluate(`snapshot.delivery=meshState({requestedGeneration:3,appliedGeneration:3});component.refresh(snapshot)`);
    assert.equal(await evaluate('root.dataset.meshState'), 'applied');
    assert.equal(await evaluate('snapshot.choice.selected.id'), 'surface');
    assert.equal(await evaluate('requests.length'), 0);
  });
});

test('old polls, generations and retired run/retry responses cannot claim new application', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    await evaluate(`snapshot.running=true;snapshot.delivery=meshState();component.refresh(snapshot);window.finishOld=null;window.loadGate=()=>{window.loadGate=null;return new Promise(r=>finishOld=r)};component.reload()`); await evaluate(settle);
    await evaluate(`const f=root.querySelector('[data-mesh-field="detail"]');f.value='.8';f.dispatchEvent(new Event('change',{bubbles:true}))`); await evaluate(settle);
    await evaluate(`finishOld()`); await evaluate(settle);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').valueAsNumber`), .8);
    assert.notEqual(await evaluate('root.dataset.meshState'), 'applied');
    await evaluate(`snapshot.delivery=meshState({phase:'Preparing',requestedGeneration:5,appliedGeneration:1});component.refresh(snapshot);component.refresh({...snapshot,delivery:meshState({requestedGeneration:4,appliedGeneration:4})})`);
    assert.equal(await evaluate('root.dataset.meshState'), 'preparing');
    await evaluate(`snapshot.delivery=meshState({phase:'Failed',requestedGeneration:5,appliedGeneration:1,reason:'Configuration rejected'});component.refresh(snapshot);window.finishRetry=null;window.retryGate=()=>new Promise(r=>finishRetry=r);root.querySelector('[data-mesh-delivery-retry]').click()`); await evaluate(settle);
    await evaluate(`snapshot.delivery=meshState({runId:'run-b',phase:'Preparing',requestedGeneration:1,appliedGeneration:null});component.refresh(snapshot);finishRetry()`); await evaluate(settle);
    assert.equal(await evaluate('root.dataset.meshState'), 'preparing');
    await evaluate(`component.refresh({...snapshot,delivery:meshState({requestedGeneration:9,appliedGeneration:9})})`);
    assert.equal(await evaluate('root.dataset.meshState'), 'preparing', 'old run cannot revive even with a larger generation');
  });
});

test('retry refuses unseen run/revision changes and never retries an idle owner', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    await evaluate(`snapshot.running=true;snapshot.delivery=meshState({phase:'Failed',reason:'Runtime unavailable'});component.refresh(snapshot);snapshot.revision='b'.repeat(64);root.querySelector('[data-mesh-delivery-retry]').click()`); await evaluate(settle);
    assert.equal(await evaluate('retries.length'), 0);
    assert.match(await evaluate(`root.querySelector('[data-mesh-runtime]').textContent`), /changed.*Review/);
    await evaluate(`snapshot.running=false;snapshot.delivery=null;component.refresh(snapshot)`);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-runtime]').hidden`), true);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-delivery-retry]').hidden`), true);
    assert.equal(await evaluate('requests.length'), 0);
  });
});

test('legacy Ready, unknown evidence, wrong identity and None cleanup are honest', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    await evaluate(`snapshot.running=true;plugin.declaration.version=1;snapshot.delivery=meshState();component.refresh(snapshot)`);
    assert.equal(await evaluate('root.dataset.meshState'), 'unsupported');
    assert.match(await evaluate(`root.querySelector('[data-mesh-runtime]').textContent`), /relaunch/);
    await evaluate(`plugin.declaration.version=2;snapshot.delivery=meshState({appliedGeneration:null});component.refresh(snapshot)`);
    assert.notEqual(await evaluate('root.dataset.meshState'), 'applied');
    await evaluate(`snapshot.delivery=meshState({id:'other'});component.refresh(snapshot)`);
    assert.notEqual(await evaluate('root.dataset.meshState'), 'applied');
    await evaluate(`snapshot.delivery=meshState({runId:null});component.refresh(snapshot)`);
    assert.notEqual(await evaluate('root.dataset.meshState'), 'applied', 'missing run evidence remains unknown');
    await evaluate(`snapshot.choice.selected=null;snapshot.delivery=meshState({phase:'Preparing',requestedGeneration:2,appliedGeneration:1});component.refresh(snapshot)`);
    assert.equal(await evaluate('root.dataset.meshState'), 'preparing');
    await evaluate(`snapshot.delivery=meshState({owner:null,id:null,requestedGeneration:2,appliedGeneration:2});component.refresh(snapshot)`);
    assert.equal(await evaluate('root.dataset.meshState'), 'applied');
    await evaluate(`snapshot.delivery=meshState({owner:null,id:null,requestedGeneration:3,appliedGeneration:2,phase:'Preparing',progress:null});component.refresh(snapshot)`);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-runtime]').textContent`), 'Preparing');
  });
});
