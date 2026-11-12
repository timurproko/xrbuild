import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { validateToolLinks } from '../src/navigation.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

test('independentView is a bounded neutral managed capability', () => {
  const tool = { id: 'viewer', label: 'Viewer', route: '/viewer/', module: 'tool.mjs', independentView: true };
  assert.equal((validateToolLinks({ tools: [tool] })[0] as any).independentView, true);
  assert.throws(() => validateToolLinks({ tools: [{ ...tool, independentView: 'yes' }] }), /independentView/);
  assert.throws(() => validateToolLinks({ tools: [{ id: 'viewer', label: 'Viewer', url: 'http://localhost:5123/', independentView: true }] }), /either url or/);
});

test('unavailable independent view retains shared header and inline explicit setup instead of a Retry wall', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const root = await fs.mkdtemp(path.join(REPO, '.artifacts/independent-view-')), core = path.join(root, 'core'), workspace = path.join(root, 'user');
  const plugin = path.join(core, 'embedded/plugins/viewer');
  await fs.mkdir(plugin, { recursive: true }); await fs.mkdir(workspace);
  await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: 'Viewer', type: 'plugin', version: '1.0.0', panel: { tools: [{ id: 'viewer', label: 'Viewer', route: '/viewer/', module: 'tool.mjs', independentView: true }] } }));
  await fs.writeFile(path.join(plugin, 'tool.mjs'), `export function createWorkspaceTool(){throw new Error('Current browser build is unavailable. Explicit public setup is required.');}`);
  const port = await freePort(), panel = createServer({ repo: core, workspace, port });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  t.after(async () => { await panel.close(); await fs.rm(root, { recursive: true, force: true }); });
  let setups = 0;
  panel.panel.setupBundledServices = () => { setups++;return panel.panel.jobs.start('tool-setup', null, 'Mocked public setup', async ctx => ctx.line('Checked public setup fixture complete')); };
  const mutations: string[] = [];
  panel.server.on('request', req => { if (!['GET', 'HEAD'].includes(req.method!)) mutations.push(req.method + ' ' + req.url); });
  await withBrowser(async ({ navigate, evaluate }) => {
    await navigate(`${panel.url}viewer/`, `!!document.querySelector('#tool-view-status') && !!document.querySelector('#panel-menu [data-navigation="viewer"]')`);
    assert.equal(await evaluate(`!!document.querySelector('.tool-start-card,dialog[open]')`), false);
    assert.equal(await evaluate(`document.querySelector('.xrb-product-menu').textContent`), 'Viewer');
    assert.equal(await evaluate(`document.querySelector('#tool-view-setup').hidden`), false);
    assert.match(await evaluate(`document.querySelector('#tool-view-status').textContent`), /unavailable/);
    const response = await fetch(`${panel.url}viewer/`);
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(response.headers.get('content-security-policy'), "frame-ancestors 'self'");
    assert.deepEqual(mutations, []); assert.equal(setups, 0); assert.equal(panel.panel.runner.busy, false);
    assert.deepEqual(await fs.readdir(workspace), []);
    await evaluate(`document.querySelector('#tool-view-setup').click()`);
    for (let i = 0; i < 100 && !await evaluate(`document.querySelector('#tool-view-status').textContent.includes('setup complete')`); i++) await sleep(40);
    assert.equal(setups, 1);
    assert.match(await evaluate(`document.querySelector('#tool-view-output').textContent`), /fixture complete/);
    assert.equal(await evaluate(`!!document.querySelector('dialog[open]')`), false);
    const foreign = await fetch(`${panel.url}api/plugins/setup-bundled`, { method: 'POST', headers: { Origin: 'https://remote.test' } });
    assert.equal(foreign.status, 403); assert.equal(setups, 1);
  });
});
