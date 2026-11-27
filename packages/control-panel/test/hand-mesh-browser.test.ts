import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('Hands post-processing autosaves independently through real profile APIs and disposes polling', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'mesh-ui-')), core = path.resolve(import.meta.dirname, '../../..'), workspace = path.join(root, 'user'), plugin = path.join(workspace, 'plugins/example');
  await fs.mkdir(plugin, { recursive: true });
  const manifest = path.join(plugin, 'xrb-plugin.json');
  await fs.writeFile(manifest, JSON.stringify({ title: 'Example mesh', type: 'plugin', version: '1.0.0', handMesh: { version: 1, id: 'surface', label: 'Example mesh', program: 'runtime.exe', settingsVersion: 1,
    settings: [{ key: 'quality', label: 'Quality', type: 'select', default: 'mid', options: [{ value: 'low', label: 'Low' }, { value: 'mid', label: 'Mid' }] },
      { key: 'iterations', label: 'Iterations', type: 'number', min: 1, max: 4, step: 1, default: 2 }, { key: 'normals', label: 'Normals', type: 'boolean', default: true }] } }));
  await fs.writeFile(path.join(plugin, 'runtime.exe'), 'not executed');
  await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  const initial = await fs.readFile(path.join(workspace, 'config/hands/profile.json'), 'utf8');
  const port = await freePort(), app = createServer({ repo: core, workspace, port });
  app.panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'fake' }], rejected: [], error: null });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['https://*'] });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.meshReads=0;window.meshWrites=0;const originalFetch=window.fetch;window.fetch=(...args)=>{if(String(args[0]).includes('/api/hands/postprocessing')){meshReads++;if(args[1]?.method==='PUT')meshWrites++}return originalFetch(...args)};window.captureCalls=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{captureCalls++;throw Error('forbidden')};if(navigator.xr)navigator.xr.requestSession=()=>{captureCalls++;throw Error('forbidden')};` });
      await navigate(`http://127.0.0.1:${port}/hands/`, `document.querySelector('[data-field="sizeFactor"]')?.value==='1' && document.querySelector('[data-mesh-selector]')?.options.length===2`);
      assert.equal(await evaluate(`document.querySelectorAll('[data-mesh-selector]').length`), 1);
      assert.equal(await evaluate(`document.querySelector('#hands-form').contains(document.querySelector('[data-mesh-selector]'))`), false);
      assert.equal(await evaluate(`document.querySelector('#hands-view-error').hidden`), true);
      assert.equal(await fs.readFile(path.join(workspace, 'config/hands/profile.json'), 'utf8'), initial);
      await evaluate(`const size=document.querySelector('[data-field="sizeFactor"]');size.value='.9';size.dispatchEvent(new Event('input',{bubbles:true}));`);
      const wait = async (expression: string) => {
        for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await sleep(20); }
        assert.fail(`Not settled: ${expression}; ${await evaluate(`document.querySelector('[data-mesh-message]').textContent`)}`);
      };
      const choose = async (value: string) => {
        await evaluate(`(()=>{const e=document.querySelector('[data-mesh-selector]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await wait(`document.querySelector('#hands-postprocessing-root').dataset.saving==='false' && document.querySelector('#hands-postprocessing-root').dataset.dirty==='false'`);
      };
      await choose('workspace:example/surface');
      assert.equal(await evaluate(`document.querySelectorAll('[data-mesh-field]').length`), 3);
      await evaluate(`const quality=document.querySelector('[data-mesh-field="quality"]');quality.value='low';quality.dispatchEvent(new Event('change',{bubbles:true}));const n=document.querySelector('[data-mesh-field="iterations"]');n.value='4';n.dispatchEvent(new Event('input',{bubbles:true}));const normals=document.querySelector('[data-mesh-field="normals"]');normals.checked=false;normals.dispatchEvent(new Event('change',{bubbles:true}));`);
      await wait(`document.querySelector('#hands-postprocessing-root').dataset.saving==='false'`);
      let state = await readHandsState(core, workspace);
      assert.deepEqual(state.provider, { owner: 'core', id: 'simulated' }); assert.equal(state.profile.sizeFactor, 1);
      assert.deepEqual((state.raw.postprocessing as any).settings['workspace:example/surface'].values, { quality: 'low', iterations: 2, normals: false });
      assert.equal(await evaluate(`document.querySelector('[data-mesh-field="iterations"]').value`), '4', 'unfinished plugin number survived another commit');
      await evaluate(`document.querySelector('[data-mesh-field="iterations"]').dispatchEvent(new Event('change',{bubbles:true}))`);
      await wait(`document.querySelector('#hands-postprocessing-root').dataset.dirty==='false'`);
      assert.equal(await evaluate(`document.querySelector('[data-field="sizeFactor"]').valueAsNumber`), .9);
      assert.equal(await evaluate(`document.querySelector('[data-mesh-save],[data-mesh-reload]')!==null`), false);
      assert.equal(await evaluate(`document.querySelector('[data-mesh-message]').textContent`), '');
      await choose(''); state = await readHandsState(core, workspace);
      assert.equal((state.raw.postprocessing as any).selected, null);
      assert.equal((state.raw.postprocessing as any).settings['workspace:example/surface'].values.iterations, 4);
      // A foreign source write is unrelated and must be safely incorporated rather than overwritten.
      await saveHandsState(core, workspace, null, state.revision);
      await choose('workspace:example/surface');
      assert.equal((await readHandsState(core, workspace)).provider, null);
      await fs.unlink(manifest);
      await wait(`document.querySelector('#hands-postprocessing-root').hidden`);
      assert.equal((await readHandsState(core, workspace)).raw.postprocessing && (await readHandsState(core, workspace)).provider, null);
      assert.equal(await evaluate('captureCalls'), 0); assert.equal(app.panel.runner.state().phase, 'idle');
      await evaluate(`dispatchEvent(new Event('pagehide'))`);
      const stopped = await evaluate('meshReads'); await sleep(1100);
      assert.equal(await evaluate('meshReads'), stopped);
    });
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
