import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import fs from 'node:fs/promises';
import { withBrowser, sleep } from './browser-fixture.ts';

test('mounted controls keep rejection kind, joint and count visible across healthy and terminal states', { skip: !process.env.XRB_TEST_BROWSER, timeout: 30000 }, async () => {
  const server = http.createServer((req, res) => { void (async () => {
    // Serve the controls and the UI modules they import.
    if (/^\/[\w-]+\.js$/.test(req.url ?? '')) { res.setHeader('content-type', 'text/javascript'); res.end(await fs.readFile(new URL(`../ui${req.url}`, import.meta.url))); return; }
    res.setHeader('content-type', 'text/html'); res.end(`<label><select id="hands-provider"><option value="core/fixture">Fixture</option></select></label><b id="hands-tracking-fps"></b><div id="hands-view-empty"><span></span></div><script type="module">
      import {mountHandsLiveControls} from '/hands-live-controls.js';
      window.session={active:false,stopping:false,subscribeLifecycle(fn){window.update=fn;return()=>{}},async status(){return {supported:true,owns:false,busy:false}}};
      window.controls=mountHandsLiveControls({session,view:{profile:{}},load:async()=>({selected:{owner:'core',id:'fixture'},revision:'r',registryRevision:'g',providers:[{owner:'core',id:'fixture',available:true,transport:'native'}]})});window.ready=true;
    </script>`);
  })().catch(error => { res.statusCode = 500; res.end(error.message); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(`http://127.0.0.1:${(server.address() as any).port}`, 'window.ready');
      const diagnostic = 'Rejected confidence-range; joint 8; count 3 frames, 3 hands';
      await evaluate(`session.active=true;update({phase:'no-hands',filtered:true,diagnostic:${JSON.stringify(diagnostic)}})`);
      assert.match(await evaluate(`document.querySelector('#hands-live-diagnostic').textContent`), new RegExp(`\\d\\d:\\d\\d:\\d\\d  ${diagnostic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), 'diagnostics are timestamped log lines');
      assert.equal(await evaluate(`document.querySelector('#hands-live-diagnostic').hidden`), false);
      // Provider lifecycle lines: started once (not per running/no-hands flip), then stopping and stopped.
      await evaluate(`update({phase:'running',trackingFps:60});update({phase:'no-hands'});update({phase:'stopping'});update({phase:'stopped'})`);
      const lifecycle = (await evaluate(`document.querySelector('#hands-live-diagnostic').textContent`)).split('\n').map((line: string) => line.slice(10));
      assert.deepEqual(lifecycle.filter((line: string) => /^(Starting|Stopping)|(started|stopped)$/.test(line)), ['Fixture started', 'Stopping Fixture…', 'Fixture stopped']);
      await evaluate(`update({phase:'running',trackingFps:60});session.active=false;update({phase:'failed',reason:'Persistent malformed output'})`);
      const logged = await evaluate(`document.querySelector('#hands-live-diagnostic').textContent.split('\\n')`);
      assert.ok(logged.some((line: string) => line.endsWith(diagnostic)) && logged.at(-1).endsWith('Persistent malformed output'), 'a failure reason is appended after the earlier diagnostic');
      assert.equal(await evaluate(`document.querySelector('#hands-start-stop').textContent`), 'Start');
      await evaluate(`window.remote={busy:true,owns:true,phase:'failed',sessionId:'old',cleanupPending:true};session.status=async()=>remote;session.recover=async()=>{remote={busy:false,owns:true,phase:'stopped'};return remote}`);
      await sleep(1100);
      assert.equal(await evaluate(`document.querySelector('#hands-start-stop').textContent`), 'Retry cleanup');
      await evaluate(`document.querySelector('#hands-start-stop').click()`); await sleep(50);
      assert.equal(await evaluate(`document.querySelector('#hands-start-stop').textContent`), 'Start');
      await evaluate(`remote={busy:true,owns:false,phase:'running',sessionId:'foreign-live',takeoverAvailable:true};session.start=async selection=>{window.chosen=selection;session.active=true;update({phase:'running'})}`);
      await sleep(1100);
      assert.equal(await evaluate(`document.querySelector('#hands-start-stop').textContent`), 'Take over');
      assert.equal(await evaluate(`document.querySelector('#hands-start-stop').disabled`), false);
      await evaluate(`document.querySelector('#hands-start-stop').click()`); await sleep(50);
      assert.equal(await evaluate('chosen.takeoverSessionId'), 'foreign-live');
    });
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
