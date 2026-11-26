import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { saveHandsState, readHandsState } from '../src/hands-state.ts';
import { LiveHands } from '../src/hands-live.ts';
import { handProfile } from '../../sdk/src/hand-profile.ts';
import { MSG_HAND_PROFILE_ACK, MSG_SET_HAND_PROFILE, decodeProfileControl, encodeProfileControl } from '../../sdk/src/hand-profile-control.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

async function fixture() {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hands-ordering-'));
  const core = path.resolve(import.meta.dirname, '../../..'), workspace = path.join(root, 'workspace');
  const state = await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  const port = await freePort(), app = createServer({ repo: core, workspace, port }), panel = app.panel as any;
  panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'fake metadata only' }], error: null, rejected: [] });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${port}`;
  const get = () => fetch(base + '/api/hands').then(r => r.json());
  const apply = async (x: number) => { const current = await get(); return fetch(base + '/api/hands/apply', { method: 'POST', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ revision: current.revision, profile: { offsetMm: { x } } }) }); };
  return { core, workspace, panel, app, base, state, get, apply, close: async () => { await app.close(); await fs.rm(root, { recursive: true, force: true }); } };
}
async function until(evaluate: (expression: string) => Promise<any>, expression: string) {
  for (let i = 0; i < 240; i++) { if (await evaluate(expression)) return; await sleep(25); }
  assert.fail(expression);
}
const commitX = (x: number) => `(()=>{const e=document.querySelector('[data-field="offsetMm.x"]');e.value='${x}';e.dispatchEvent(new Event('change',{bubbles:true}));})()`;
const settled = `document.querySelector('#hands-adjustments-root').dataset.dirty==='false' && document.querySelector('#hands-adjustments-root').dataset.saving==='false'`;
class AckSocket {
  binaryType = ''; onopen: any; onmessage: any; onerror: any; onclose: any;
  constructor(_url: string) { queueMicrotask(() => this.onopen?.()); }
  send(data: ArrayBuffer) { const ack = decodeProfileControl(data, MSG_SET_HAND_PROFILE); queueMicrotask(() => this.onmessage?.({ data: encodeProfileControl(MSG_HAND_PROFILE_ACK, ack) })); }
  close() {}
}

test('own notifications before/after autosave preserve quiet success and failed-delivery retry', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  for (const ordering of ['before', 'after']) for (const delivery of ['failed', 'applied', 'old-native-bundle']) await t.test(`${ordering} response, ${delivery} delivery`, async () => {
    const f = await fixture();
    f.panel.liveHands = new LiveHands(handProfile(), f.state.revision); f.panel.nativeHandPolicy = 'native'; f.panel.runner.s.phase = 'running';
    class NoAckSocket extends AckSocket { send(_data: ArrayBuffer) {} }
    f.panel.nativeHandSocket = delivery === 'old-native-bundle' ? NoAckSocket : AckSocket; f.panel.runner.s.channelUrl = delivery === 'failed' ? null : 'ws://fixture/?token=owned';
    try {
      await withBrowser(async ({ send, navigate, evaluate }) => {
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.ownNotices=0;const ES=window.EventSource;window.EventSource=class extends ES{addEventListener(type,listener,options){return super.addEventListener(type,type==='hands-changed'?e=>setTimeout(()=>{listener(e);window.ownNotices++;},300):listener,options)}};${ordering === 'before' ? `const original=fetch;window.fetch=async(...args)=>{const r=await original(...args);if(args[0]==='/api/hands/apply')await new Promise(resolve=>setTimeout(resolve,650));return r;};` : ''}` });
        await navigate(f.base + '/hands/', `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
        await evaluate(commitX(25)); await until(evaluate, `window.ownNotices>0 && (${settled})`);
        assert.equal((await f.get()).profile.offsetMm.x, 25);
        assert.equal(await evaluate(`!!document.querySelector('[data-action="apply"],[data-action="reload"]')`), false);
        assert.equal(await evaluate(`document.querySelector('[data-recovery]').hidden`), delivery === 'applied');
        if (delivery !== 'applied') assert.match(await evaluate(`document.querySelector('[data-status]').textContent`), /Couldn't apply.*Retry/);
        await evaluate(commitX(26)); await until(evaluate, settled);
        assert.equal((await f.get()).profile.offsetMm.x, 26, 'a new commit never needs Reload after an own notification');
      });
    } finally { await f.close(); }
  });
});

test('browser delivery without a consumer times out, matches late ACK and retires deadlines', { timeout: 15000 }, async () => {
  const f = await fixture(), session = 'browser-session-12345678', token = 'browser-token-1234567890';
  f.panel.liveHands = new LiveHands(handProfile(), f.state.revision, session); f.panel.nativeHandPolicy = null; f.panel.runner.s.phase = 'running';
  f.panel.previewProjection = { token, session, route: '/preview/fake/', projectId: 'fake', handPolicy: 'webxr' };
  try {
    assert.equal((await f.apply(30)).status, 200); const applied = f.panel.liveHands.envelope;
    assert.equal((await f.get()).deliveryState, 'pending');
    await sleep(3300); const failed = await f.get();
    assert.equal(failed.deliveryState, 'failed'); assert.match(failed.delivery, /acknowledged.*Retry Apply.*rebuild\/relaunch/i);
    const ack = new URL('/api/preview/hands', f.base);
    for (const [k, v] of Object.entries({ token, session, route: '/preview/fake/', project: 'fake', ack: String(applied.sequence), revision: applied.revision })) ack.searchParams.set(k, v);
    const wrong = new URL(ack); wrong.searchParams.set('ack', '0'); await fetch(wrong);
    assert.equal((await f.get()).deliveryState, 'failed');
    const wrongRevision = new URL(ack); wrongRevision.searchParams.set('revision', '0'.repeat(64)); await fetch(wrongRevision);
    assert.equal((await f.get()).deliveryState, 'failed');
    assert.equal((await fetch(ack)).status, 200); assert.equal((await f.get()).deliveryState, 'applied');
    assert.equal((await f.apply(31)).status, 200); const old = f.panel.liveHands;
    await f.panel.runner.stop(); assert.equal(f.panel.liveHands, null);
    assert.equal((await f.get()).deliveryState, 'saved'); assert.equal((await fetch(ack)).status, 404);
    await sleep(3300); assert.equal(old.deliveryState, 'pending');
    const replaced = new LiveHands(handProfile(), applied.revision); f.panel.setLiveHands(replaced);
    f.panel.setLiveHands(new LiveHands(handProfile(), applied.revision));
    await sleep(3300); assert.equal(replaced.deliveryState, 'pending');
  } finally { await f.close(); }
});

test('foreign edits during delayed responses refresh clean controls but an older-hash reversion conflicts with unfinished input', { skip: !process.env.XRB_TEST_BROWSER, timeout: 25000 }, async () => {
  const f = await fixture();
  try {
    await withBrowser(async ({ send, navigate, evaluate }) => {
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `const original=fetch;window.fetch=async(...args)=>{const r=await original(...args);if(args[0]==='/api/hands/apply')await new Promise(resolve=>setTimeout(resolve,600));return r;};` });
      await navigate(f.base + '/hands/', `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      await evaluate(commitX(25));
      for (let i = 0; i < 100 && (await f.get()).profile.offsetMm.x !== 25; i++) await sleep(10);
      const ownRevision = (await f.get()).revision;
      assert.equal((await f.apply(70)).status, 200);
      await until(evaluate, `(${settled}) && document.querySelector('[data-field="offsetMm.x"]').value==='70'`);
      await evaluate(`(()=>{const x=document.querySelector('[data-field="offsetMm.x"]');x.value='71';x.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      const reverted = await f.apply(25); assert.equal(reverted.status, 200);
      assert.equal((await reverted.json()).revision, ownRevision, 'the other client restored an incorporated own hash');
      await sleep(1100); assert.equal(await evaluate(`document.querySelector('[data-field="offsetMm.x"]').value`), '71');
      await evaluate(commitX(71));
      await until(evaluate, `!document.querySelector('[data-action="discard"]').hidden`);
      assert.match(await evaluate(`document.querySelector('[data-status]').textContent`), /Saved X \(mm\): 25/);
      assert.equal((await f.get()).profile.offsetMm.x, 25);
      await evaluate(`document.querySelector('[data-action="discard"]').click()`); await until(evaluate, settled);
      assert.equal(await evaluate(`document.querySelector('[data-field="offsetMm.x"]').value`), '25');
    });
  } finally { await f.close(); }
});

test('old browser bundle exposes unchanged retry and late acknowledgement recovers quietly', { skip: !process.env.XRB_TEST_BROWSER, timeout: 20000 }, async () => {
  const f = await fixture(), session = 'browser-session-12345678', token = 'browser-token-1234567890';
  f.panel.setLiveHands(new LiveHands(handProfile(), f.state.revision, session)); f.panel.nativeHandPolicy = null; f.panel.runner.s.phase = 'running';
  f.panel.previewProjection = { token, session, route: '/preview/fake/', projectId: 'fake', handPolicy: 'webxr' };
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(f.base + '/hands/', `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      await evaluate(commitX(25)); await until(evaluate, settled);
      assert.equal((await f.get()).deliveryState, 'pending');
      await until(evaluate, `!document.querySelector('[data-recovery]').hidden`);
      assert.match(await evaluate(`document.querySelector('[data-status]').textContent`), /Retry or rebuild\/relaunch/);
      const saved = (await f.get()).profile;
      await evaluate(`document.querySelector('[data-action="retry"]').click()`);
      await until(evaluate, `document.querySelector('[data-recovery]').hidden && (${settled})`);
      const e = f.panel.liveHands.envelope, ack = new URL('/api/preview/hands', f.base);
      for (const [k, v] of Object.entries({ token, session, route: '/preview/fake/', project: 'fake', ack: String(e.sequence), revision: e.revision })) ack.searchParams.set(k, v);
      assert.equal((await fetch(ack)).status, 200); await sleep(1100);
      assert.equal(await evaluate(`document.querySelector('[data-recovery]').hidden`), true);
      assert.deepEqual((await f.get()).profile, saved);
    });
  } finally { await f.close(); }
});

