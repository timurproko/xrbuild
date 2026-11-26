import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { withBrowser, sleep } from './browser-fixture.ts';

// Mock metadata only. The browser cannot acquire devices and no native host is started.
test('Hands picker shows initial/missing/empty states, saves revisioned choices and handles conflicts', { skip: !process.env.XRB_TEST_BROWSER, timeout: 60000 }, async () => {
  let selected: { owner: string; id: string } | null = { owner: 'workspace:example', id: 'tracker' }, conflict = false, saves = 0;
  const providers = [{ owner: 'workspace:example', id: 'tracker', label: 'Example real source', purpose: 'tracked', available: true, reason: 'Not started; device availability checked at launch' }];
  const root = path.resolve(import.meta.dirname, '../ui');
  const server = createServer(async (req, res) => {
    if (req.url === '/api/hands') {
      if (req.method === 'PUT') { saves++; if (conflict) { res.writeHead(409); res.end(JSON.stringify({ error: 'Hands profile changed' })); return; } }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ providers, selected, initial: true, revision: 'state', registryRevision: 'registry' })); return;
    }
    if (req.url === '/api/events') { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(); return; }
    if (req.url === '/api/navigation') { res.end(JSON.stringify({ tools: [] })); return; }
    try {
      const name = req.url === '/hands/' ? 'hands.html' : req.url!.slice(1);
      if (!/^[a-z-]+\.(html|js|css)$/.test(name)) throw new Error('not found');
      res.setHeader('content-type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(await fs.readFile(path.join(root, name)));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as { port: number }).port;
    await withBrowser(async ({ navigate, evaluate, send }) => {
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.captureCalls=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{captureCalls++;throw Error('forbidden')};` });
      await navigate(`http://127.0.0.1:${port}/hands/`, `document.querySelector('#hands-provider')?.value==='workspace:example/tracker'`);
      assert.match(await evaluate(`document.querySelector('#hands-availability').textContent`), /Initial default/);
      assert.equal(await evaluate(`!!document.querySelector('canvas')`), false);
      await evaluate(`document.querySelector('#hands-save').click()`); await sleep(150);
      assert.equal(saves, 1); assert.match(await evaluate(`document.querySelector('#hands-message').textContent`), /Saved/);
      conflict = true;
      await evaluate(`document.querySelector('#hands-save').click()`); await sleep(150);
      assert.match(await evaluate(`document.querySelector('#hands-message').textContent`), /Reload/);
      selected = { owner: 'workspace:missing', id: 'absent' };
      await evaluate(`document.querySelector('#hands-reload').click()`); await sleep(150);
      assert.match(await evaluate(`document.querySelector('#hands-availability').textContent`), /missing/);
      assert.equal(await evaluate(`document.querySelector('#hands-save').disabled`), true);
      selected = null; providers.length = 0;
      await evaluate(`document.querySelector('#hands-reload').click()`); await sleep(150);
      assert.match(await evaluate(`document.querySelector('#hands-availability').textContent`), /requires a provider choice/);
      assert.equal(await evaluate('captureCalls'), 0);
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
