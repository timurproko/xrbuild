import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const browser = process.env.XRB_TEST_BROWSER;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('shared tooltips replace native hints across dynamic controls and modal dialogs', { skip: !browser, timeout: 30000 }, async () => {
  const html = `<!doctype html><title>Semantic page title</title><link rel="stylesheet" href="/design-system.css">
    <style>body{padding:30px;display:grid;gap:14px}button,input{width:200px}iframe{width:200px;height:20px}dialog{overflow:hidden;width:300px}</style>
    <button id="detail" title="Detailed action help" aria-label="Short name" aria-describedby="existing-help">Detail</button>
    <span id="existing-help">Existing help</span>
    <input id="field" title="Field hint"><span id="status" title="Status hint">Status</span>
    <button id="disabled" disabled title="Unavailable until ready">Disabled</button>
    <button id="swatch" class="xrb-swatch" title="Blue (default)" aria-label="Blue">Blue</button>
    <button id="explicit" title="Legacy hint" data-tooltip="Explicit hint">Explicit</button>
    <button id="run">Run</button><iframe title="Embedded preview"></iframe>
    <dialog id="dialog"><button id="modal" title="Modal hint">Modal action</button></dialog>
    <script type="module">import {installTooltips} from '/design-system.js';window.disposeTooltips=installTooltips(document);window.ready=true;</script>`;
  const server = createServer(async (req, res) => {
    if (req.url === '/design-system.js' || req.url === '/design-system.css') {
      res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css');
      res.end(await readFile(new URL(`../ui${req.url}`, import.meta.url)));
    } else { res.setHeader('Content-Type', 'text/html'); res.end(html); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const profile = fileURLToPath(new URL(`../../../.artifacts/tooltip-browser-${process.pid}/`, import.meta.url));
  await mkdir(profile, { recursive: true });
  const processHandle = spawn(browser!, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let launchError: Error | undefined;
  processHandle.on('error', (error) => { launchError = error; });
  let socket: WebSocket | undefined;
  try {
    let port = '';
    for (let i = 0; i < 60; i++) {
      if (launchError) throw launchError;
      try { port = (await readFile(`${profile}/DevToolsActivePort`, 'utf8')).split('\n')[0]; break; } catch { await sleep(100); }
    }
    assert.ok(port, 'test browser starts');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json() as { webSocketDebuggerUrl: string };
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve) => socket!.addEventListener('open', resolve, { once: true }));
    let id = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: unknown) => void }>();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(message.error); else entry.resolve(message.result);
    });
    const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
      const key = ++id;
      const timeout = setTimeout(() => { pending.delete(key); reject(new Error(`Timed out: ${method}`)); }, 5000);
      pending.set(key, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
      socket!.send(JSON.stringify({ id: key, method, params }));
    });
    const evaluate = async (expression: string) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${address.port}/` });
    for (let i = 0; i < 60 && !await evaluate('!!window.ready'); i++) await sleep(100);
    assert.equal(await evaluate('!!window.ready'), true);
    assert.equal(await evaluate('document.querySelectorAll("[title]:not(iframe)").length'), 0);
    assert.equal(await evaluate('document.title'), 'Semantic page title');
    assert.equal(await evaluate('document.querySelector("iframe").title'), 'Embedded preview');
    const hover = async (selector: string) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 790, y: 890 });
      const point = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await sleep(320);
      return evaluate('document.querySelector(".xrb-tooltip")?.textContent ?? null');
    };
    for (const [selector, message] of [['#detail', 'Detailed action help'], ['#field', 'Field hint'], ['#status', 'Status hint'], ['#disabled', 'Unavailable until ready'], ['#swatch', 'Blue (default)'], ['#explicit', 'Explicit hint']]) {
      assert.equal(await hover(selector), message, selector);
    }
    assert.equal(await hover('#run'), null, 'a visible text action without a hint has no tooltip');
    await evaluate(`document.querySelector('#detail').focus()`);
    await sleep(40);
    assert.equal(await evaluate(`document.querySelector('.xrb-tooltip')?.textContent`), 'Detailed action help');
    assert.equal(await evaluate(`document.querySelector('#detail').getAttribute('aria-label')`), 'Short name');
    assert.match(await evaluate(`document.querySelector('#detail').getAttribute('aria-describedby')`), /existing-help xrb-tooltip-/);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    assert.equal(await evaluate(`document.querySelector('.xrb-tooltip')`), null);
    assert.equal(await evaluate(`document.querySelector('#detail').getAttribute('aria-describedby')`), 'existing-help');
    await evaluate(`document.querySelector('#status').title='Updated status'`);
    await sleep(30);
    assert.equal(await hover('#status'), 'Updated status');
    await evaluate(`document.querySelector('#status').title='Live update'`);
    await sleep(30);
    assert.equal(await evaluate(`document.querySelector('.xrb-tooltip').textContent`), 'Live update');
    await evaluate(`document.querySelector('#status').title=''`);
    await sleep(30);
    assert.equal(await evaluate(`document.querySelector('.xrb-tooltip')`), null, 'cleared dynamic hints do not persist');
    await evaluate(`document.body.insertAdjacentHTML('beforeend','<button id="new-hint" title="New hint">New</button>')`);
    assert.equal(await hover('#new-hint'), 'New hint');
    await evaluate(`document.querySelector('#new-hint').remove()`);
    await sleep(30);
    assert.equal(await evaluate(`document.querySelector('.xrb-tooltip')`), null);
    await evaluate(`document.querySelector('#dialog').showModal()`);
    assert.equal(await hover('#modal'), 'Modal hint');
    assert.equal(await evaluate(`document.querySelector('.xrb-tooltip').matches(':popover-open')`), true, 'tooltip reaches the top layer');
    assert.equal(await evaluate(`document.querySelector('.xrb-tooltip').closest('dialog').id`), 'dialog');
    assert.equal(await evaluate(`(() => {const r=document.querySelector('.xrb-tooltip').getBoundingClientRect();return r.left>=8&&r.right<=innerWidth-8&&r.top>=8&&r.bottom<=innerHeight-8;})()`), true);
    await evaluate(`document.querySelector('#dialog').close()`);
    await sleep(30);
    assert.equal(await evaluate(`document.querySelector('.xrb-tooltip')`), null);
    await hover('#detail');
    await evaluate(`window.disposeTooltips()`);
    assert.equal(await evaluate(`document.querySelector('.xrb-tooltip')`), null);
    assert.equal(await hover('#field'), null, 'disposal removes delegated listeners');
    await send('Browser.close');
  } finally {
    socket?.close();
    processHandle.kill();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
});
