import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

async function until(evaluate: (s: string) => Promise<any>, expression: string) {
  for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await sleep(30); }
  assert.fail(expression);
}
// Fake provider metadata only; no device or native host is started.
test('provider autosaves quietly, preserves failed choices, refreshes missing choices and hides empty tools', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(parent, 'hands-picker-')), core = path.resolve(import.meta.dirname, '../../..'), port = await freePort();
  await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  const app = createServer({ repo: core, workspace, port });
  app.panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'metadata only' }], error: null, rejected: [] });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.captureCalls=0;window.sourceWrites=0;window.failSource=false;const original=fetch;window.fetch=(url,options)=>{if(url==='/api/hands'&&options?.method==='PUT'){sourceWrites++;if(failSource)return Promise.reject(Error('Offline'));}return original(url,options)};if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{captureCalls++;throw Error('forbidden')};` });
      await navigate(`http://127.0.0.1:${port}/hands/`, `document.querySelector('#hands-provider')?.value==='core/simulated'`);
      assert.equal(await evaluate(`document.querySelector('#hands-postprocessing-root').hidden`), true);
      assert.equal(await evaluate(`!!document.querySelector('[id^="hands-record"],#hands-save,#hands-reload,#hands-availability,#hands-session-status')`), false);
      const choose = (value: string) => evaluate(`(()=>{const e=document.querySelector('#hands-provider');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await choose('core/webxr');
      await until(evaluate, `!document.querySelector('#hands-provider').disabled && sourceWrites===1`);
      assert.deepEqual((await readHandsState(core, workspace)).provider, { owner: 'core', id: 'webxr' });
      assert.equal(await evaluate(`document.querySelector('#hands-message').hidden`), true);
      await evaluate('failSource=true'); await choose('core/simulated');
      await until(evaluate, `!document.querySelector('#hands-source-recovery').hidden`);
      assert.equal(await evaluate(`document.querySelector('#hands-provider').value`), 'core/simulated');
      assert.equal((await readHandsState(core, workspace)).provider?.id, 'webxr');
      await evaluate(`failSource=false;document.querySelector('#hands-source-retry').click()`);
      await until(evaluate, `document.querySelector('#hands-message').hidden && !document.querySelector('#hands-provider').disabled`);
      assert.equal((await readHandsState(core, workspace)).provider?.id, 'simulated');
      const state = await readHandsState(core, workspace);
      await saveHandsState(core, workspace, { owner: 'workspace:missing', id: 'absent' }, state.revision);
      await until(evaluate, `document.querySelector('#hands-provider').value==='workspace:missing/absent'`);
      assert.match(await evaluate(`document.querySelector('#hands-provider').selectedOptions[0].textContent`), /missing/);
      assert.equal(await evaluate('captureCalls'), 0);
      assert.equal(app.panel.runner.state().phase, 'idle');
    });
  } finally { await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});
