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
  // Two metadata-only workspace trackers: the picker lists installed workspace providers, not built-in sources.
  for (const id of ['alpha', 'beta']) {
    const plugin = path.join(workspace, 'plugins', id); await fs.mkdir(plugin, { recursive: true });
    await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: `Tracker ${id}`, type: 'input', version: '1.0.0', handProviders: [{ version: 1, id, runtimeName: `tracker-${id}`, transport: 'native', purpose: 'tracked' }] }));
  }
  await saveHandsState(core, workspace, { owner: 'workspace:alpha', id: 'alpha' }, (await readHandsState(core, workspace)).revision);
  const app = createServer({ repo: core, workspace, port });
  app.panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'metadata only' }, ...['alpha', 'beta'].map(id => ({ name: `tracker-${id}`, role: 'input' as const, builtin: false, path: path.join(workspace, 'plugins', id, 'bin', `${id}.dll`), version: '1', description: 'metadata only' }))], error: null, rejected: [] });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.captureCalls=0;window.sourceWrites=0;window.failSource=false;const original=fetch;window.fetch=async(url,options)=>{if(url==='/api/hands'&&options?.method==='PUT'){sourceWrites++;if(failSource)throw Error('Offline');}const response=await original(url,options);if(url==='/api/hands'&&options?.method==='GET'&&window.pauseRead){window.pauseRead=false;await new Promise(resolve=>window.releaseRead=resolve);}return response;};if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{captureCalls++;throw Error('forbidden')};` });
      await navigate(`http://127.0.0.1:${port}/hands/`, `document.querySelector('#hands-provider')?.value==='workspace:alpha/alpha'`);
      assert.equal(await evaluate(`document.querySelector('#hands-postprocessing-root').hidden`), true);
      assert.equal(await evaluate(`!!document.querySelector('[id^="hands-record"],#hands-save,#hands-reload,#hands-availability,#hands-session-status')`), false);
      const choose = (value: string) => evaluate(`(()=>{const e=document.querySelector('#hands-provider');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await choose('workspace:beta/beta');
      await until(evaluate, `!document.querySelector('#hands-provider').disabled && sourceWrites===1`);
      assert.deepEqual((await readHandsState(core, workspace)).provider, { owner: 'workspace:beta', id: 'beta' });
      assert.equal(await evaluate(`document.querySelector('#hands-message').hidden`), true);
      await evaluate('failSource=true'); await choose('workspace:alpha/alpha');
      await until(evaluate, `!document.querySelector('#hands-source-recovery').hidden`);
      assert.equal(await evaluate(`document.querySelector('#hands-provider').value`), 'workspace:alpha/alpha');
      assert.equal((await readHandsState(core, workspace)).provider?.id, 'beta');
      await evaluate(`failSource=false;document.querySelector('#hands-source-retry').click()`);
      await until(evaluate, `document.querySelector('#hands-message').hidden && !document.querySelector('#hands-provider').disabled`);
      assert.equal((await readHandsState(core, workspace)).provider?.id, 'alpha');
      await evaluate('window.pauseRead=true'); await choose('workspace:beta/beta');
      await until(evaluate, `!!window.releaseRead`);
      let state = await readHandsState(core, workspace);
      await saveHandsState(core, workspace, null, state.revision);
      await evaluate('window.releaseRead()');
      await until(evaluate, `!document.querySelector('#hands-source-discard').hidden`);
      assert.equal((await readHandsState(core, workspace)).provider, null, 'a concurrent source choice is never overwritten');
      assert.equal(await evaluate(`document.querySelector('#hands-provider').value`), 'workspace:beta/beta', 'the failed intention remains visible');
      assert.match(await evaluate(`document.querySelector('#hands-message').textContent`), /Saved: No provider/);
      await evaluate(`document.querySelector('#hands-source-discard').click()`);
      await until(evaluate, `document.querySelector('#hands-provider').value===''`);
      state = await readHandsState(core, workspace);
      await saveHandsState(core, workspace, { owner: 'workspace:missing', id: 'absent' }, state.revision);
      await until(evaluate, `document.querySelector('#hands-provider').value==='workspace:missing/absent'`);
      assert.match(await evaluate(`document.querySelector('#hands-provider').selectedOptions[0].textContent`), /missing/);
      assert.equal(await evaluate('captureCalls'), 0);
      assert.equal(app.panel.runner.state().phase, 'idle');
    });
  } finally { await app.close(); await fs.rm(workspace, { recursive: true, force: true }); }
});
