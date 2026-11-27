import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withPostprocessing } from './helpers/postprocessing-browser.ts';
const skip = !process.env.XRB_TEST_BROWSER;
const settle = 'new Promise(r=>setTimeout(r,30))';
const change = (name: string, value: unknown, type = 'change') => `(()=>{const f=root.querySelector('[data-mesh-field="${name}"]');${typeof value === 'boolean' ? `f.checked=${value}` : `f.value=${JSON.stringify(String(value))}`};f.dispatchEvent(new Event('${type}',{bubbles:true}))})()`;

test('finished edits save once, previews and invalid drafts stay local, reset saves one section', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    await evaluate(change('detail', '.72', 'input'));
    assert.equal(await evaluate('requests.length'), 0);
    await evaluate(change('smooth', false)); await evaluate(settle);
    assert.deepEqual(await evaluate('requests[0].values'), { detail: .6, mode: 'full', smooth: false });
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').value`), '.72');
    await evaluate(`root.querySelector('[data-mesh-field="detail"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));root.querySelector('[data-mesh-field="detail"]').dispatchEvent(new Event('change',{bubbles:true}))`);
    await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 2);
    assert.equal(await evaluate('requests[1].values.detail'), .72);
    await evaluate(change('detail', '5')); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 2);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').getAttribute('aria-invalid')`), 'true');
    await evaluate(`root.querySelector('[data-mesh-gear]').click();root.querySelector('[data-mesh-reset]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 3);
    assert.deepEqual(await evaluate('requests[2].values'), { detail: .6, mode: 'full', smooth: true });
    await evaluate(`const range=root.querySelector('[data-mesh-range]');range.value='.4';range.dispatchEvent(new Event('input',{bubbles:true}))`);
    assert.equal(await evaluate('requests.length'), 3);
    await evaluate(`root.querySelector('[data-mesh-range]').dispatchEvent(new Event('change',{bubbles:true}))`); await evaluate(settle);
    assert.equal(await evaluate('requests[3].values.detail'), .4);
    await evaluate(`root.querySelector('[data-number-step="up"]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests[4].values.detail'), .41);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-save],[data-mesh-reload]')`), null);
  });
});

test('writes rebase only intended fields and require explicit review of same-field conflicts', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    await evaluate(change('detail', '.8', 'input'));
    await evaluate(`snapshot.revision='c'.repeat(64);snapshot.source='other';snapshot.choice.settings['workspace:example/surface']={version:1,values:{detail:.6,mode:'simple',smooth:true}}`);
    await evaluate(change('detail', '.8')); await evaluate(settle);
    assert.equal(await evaluate('requests[0].revision'), 'c'.repeat(64));
    assert.deepEqual(await evaluate('requests[0].values'), { detail: .8, mode: 'simple', smooth: true });
    assert.equal(await evaluate('snapshot.source'), 'other');
    await evaluate(change('detail', '.9', 'input'));
    await evaluate(`snapshot.revision='d'.repeat(64);snapshot.choice.settings['workspace:example/surface'].values.detail=.4`);
    await evaluate(change('detail', '.9')); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 1);
    assert.match(await evaluate(`root.querySelector('[data-mesh-message]').textContent`), /Changed elsewhere.*0.4/);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').value`), '.9');
    // A second unseen edit must conflict again, even after reviewing the first.
    await evaluate(`snapshot.revision='e'.repeat(64);snapshot.choice.settings['workspace:example/surface'].values.detail=.3;root.querySelector('[data-mesh-retry]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 1);
    assert.match(await evaluate(`root.querySelector('[data-mesh-message]').textContent`), /0.3/);
    await evaluate(`root.querySelector('[data-mesh-retry]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 2);
    assert.equal(await evaluate('requests[1].values.detail'), .9);
    await evaluate(change('detail', '.7', 'input'));
    await evaluate(`snapshot.revision='f'.repeat(64);snapshot.choice.settings['workspace:example/surface'].values.detail=.2`);
    await evaluate(change('detail', '.7')); await evaluate(settle);
    await evaluate(`root.querySelector('[data-mesh-discard]').click()`); await evaluate(settle);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').value`), '0.2');
    assert.equal(await evaluate('requests.length'), 2);
  });
});

test('newer edits survive pending writes and plugin/None switches retain stored values', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    await evaluate(`window.release=null;window.saveGate=()=>new Promise(r=>release=r)`);
    await evaluate(change('detail', '.7')); await evaluate(settle);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').disabled`), false);
    await evaluate(change('detail', '.8')); await evaluate(change('mode', 'simple'));
    await evaluate(`window.saveGate=null;release()`); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 2);
    assert.deepEqual(await evaluate('requests[1].values'), { detail: .8, mode: 'simple', smooth: true });
    assert.equal(await evaluate(`root.dataset.dirty`), 'false');
    // Selection is an immediate commit and does not discard an unfinished field.
    await evaluate(change('detail', '.9', 'input'));
    await evaluate(`root.querySelector('[data-mesh-selector]').value='';root.querySelector('[data-mesh-selector]').dispatchEvent(new Event('change',{bubbles:true}))`); await evaluate(settle);
    assert.equal(await evaluate('snapshot.choice.selected'), null);
    assert.equal(await evaluate(`snapshot.choice.settings['workspace:example/surface'].values.detail`), .8);
    await evaluate(`root.querySelector('[data-mesh-selector]').value='workspace:example/surface';root.querySelector('[data-mesh-selector]').dispatchEvent(new Event('change',{bubbles:true}))`); await evaluate(settle);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').value`), '.9');
    assert.equal(await evaluate('requests.at(-1).values.detail'), .8, 'unfinished field is not submitted on selection');
    await evaluate(change('detail', '.9')); await evaluate(settle);
    assert.equal(await evaluate('requests.at(-1).values.detail'), .9);
  });
});