test('an old delivery poll cannot overwrite a newer retry at the same saved revision', { skip: !process.env.XRB_TEST_BROWSER, timeout: 15000 }, async () => {
  const f = await fixture();
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(f.base + '/hands/', `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      await evaluate(`(async()=>{
        const {mountHandAdjustments}=await import('/hands-adjustments.js');
        const data=await fetch('/api/hands').then(r=>r.json());data.deliveryState='failed';
        const root=document.createElement('div');root.id='poll-audit';document.body.append(root);
        const controls=mountHandAdjustments(root,{load:async()=>data,apply:async()=>({...data,deliveryState:'pending'})});
        controls.refresh(data);window.pollAudit={controls,revision:data.revision,oldEpoch:controls.deliveryEpoch};
        root.querySelector('[data-action="retry"]').click();
      })()`);
      await until(evaluate, `document.querySelector('#poll-audit [data-recovery]').hidden && document.querySelector('#poll-audit').dataset.saving==='false'`);
      await evaluate(`pollAudit.controls.updateDelivery('failed','failed',pollAudit.revision,pollAudit.oldEpoch)`);
      assert.equal(await evaluate(`document.querySelector('#poll-audit [data-recovery]').hidden`), true);
      await evaluate(`pollAudit.controls.updateDelivery('failed','failed',pollAudit.revision,pollAudit.controls.deliveryEpoch)`);
      assert.equal(await evaluate(`document.querySelector('#poll-audit [data-recovery]').hidden`), false);
      await evaluate(`pollAudit.controls.updateDelivery('Applied','applied',pollAudit.revision,pollAudit.controls.deliveryEpoch)`);
      assert.equal(await evaluate(`document.querySelector('#poll-audit [data-recovery]').hidden`), true);
      await evaluate(`pollAudit.controls.dispose();document.querySelector('#poll-audit').remove()`);
    });
  } finally { await f.close(); }
});
