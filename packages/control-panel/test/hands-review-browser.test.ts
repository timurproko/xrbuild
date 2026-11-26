import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
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
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hands-review-ui-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace'); await fs.mkdir(core);
  const state = await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  const port = await freePort(), app = createServer({ repo: core, workspace, port });
  app.panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'fake metadata only' }], error: null, rejected: [] });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${port}`;
  return { app, core, workspace, state, base, close: async () => { await app.close(); await fs.rm(root, { recursive: true, force: true }); } };
}
async function waitFor(evaluate: (expression: string) => Promise<any>, expression: string) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(30); }
  assert.fail(`UI condition not met: ${expression}`);
}
const editX = `(()=>{const x=document.querySelector('[data-field="offsetMm.x"]');x.value='25';x.dispatchEvent(new Event('input',{bubbles:true}));})()`;

test('adjustment-only reload and Apply cannot rebase an outdated source picker after another client saves', { skip: !process.env.XRB_TEST_BROWSER, timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(f.base + '/hands/', `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      const snapshot = await fetch(f.base + '/api/hands').then(r => r.json());
      const changed = await fetch(f.base + '/api/hands', { method: 'PUT', headers: { Origin: f.base, 'content-type': 'application/json' }, body: JSON.stringify({ provider: { owner: 'core', id: 'webxr' }, revision: snapshot.revision, registryRevision: snapshot.registryRevision }) });
      assert.equal(changed.status, 200);
      await waitFor(evaluate, `!document.querySelector('[data-action="reload"]').hidden`);
      await evaluate(`document.querySelector('[data-action="reload"]').click()`);
      await waitFor(evaluate, `document.querySelector('[data-action="reload"]').hidden`);
      assert.equal(await evaluate(`document.querySelector('#hands-provider').value`), 'core/simulated');
      await evaluate(editX); await evaluate(`document.querySelector('[data-action="apply"]').click()`);
      await waitFor(evaluate, `document.querySelector('#hands-adjustments-root').dataset.dirty==='false'`);
      assert.equal((await readHandsState(f.core, f.workspace)).profile.offsetMm.x, 25);
      await evaluate(`(()=>{const original=window.fetch;window.fetch=async (...args)=>{const response=await original(...args);if(args[0]==='/api/hands'&&args[1]?.method==='PUT')window.sourceSaveStatus=response.status;return response;};document.querySelector('#hands-save').click();})()`);
      await waitFor(evaluate, `window.sourceSaveStatus!==undefined`);
      assert.equal(await evaluate('window.sourceSaveStatus'), 409);
      await waitFor(evaluate, `/changed.*reload|reload.*selection/i.test(document.querySelector('#hands-message').textContent)`);
      assert.deepEqual((await readHandsState(f.core, f.workspace)).provider, { owner: 'core', id: 'webxr' }, 'an unrelated Apply must not authorize the stale Synthetic picker');
    });
  } finally { await f.close(); }
});

test('failed native delivery offers Retry Apply for unchanged persisted values and succeeds after connectivity returns', { skip: !process.env.XRB_TEST_BROWSER, timeout: 30000 }, async () => {
  const f = await fixture(), panel = f.app.panel as any;
  panel.liveHands = new LiveHands(handProfile(), f.state.revision); panel.nativeHandPolicy = 'native';
  panel.runner.s.phase = 'running'; panel.runner.s.channelUrl = null;
  let sends = 0;
  class Socket {
    binaryType = ''; onopen: any; onmessage: any; onerror: any; onclose: any;
    constructor(_url: string) { queueMicrotask(() => this.onopen?.()); }
    send(data: ArrayBuffer) { sends++; const e = decodeProfileControl(data, MSG_SET_HAND_PROFILE); queueMicrotask(() => this.onmessage?.({ data: encodeProfileControl(MSG_HAND_PROFILE_ACK, e) })); }
    close() {}
  }
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(f.base + '/hands/', `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      await evaluate(editX); await evaluate(`document.querySelector('[data-action="apply"]').click()`);
      await waitFor(evaluate, `/channel is unavailable/.test(document.querySelector('[data-status]').textContent)`);
      const saved = await readHandsState(f.core, f.workspace); assert.equal(saved.profile.offsetMm.x, 25);
      assert.equal(await evaluate(`document.querySelector('#hands-adjustments-root').dataset.dirty`), 'false', 'persistence succeeded, so there is no unsaved edit');
      assert.equal(await evaluate(`document.querySelector('[data-action="apply"]').disabled`), false, 'the advertised retry must work without manufacturing an edit');
      assert.equal(await evaluate(`document.querySelector('[data-action="apply"]').textContent`), 'Retry Apply');
      panel.nativeHandSocket = Socket; panel.runner.s.channelUrl = 'ws://fixture/?token=owned';
      await evaluate(`document.querySelector('[data-action="apply"]').click()`);
      await waitFor(evaluate, `document.querySelector('[data-status]').textContent==='Applied'`);
      assert.equal(sends, 1); assert.deepEqual((await readHandsState(f.core, f.workspace)).profile, saved.profile);
      assert.equal(await evaluate(`document.querySelector('[data-action="apply"]').disabled`), true);
    });
  } finally { await f.close(); }
});
