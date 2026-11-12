import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { withBrowser } from './browser-fixture.ts';

test('development Launcher reads the selected panel across ports and recovers without inventory fallback', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async t => {
  await fs.mkdir(path.join(REPO, '.artifacts'), { recursive: true });
  const workspace = await fs.mkdtemp(path.join(REPO, '.artifacts/launcher-catalog-'));
  const core = path.join(workspace, 'core');
  const project = async (root: string, relative: string, kind = 'app') => {
    const dir = path.join(root, 'projects', relative);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'xrb-project.json'), JSON.stringify({ name: path.basename(relative), kind, entry: '.' }));
    await fs.writeFile(path.join(dir, 'index.html'), '<html><head></head><body>local preview</body></html>');
  };
  await project(path.join(core, 'embedded'), 'core/launcher');
  await project(path.join(core, 'embedded'), 'core/sample');
  await project(workspace, 'Core/custom');
  await project(workspace, 'Unsorted/loose');
  await project(workspace, 'archive/old');
  await project(workspace, 'checks/rig', 'test');
  await fs.writeFile(path.join(workspace, 'xrb-panel.json'), JSON.stringify({ sections: [{ name: 'core', items: ['bundled:launcher', 'custom', 'bundled:sample'] }] }));
  const port = await freePort(), panel = createServer({ repo: core, workspace, port });
  let inventoryRequests = 0;
  const catalogSource = await fs.readFile(path.join(REPO, 'embedded/projects/core/launcher/src/catalog.js'), 'utf8');
  const dev = http.createServer((req, res) => {
    if (req.url?.startsWith('/.xrb-publications.json')) inventoryRequests++;
    if (req.url === '/catalog.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(catalogSource); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<script type="module">
      import {loadRuntimeCatalog,excludeCurrentPublication} from '/catalog.js';
      window.refresh = async () => {
        try { window.apps=excludeCurrentPublication(await loadRuntimeCatalog({runtimeHref:location.href}),location.href);window.error=null; }
        catch(error) {window.apps=[];window.error=error.message;}
      };
    </script>`);
  });
  await new Promise<void>(resolve => dev.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await panel.close();
    await new Promise<void>((resolve, reject) => dev.close(error => error ? reject(error) : resolve()));
    await fs.rm(workspace, { recursive: true, force: true });
  });
  const href = new URL(`http://127.0.0.1:${(dev.address() as { port: number }).port}/`);
  href.searchParams.set('xrb-panel', panel.url);
  href.searchParams.set('xrb-project', 'bundled:launcher');
  await withBrowser(async ({ evaluate, navigate }) => {
    await navigate(href.href, `typeof window.refresh==='function'`);
    await evaluate('refresh()');
    assert.equal(await evaluate('apps.length'), 0);
    assert.equal(typeof await evaluate('error'), 'string');
    assert.equal(inventoryRequests, 0, 'an unavailable explicit panel is not replaced by dev-server inventory');
    await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
    await evaluate('refresh()');
    assert.equal(await evaluate('error'), null);
    assert.deepEqual(await evaluate('apps.map(app=>app.projectId)'), ['custom', 'bundled:sample', 'loose']);
    assert.equal(await evaluate('(async()=>{const r=await fetch(apps[0].iconUrl);return r.ok})()'), true, 'icons are readable from the other port');
    assert.equal(await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(`${panel.url}preview/rig/`)});return r.ok&&(await r.text()).includes('local preview')})()`), true, 'preview assets retain bounded CORS reads');
    assert.equal(inventoryRequests, 0);
  });
});
