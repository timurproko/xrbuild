import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { withBrowser, sleep } from './browser-fixture.ts';

// Explicit integration fixture: caller supplies a separately prepared current public service workspace.
test('checked Hands opens the real generated viewer without bridge/bootstrap/capture or a Retry wall', { skip: !process.env.XRB_TEST_BROWSER || !process.env.XRB_TEST_SERVICE_WORKSPACE, timeout: 60000 }, async t => {
  const port = await freePort(), panel = createServer({ repo: REPO, workspace: process.env.XRB_TEST_SERVICE_WORKSPACE!, port });
  await new Promise<void>(resolve => panel.server.listen(port, '127.0.0.1', resolve));
  t.after(() => panel.close());
  const mutations: string[] = [];
  panel.server.on('request', req => { if (!['GET', 'HEAD'].includes(req.method!)) mutations.push(req.method + ' ' + req.url); });
  await withBrowser(async ({ send, navigate, evaluate }) => {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.captureCalls=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{captureCalls++;throw new Error('Camera use forbidden in generated-view fixture')};` });
    await navigate(`${panel.url}hands/`, `document.querySelector('#input')?.value==='synthetic' && !document.body?.classList.contains('workspace-pending')`);
    await sleep(300);
    assert.equal(await evaluate(`!!document.querySelector('.xrb-app-bar')`), true);
    assert.equal(await evaluate(`!!document.querySelector('canvas')`), true);
    assert.equal(await evaluate(`!!document.querySelector('.tool-start-card,dialog[open]')`), false);
    assert.equal(await evaluate(`captureCalls`), 0);
    assert.ok(!mutations.some(route=>route.includes('/__handtracking/bridge')));
    assert.ok(!mutations.some(route=>route.includes('/setup-bundled')));
    assert.equal(panel.panel.jobs.list().length, 0);
    assert.equal(panel.panel.runner.busy, false);
  });
});
