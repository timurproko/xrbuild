import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { withBrowser } from './browser-fixture.ts';

test('the setup dialog asks for a required file, waits for it, then copies it before starting the install', { skip: !process.env.XRB_TEST_BROWSER, timeout: 40000 }, async () => {
  const ui = path.resolve(import.meta.dirname, '../ui'), received: { headers: http.IncomingHttpHeaders; body: string }[] = [], installs: unknown[] = [];
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url!, 'http://localhost').pathname;
    const json = (value: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
    let body = ''; for await (const chunk of req) body += chunk;
    if (pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/design-system.css"><link rel="stylesheet" href="/hands.css"><main></main>'); return; }
    if (pathname === '/api/hands/postprocessing/setup-plan') return json({ owner: 'workspace:mano', kind: 'cpu', label: 'CPU runtime', consent: 'c0ffee', installed: false, refresh: false,
      destination: 'home', downloadBytes: 0, installedBytes: 0, licences: [], items: [], input: { label: 'MANO archive (mano_v1_2.zip)', accept: '.zip' } });
    if (pathname === '/api/hands/postprocessing/setup-input') { received.push({ headers: req.headers, body }); return json({ input: 'input-1' }); }
    if (pathname === '/api/hands/postprocessing/setup') { installs.push(JSON.parse(body)); return json({ id: 'job-1', state: 'done', lines: ['done'] }); }
    if (pathname === '/api/jobs') return json({ jobs: [] });
    const file = path.resolve(ui, '.' + pathname);
    if (!file.startsWith(ui + path.sep)) { res.writeHead(404).end(); return; }
    try { res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(await fs.readFile(file)); } catch { res.writeHead(404).end(); }
  });
  server.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/`, "!!document.querySelector('main')");
      await evaluate(`(async()=>{const {openMeshSetup}=await import('/hands-mesh-setup.js');window.result=openMeshSetup({owner:'workspace:mano',label:'MANO hand mesh'});await new Promise(r=>setTimeout(r,300))})()`);
      const before = await evaluate(`(()=>{const d=document.querySelector('dialog.hands-mesh-setup'),i=d.querySelector('[data-setup-file-input]');
        return {row:!d.querySelector('[data-setup-file]').hidden,label:d.querySelector('[data-setup-file-label]').textContent,accept:i.accept,install:d.querySelector('[data-setup-install]').disabled,scroll:d.scrollWidth>d.clientWidth}})()`);
      assert.deepEqual(before, { row: true, label: 'MANO archive (mano_v1_2.zip)', accept: '.zip', install: true, scroll: false }, 'Install waits for the file');
      await evaluate(`(()=>{const i=document.querySelector('[data-setup-file-input]'),t=new DataTransfer();t.items.add(new File(['licensed'],'mano_v1_2.zip'));i.files=t.files;i.dispatchEvent(new Event('change'))})()`);
      assert.equal(await evaluate(`document.querySelector('[data-setup-install]').disabled`), false);
      await evaluate(`document.querySelector('[data-setup-install]').click()`);
      await evaluate(`new Promise(r=>{const t=setInterval(()=>{if(document.querySelector('.xrb-progress-status-icon').dataset.state==='done'){clearInterval(t);r()}},50)})`);
      assert.equal(received.length, 1);
      assert.deepEqual([received[0].headers['x-xrb-setup-owner'], received[0].headers['x-xrb-setup-name'], received[0].body], ['workspace:mano', 'mano_v1_2.zip', 'licensed']);
      assert.deepEqual(installs, [{ owner: 'workspace:mano', consent: 'c0ffee', input: 'input-1' }]);
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
