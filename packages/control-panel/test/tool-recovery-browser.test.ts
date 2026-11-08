import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { resolvePluginCatalog } from '../src/extension-catalog.ts';
import { withBrowser } from './browser-fixture.ts';

const parent = path.resolve(import.meta.dirname, '../../../.artifacts');
const browserOnly = { skip: !process.env.XRB_TEST_BROWSER, timeout: 45_000 };

test('browser returns from changed source/old route through one non-modal idle restart', browserOnly, async () => {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'recovery-browser-')), workspace = path.join(root, 'workspace');
  await fs.mkdir(path.join(workspace, 'tools'), { recursive: true });
  const catalog = await resolvePluginCatalog(workspace, REPO, true);
  await fs.writeFile(path.join(workspace, 'xrb-plugins.json'), JSON.stringify({ disabled: catalog.plugins.filter(plugin => plugin.origin === 'bundled').map(plugin => plugin.key) }));
  const module = path.join(workspace, 'tools', 'fixture.mjs'), declaration = path.join(workspace, 'xrb-tools.json');
  const source = (version: string) => `export function createWorkspaceTool(){return{handle(req,res){res.setHeader('content-type','text/html');res.end('<h1 id="fixture-ready">${version}</h1>')},async close(){await new Promise(resolve=>setTimeout(resolve,100))}}}`;
  const tools = (route: string) => JSON.stringify({ tools: [{ id: 'fixture', label: 'Fixture', route, module: 'tools/fixture.mjs' }] });
  await fs.writeFile(module, source('original')); await fs.writeFile(declaration, tools('/fixture/'));
  const port = await freePort(), original = createServer({ workspace, port }), base = `http://127.0.0.1:${port}`;
  let replacement: ReturnType<typeof createServer> | undefined, restartError: unknown, restarts = 0;
  await original.panel.loadInitialServices(); original.server.listen(port, '127.0.0.1'); await once(original.server, 'listening');
  original.panel.onRestart = () => { restarts++; void (async () => {
    await original.close(); replacement = createServer({ workspace, port });
    await replacement.panel.loadInitialServices(); replacement.server.listen(port, '127.0.0.1'); await once(replacement.server, 'listening');
  })().catch(error => { restartError = error; }); };
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(base + '/fixture/', `document.querySelector('#fixture-ready')?.textContent==='original'`);
      await evaluate(`window.events=new EventSource('/api/events')`);
      await fs.writeFile(module, source('replacement-source')); await fs.utimes(module, new Date(), new Date(Date.now() + 1_000));
      await fs.writeFile(declaration, tools('/updated/'));
      await fetch(base + '/api/navigation');
      const redirected = await fetch(base + '/fixture/', { redirect: 'manual' });
      assert.equal(redirected.status, 303); assert.equal(redirected.headers.get('location'), '/tool-recovery.html?tool=fixture');
      const embedded = await evaluate(`new Promise(resolve=>{const frame=document.createElement('iframe');frame.src='/tool-recovery.html?tool=fixture';frame.onload=()=>setTimeout(()=>{const text=frame.contentDocument.querySelector('#tool-recovery-status')?.textContent;frame.remove();resolve(text)},300);document.body.append(frame)})`);
      assert.match(embedded, /Open this tool directly from Apps/); assert.equal(restarts, 0, 'embedding a recovery URL cannot trigger an automatic restart');
      await navigate(base + '/fixture/', `document.querySelector('#fixture-ready')?.textContent==='replacement-source'`);
      assert.equal(await evaluate('location.pathname'), '/updated/');
      assert.equal(await evaluate(`!!document.querySelector('dialog,.tool-start-card,#tool-start-retry')`), false);
      assert.equal(restartError, undefined); assert.equal(restarts, 1); assert.ok(replacement);
      assert.notEqual(replacement.panel.instanceId, original.panel.instanceId);
      assert.equal(replacement.panel.runner.state().phase, 'idle'); assert.equal(replacement.panel.jobs.active().length, 0);
    });
  } finally { await original.close(); await replacement?.close(); await fs.rm(root, { recursive: true, force: true }); }
});

test('Apps sidebar embedded labels and inset focus rings fit rows and section boundaries', browserOnly, async () => {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'sidebar-origin-browser-')), core = path.join(root, 'core'), workspace = path.join(root, 'workspace');
  for (const [directory, name] of [[path.join(core, 'embedded/projects/core/fixture'), 'Embedded fixture'], [path.join(workspace, 'projects/unsorted/hello'), 'Hello fixture']]) {
    await fs.mkdir(path.join(directory, 'dist'), { recursive: true });
    await fs.writeFile(path.join(directory, 'xrb-project.json'), JSON.stringify({ name, kind: 'app', entry: 'dist', display: 'desktop', inputs: [] }));
    await fs.writeFile(path.join(directory, 'dist/index.html'), '<h1>Static fixture</h1>');
  }
  const port = await freePort(), panel = createServer({ repo: core, workspace, port });
  panel.server.listen(port, '127.0.0.1'); await once(panel.server, 'listening');
  try {
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await navigate(panel.url, `!!document.querySelector('#projects .bundled-sec .proj')`);
      for (const theme of ['light', 'dark']) for (const width of [500, 1250]) {
        await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        const layout = await evaluate(`(() => {
          const nav=document.querySelector('#projects .nav-list'),row=nav.querySelector('.proj'),heading=nav.querySelector('.bundled-sec>h2');
          nav.scrollTop=0;row.focus();const box=row.getBoundingClientRect(),parent=nav.getBoundingClientRect(),next=heading.getBoundingClientRect();
          return {offset:parseFloat(getComputedStyle(row).outlineOffset),inside:box.left>=parent.left&&box.right<=parent.right+.5,clear:next.top>=box.bottom,
            labels:[...nav.querySelectorAll('.bundled-sec h2,.bundled-sec .meta')].map(node=>node.textContent)};
        })()`);
        assert.ok(layout.offset < 0, `${theme}/${width}: inset focus`); assert.equal(layout.inside, true); assert.equal(layout.clear, true);
        assert.ok(layout.labels.every((text: string) => !/bundled|read-only/i.test(text))); assert.ok(layout.labels.some((text: string) => text.includes('embedded')));
      }
    });
  } finally { await panel.close(); await fs.rm(root, { recursive: true, force: true }); }
});
