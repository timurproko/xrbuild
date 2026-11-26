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
  const core = path.resolve(import.meta.dirname, '../../..'), workspace = path.join(root, 'workspace');
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
const editX = `(()=>{const x=document.querySelector('[data-field="offsetMm.x"]');x.value='25';x.dispatchEvent(new Event('change',{bubbles:true}));})()`;

test('clean source refresh and a committed adjustment preserve another client selection without Reload', { skip: !process.env.XRB_TEST_BROWSER, timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(f.base + '/hands/', `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      const snapshot = await fetch(f.base + '/api/hands').then(r => r.json());
      const changed = await fetch(f.base + '/api/hands', { method: 'PUT', headers: { Origin: f.base, 'content-type': 'application/json' }, body: JSON.stringify({ provider: { owner: 'core', id: 'webxr' }, revision: snapshot.revision, registryRevision: snapshot.registryRevision }) });
      assert.equal(changed.status, 200);
      await waitFor(evaluate, `document.querySelector('#hands-provider').value==='core/webxr'`);
      assert.equal(await evaluate(`!!document.querySelector('#hands-reload,[data-action="reload"]')`), false);
      await evaluate(editX);
      await waitFor(evaluate, `document.querySelector('#hands-adjustments-root').dataset.dirty==='false'`);
      assert.equal((await readHandsState(f.core, f.workspace)).profile.offsetMm.x, 25);
      assert.equal(await evaluate(`document.querySelector('#hands-provider').value`), 'core/webxr');
      assert.deepEqual((await readHandsState(f.core, f.workspace)).provider, { owner: 'core', id: 'webxr' }, 'an adjustment never overwrites the source');
    });
  } finally { await f.close(); }
});

test('failed native delivery offers Retry for unchanged persisted values and succeeds after connectivity returns', { skip: !process.env.XRB_TEST_BROWSER, timeout: 30000 }, async () => {
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
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await navigate(f.base + '/hands/', `document.querySelector('[data-field="sizeFactor"]')?.value==='1'`);
      await evaluate(editX);
      await waitFor(evaluate, `/Couldn't apply/.test(document.querySelector('[data-status]').textContent)`);
      if (process.env.XRB_PROOF_DIR) {
        await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
        await fs.mkdir(process.env.XRB_PROOF_DIR, { recursive: true });
        const picture = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(path.join(process.env.XRB_PROOF_DIR, 'hands-delivery-error.png'), Buffer.from(picture.data, 'base64'));
      }
      const saved = await readHandsState(f.core, f.workspace); assert.equal(saved.profile.offsetMm.x, 25);
      assert.equal(await evaluate(`document.querySelector('#hands-adjustments-root').dataset.dirty`), 'false', 'persistence succeeded, so there is no unsaved edit');
      assert.equal(await evaluate(`document.querySelector('[data-action="retry"]').disabled`), false, 'the advertised retry must work without manufacturing an edit');
      assert.equal(await evaluate(`document.querySelector('[data-action="retry"]').textContent`), 'Retry');
      panel.nativeHandSocket = Socket; panel.runner.s.channelUrl = 'ws://fixture/?token=owned';
      await evaluate(`document.querySelector('[data-action="retry"]').click()`);
      await waitFor(evaluate, `document.querySelector('[data-recovery]').hidden && document.querySelector('#hands-adjustments-root').dataset.saving==='false'`);
      assert.equal(sends, 1); assert.deepEqual((await readHandsState(f.core, f.workspace)).profile, saved.profile);
      assert.equal(await evaluate(`document.querySelector('[data-recovery]').hidden`), true);
    });
  } finally { await f.close(); }
});
