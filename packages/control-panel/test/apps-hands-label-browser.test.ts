import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('Apps Input shows Hands in option and summary, persists hand and retains its unavailable label', { skip: !process.env.XRB_TEST_BROWSER, timeout: 40000 }, async () => {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'apps-hands-label-')), core = path.join(root, 'core'), workspace = path.join(root, 'workspace');
  const dir = path.join(workspace, 'projects/unsorted/example'); await fs.mkdir(dir, { recursive: true }); await fs.mkdir(core);
  const file = path.join(dir, 'xrb-project.json');
  await fs.writeFile(file, JSON.stringify({ name: 'Example', kind: 'app', entry: 'dist', display: 'desktop', inputs: ['hand'] }));
  let available = true;
  const app = createServer({ repo: core, workspace, port: await freePort() });
  app.panel.nativeProviders = async () => ({ providers: [
    { name: 'desktop', role: 'display', builtin: true, path: null, version: '1', description: 'fixture' },
    ...(available ? [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'fixture' }] : []),
  ], error: null, rejected: [] });
  await new Promise<void>(resolve => app.server.listen(Number(new URL(app.url).port), '127.0.0.1', resolve));
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(app.url, `!!document.querySelector('#settings [name="inputs"]')`);
      const summary = () => evaluate(`document.querySelector('#settings [name="inputs"]').closest('.dropdown').querySelector('.dropdown-btn').textContent`);
      assert.equal(await summary(), 'Hands');
      await evaluate(`document.querySelector('#settings [name="inputs"]').closest('.dropdown').querySelector('.dropdown-btn').click()`);
      assert.equal(await evaluate(`[...document.querySelectorAll('[role="option"]')].some(e=>e.textContent.trim()==='Hands')`), true);
      await evaluate(`window.inputSaveStatus=null;const original=fetch;window.fetch=async(...args)=>{const response=await original(...args);if(args[1]?.method==='PUT'&&String(args[0]).endsWith('/manifest'))window.inputSaveStatus=response.status;return response;};document.querySelector('#settings [name="inputs"]').closest('.dropdown').querySelector('.dropdown-btn').click();const e=document.querySelector('#settings [name="inputs"]');e.value='["mouse","hand"]';e.dispatchEvent(new Event('change',{bubbles:true}));`);
      // Do not repeatedly open the Windows manifest while the atomic writer is renaming it.
      for (let i = 0; i < 100 && await evaluate('inputSaveStatus===null'); i++) await sleep(30);
      assert.equal(await evaluate('inputSaveStatus'), 200);
      const saved = JSON.parse(await fs.readFile(file, 'utf8'));
      assert.deepEqual(saved.inputs, ['mouse', 'hand']); assert.equal(await summary(), '2 selected', 'several choices are counted');
      available = false;
      await navigate(app.url, `document.querySelector('#settings [name="inputs"]')?.closest('.dropdown').querySelector('.dropdown-btn').textContent.includes('unavailable')`);
      assert.equal(await summary(), '2 selected · Hands (unavailable)', 'an unavailable choice stays named in the count');
      assert.equal(await evaluate(`JSON.parse(document.querySelector('#settings [name="inputs"]').value).includes('hand')`), true);
      assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).inputs, ['mouse', 'hand']);
    });
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