test('schema/selection conflicts and failed saves preserve intentions, retry is explicit', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    await evaluate(change('detail', '.7', 'input'));
    await evaluate(`snapshot.revision='c'.repeat(64);plugin.declaration.settings[0].max=.8;snapshot.plugins=[plugin]`);
    await evaluate(change('detail', '.7')); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 0);
    assert.match(await evaluate(`root.querySelector('[data-mesh-message]').textContent`), /Changed elsewhere/);
    await evaluate(`root.querySelector('[data-mesh-retry]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 1);
    await evaluate(`window.saveError=Object.assign(new Error('Wait for Hands preparation before saving'),{status:409})`);
    await evaluate(change('detail', '.75')); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 2, 'busy errors do not loop');
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').value`), '.75');
    await evaluate(`window.saveError=null;root.querySelector('[data-mesh-retry]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 3);
    await evaluate(change('detail', '.6', 'input'));
    await evaluate(`snapshot.revision='d'.repeat(64);snapshot.choice.selected=null`);
    await evaluate(change('detail', '.6')); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 3, 'a foreign selection must not be switched silently');
    await evaluate(`root.querySelector('[data-mesh-discard]').click()`); await evaluate(settle);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-selector]').value`), '');
  });
});

test('continuous number stepper, stale reads, invalid saved state and disposal remain safe', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    await evaluate(`(async()=>{component.dispose();delete plugin.declaration.settings[0].step;component=mountMesh(root,options);await new Promise(r=>setTimeout(r,0))})()`);
    await evaluate(`root.querySelector('[data-number-step="up"]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests[0].values.detail'), .61);
    await evaluate(`window.finishRead=null;window.loadGate=()=>new Promise(r=>finishRead=r);component.reload()`); await evaluate(settle);
    await evaluate(`component.refresh({...snapshot,revision:'z'.repeat(64),choice:{...snapshot.choice,selected:null}});window.loadGate=null;finishRead()`); await evaluate(settle);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-selector]').value`), '');
    await evaluate(`component.refresh({...snapshot,problem:'Invalid saved profile'})`);
    assert.equal(await evaluate(`root.querySelector('[data-mesh-selector]').disabled`), true);
    assert.match(await evaluate(`root.querySelector('[data-mesh-message]').textContent`), /Invalid saved profile/);
    await evaluate(`component.refresh(snapshot);window.release=null;window.saveGate=()=>new Promise(r=>release=r)`);
    await evaluate(change('detail', '.8')); await evaluate(settle);
    await evaluate(`component.dispose();window.saveGate=null;release()`); await evaluate(settle);
    assert.equal(await evaluate('root.children.length'), 0);
  });
});

test('bounded revision races retry, transport failures do not loop, and incomplete defaults are persisted', { skip, timeout: 30000 }, async () => {
  await withPostprocessing(async ({ evaluate }) => {
    // A retained selection without a settings record must not turn Reset into a no-op.
    await evaluate(`root.querySelector('[data-mesh-gear]').click();root.querySelector('[data-mesh-reset]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 1);
    assert.deepEqual(await evaluate(`snapshot.choice.settings['workspace:example/surface'].values`), { detail: .6, mode: 'full', smooth: true });
    await evaluate(`window.saveError=Object.assign(new Error('Hands profile changed; reload before saving'),{status:409})`);
    await evaluate(change('detail', '.8')); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 4, 'revision retry is bounded to three attempts');
    await evaluate(`window.saveError=new Error('Network disconnected');root.querySelector('[data-mesh-retry]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 5, 'transport failures wait for explicit retry');
    assert.equal(await evaluate(`root.querySelector('[data-mesh-field="detail"]').valueAsNumber`), .8);
    await evaluate(`window.saveError=null;root.querySelector('[data-mesh-retry]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 6);
    assert.equal(await evaluate('root.dataset.dirty'), 'false');
    await evaluate(`snapshot.revision='h'.repeat(64);snapshot.choice.settings['workspace:example/surface'].version=2;component.refresh(snapshot)`);
    await evaluate(change('smooth', false)); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 6, 'a saved schema mismatch cannot be silently migrated by a sibling edit');
    assert.match(await evaluate(`root.querySelector('[data-mesh-message]').textContent`), /schema changed/);
    await evaluate(`root.querySelector('[data-mesh-retry]').click()`); await evaluate(settle);
    assert.equal(await evaluate('requests.length'), 7, 'explicit review permits the current validated schema');
  });
});
