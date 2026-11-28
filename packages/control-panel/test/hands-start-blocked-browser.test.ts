import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import fs from 'node:fs/promises';
import { withBrowser, sleep } from './browser-fixture.ts';

test('Start stays clickable and a click explains why Hands cannot start, in a corner toast with Open Setup', { skip: !process.env.XRB_TEST_BROWSER, timeout: 30000 }, async () => {
  const server = http.createServer((req, res) => { void (async () => {
    if (/^\/[\w-]+\.(js|css)$/.test(req.url ?? '')) { res.setHeader('content-type', req.url!.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await fs.readFile(new URL(`../ui${req.url}`, import.meta.url))); return; }
    res.setHeader('content-type', 'text/html'); res.end(`<link rel="stylesheet" href="/design-system.css"><div class="hands-adjustment-tabs"><button data-tab="setup" onclick="window.setupOpened=true">Setup</button></div>
      <label><select id="hands-provider"><option value="">Choose a provider</option><option value="core/fixture">Fixture</option></select></label><b id="hands-tracking-fps"></b><div id="hands-view-empty"><span></span></div><script type="module">
      import {mountHandsLiveControls} from '/hands-live-controls.js';
      window.session={active:false,stopping:false,subscribeLifecycle(fn){window.update=fn;return()=>{}},async status(){return {supported:true,owns:false,busy:false}}};
      window.providers={selected:null,revision:'r',registryRevision:'g',providers:[{owner:'core',id:'fixture',available:true,transport:'native'}]};
      window.mount=()=>{window.controls=mountHandsLiveControls({session,view:{profile:{}},load:async()=>structuredClone(providers)})};mount();window.ready=true;
    </script>`);
  })().catch(error => { res.statusCode = 500; res.end(error.message); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(`http://127.0.0.1:${(server.address() as any).port}`, 'window.ready');
      await sleep(300);
      const notice = () => evaluate(`(()=>{const t=document.querySelector('.xrb-toast');return t?{text:t.textContent,tone:t.dataset.tone,actions:[...t.querySelectorAll('.xrb-toast-actions button')].map(b=>b.textContent)}:null})()`);
      assert.equal(await evaluate(`document.querySelector('#hands-start-stop').disabled`), false, 'Start stays clickable without a provider');
      assert.equal(await notice(), null, 'nothing is shown until the person tries to start');
      await evaluate(`document.querySelector('#hands-start-stop').click()`); await sleep(100);
      const shown = await notice() as { text: string; tone: string; actions: string[] };
      assert.match(shown.text, /Hands can't start.*Choose an available skeleton provider/);
      assert.deepEqual([shown.tone, shown.actions], ['warn', ['Open Setup']]);
      const aligned = await evaluate(`(()=>{const t=document.querySelector('.xrb-toast-body strong').getBoundingClientRect(),c=document.querySelector('.xrb-toast-close').getBoundingClientRect(),card=document.querySelector('.xrb-toast').getBoundingClientRect();return Math.abs((c.top+c.bottom)/2-(t.top+t.bottom)/2)<=4 && card.right-c.right<=12})()`);
      assert.equal(aligned, true, 'the close button sits in the top-right corner, level with the title');
      await evaluate(`document.querySelector('.xrb-toast-actions button').click()`);
      assert.equal(await evaluate('window.setupOpened'), true, 'Open Setup goes to the provider choice');
      // With a usable provider, Start starts instead of explaining, and an open notice closes by itself.
      await evaluate(`document.querySelector('#hands-start-stop').click()`); await sleep(100);
      assert.ok(await notice());
      await evaluate(`controls.dispose();providers.selected={owner:'core',id:'fixture'};document.querySelector('#hands-provider').value='core/fixture';session.start=async()=>{window.started=true};mount()`);
      await sleep(300);
      assert.equal(await notice(), null);
      await evaluate(`document.querySelector('#hands-start-stop').click()`); await sleep(100);
      assert.equal(await evaluate('window.started'), true);
    });
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
