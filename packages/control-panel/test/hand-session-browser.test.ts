import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { discoverHandProviders } from '../src/hand-providers.ts';
import { withBrowser, sleep } from './browser-fixture.ts';
const worker = process.env.XRB_TEST_PROVIDER_WORKER, helper = process.env.XRB_TEST_ACQUISITION_HELPER;
test('real supervised Synthetic session feeds SDK scene, observed fps, profile ACK and teardown in an isolated browser', { skip: !worker || !helper || !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const root = process.env.XRB_TEST_ROOT!; await fs.mkdir(root, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(root, 'hands-session-browser-')), port = await freePort();
  await fs.writeFile(path.join(workspace, 'xrb-plugins.json'), JSON.stringify({ disabled: ['input-hands'], settings: {} }));
  let saved = await readHandsState(REPO, workspace); saved = await saveHandsState(REPO, workspace, { owner: 'core', id: 'simulated' }, saved.revision);
  const seed = path.join(workspace, 'calibration-do-not-change.bin'); await fs.writeFile(seed, 'unrelated fixture bytes');
  const app = createServer({ repo: REPO, workspace, port });
  const inventory = async () => ({ providers: [{ role: 'input' as const, name: 'simulated', builtin: true, version: '1', description: 'existing Synthetic', path: null }], rejected: [], error: null });
  app.panel.nativeProviders = inventory;
  const deps = (app.panel.handSessions as any).deps;
  deps.testScope = randomBytes(32).toString('hex');
  deps.prepare = async (request: any) => {
    const state = await readHandsState(REPO, workspace), registry = await discoverHandProviders(REPO, workspace, inventory);
    assert.equal(request.provider.id, 'simulated'); assert.equal(request.revision, state.revision); assert.equal(request.registryRevision, registry.revision);
    return { workerExe: worker, helperExe: helper, runtimeName: 'simulated', config: { hands: 2, rateHz: 120 }, source: { owner: 'core', id: 'simulated', label: 'Synthetic', version: '1' }, profile: state.profile, revision: state.revision };
  };
  await new Promise<void>(r => app.server.listen(port, '127.0.0.1', r));
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(app.url + 'hands/', `document.querySelector('#hands-provider')?.options.length > 1 && document.body?.dataset.handsView === 'ready'`);
      await evaluate(`(async()=>{window.livePage = (await import('/hands.js')).handsPage;})()`);
      assert.equal(await evaluate('livePage.view.active'), false); assert.equal(app.panel.handSessions.busy, false);
      await evaluate(`livePage.session.start({provider:{owner:'core',id:'simulated'},revision:livePage.snapshot.revision,registryRevision:livePage.snapshot.registryRevision})`);
      for (let i = 0; i < 60 && !await evaluate('livePage.view.currentHands.length === 2'); i++) await sleep(50);
      assert.equal(await evaluate('livePage.view.currentHands.length'), 2);
      assert.equal((await (await fetch(app.url + 'api/hands')).json()).deliveryState, 'applied');
      await sleep(1100); assert.ok(Number(await evaluate(`document.querySelector('#hands-tracking-fps').textContent`)) > 0);
      const profile = await evaluate('livePage.view.profile'); profile.offsetMm.x = 15; profile.appearance.opacity = .7;
      await evaluate(`(async()=>{const d=await livePage.request('GET');return livePage.request('POST',{profile:${JSON.stringify(profile)},revision:d.revision},'/api/hands/apply')})()`);
      for (let i = 0; i < 60 && await evaluate('livePage.view.profile.offsetMm.x') !== 15; i++) await sleep(50);
      assert.equal(await evaluate('livePage.view.profile.offsetMm.x'), 15);
      assert.equal(await evaluate('livePage.view.profile.appearance.opacity'), .7);
      await evaluate('livePage.session.stop()');
      assert.equal(await evaluate('livePage.view.active'), false); assert.equal(await evaluate('livePage.view.currentHands.length'), 0);
      assert.equal(app.panel.handSessions.busy, false);
    });
    assert.equal(await fs.readFile(seed, 'utf8'), 'unrelated fixture bytes');
  } finally { await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});
