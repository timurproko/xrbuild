import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import fs from 'node:fs/promises';
import { withBrowser } from './browser-fixture.ts';

test('mounted controls keep rejection kind, joint and count visible across healthy and terminal states', { skip: !process.env.XRB_TEST_BROWSER, timeout: 30000 }, async () => {
  const server = http.createServer((req, res) => { void (async () => {
    if (req.url === '/hands-live-controls.js') { res.setHeader('content-type', 'text/javascript'); res.end(await fs.readFile(new URL('../ui/hands-live-controls.js', import.meta.url))); return; }
    res.setHeader('content-type', 'text/html'); res.end(`<label><select id="hands-provider"><option value="core/fixture">Fixture</option></select></label><b id="hands-tracking-fps"></b><div id="hands-view-empty"><span></span></div><script type="module">
      import {mountHandsLiveControls} from '/hands-live-controls.js';
      window.session={active:false,stopping:false,subscribeLifecycle(fn){window.update=fn;return()=>{}},async status(){return {supported:true,owns:false,busy:false}}};
      window.controls=mountHandsLiveControls({session,view:{profile:{}},load:async()=>({providers:[{owner:'core',id:'fixture',available:true,transport:'native'}]})});window.ready=true;
    </script>`);
  })().catch(error => { res.statusCode = 500; res.end(error.message); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    await withBrowser(async ({ navigate, evaluate }) => {
      await navigate(`http://127.0.0.1:${(server.address() as any).port}`, 'window.ready');
      const diagnostic = 'Rejected confidence-range; joint 8; count 3 frames, 3 hands';
      await evaluate(`session.active=true;update({phase:'no-hands',filtered:true,diagnostic:${JSON.stringify(diagnostic)}})`);
      assert.equal(await evaluate(`document.querySelector('#hands-live-diagnostic').textContent`), diagnostic);
      assert.equal(await evaluate(`document.querySelector('#hands-live-diagnostic').hidden`), false);
      assert.match(await evaluate(`document.querySelector('#hands-view-empty').textContent`), /Malformed observation dropped/);
      await evaluate(`update({phase:'running',trackingFps:60});session.active=false;update({phase:'failed',reason:'Persistent malformed output'})`);
      assert.equal(await evaluate(`document.querySelector('#hands-live-diagnostic').textContent`), diagnostic);
      assert.equal(await evaluate(`document.querySelector('#hands-start-stop').textContent`), 'Start');
    });
  } finally { await new Promise<void>(r => server.close(() => r())); }
});
