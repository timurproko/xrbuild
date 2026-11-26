import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { LiveHands } from '../src/hands-live.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { handProfile } from '../../sdk/src/hand-profile.ts';
import { createXrbApp } from '../../sdk/src/index.ts';
import { decodeMessage } from '../../sdk/src/protocol.ts';
import { handsMessage, openHand } from '../../sdk/test/fixtures.ts';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('Apply crosses the real isolated preview API and SDK subscription into a running managed fake-provider app', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hands-app-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace'); await fs.mkdir(core);
  const state = await saveHandsState(core, workspace, { owner: 'core', id: 'webxr' }, (await readHandsState(core, workspace)).revision);
  const port = await freePort(), panelServer = createServer({ repo: core, workspace, port }); panelServer.server.listen(port, '127.0.0.1'); await once(panelServer.server, 'listening');
  const base = `http://127.0.0.1:${port}`, panel = panelServer.panel as any;
  const g = globalThis as any, previous = Object.fromEntries(['innerWidth', 'innerHeight', 'location', '__XRB_HOST__', '__XRB_HAND_PROFILE_FROZEN__'].map(k => [k, g[k]]));
  const token = 'app-token-123456789012', session = 'app-session-123456789';
  panel.previewProjection = { token, session, route: '/preview/fake/', projectId: 'fake', handPolicy: 'webxr' };
  panel.liveHands = new LiveHands(handProfile(), state.revision, session); panel.runner.s.phase = 'running';
  const q = new URLSearchParams({ 'xrb-hand': 'webxr', 'xrb-preview-panel': base, 'xrb-preview-token': token, 'xrb-preview-session': session, 'xrb-preview-route': '/preview/fake/', 'xrb-project': 'fake' });
  Object.assign(g, { innerWidth: 1280, innerHeight: 720, location: { href: `${base}/preview/fake/?${q}`, search: `?${q}` }, __XRB_HOST__: undefined, __XRB_HAND_PROFILE_FROZEN__: false });
  const renderer = { domElement: { style: {}, addEventListener() {}, removeEventListener() {} }, xr: { isPresenting: false, getSession: () => null }, setPixelRatio() {}, setSize() {}, setScissorTest() {}, setViewport() {}, setScissor() {}, setAnimationLoop() {}, render() {} } as any;
  const app = createXrbApp(renderer, { autoStart: false, xrb: { pointer: false, hands: { smoothing: false, prediction: false } } });
  const ingress = (app.xrb as any).handIngress;
  const render = () => app.xrb.render(app.scene, app.camera);
  try {
    for (let i = 0; i < 20 && !ingress.ready; i++) { await sleep(30); render(); }
    assert.equal(ingress.ready, true);
    const snapshot = await fetch(base + '/api/hands').then(r => r.json());
    const response = await fetch(base + '/api/hands/apply', { method: 'POST', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ revision: snapshot.revision, profile: { sizeFactor: .5, offsetMm: { x: 100 } } }) });
    assert.equal(response.status, 200);
    for (let i = 0; i < 30 && ingress.profile.sizeFactor !== .5; i++) { await sleep(30); render(); }
    assert.equal(ingress.profile.sizeFactor, .5);
    const points = openHand([0, 0, .1]), now = performance.now();
    ingress.push('webxr', decodeMessage(handsMessage([{ id: 1, keypoints: points }], now)), now); render();
    assert.ok(Math.abs(app.xrb.currentHands[0].keypoints[0][0] - .1) < 1e-6);
    assert.ok(Math.abs(app.xrb.currentHands[0].keypoints[8][1] - points[8][1] * .5) < 1e-6);
    await sleep(300); assert.equal((await fetch(base + '/api/hands').then(r => r.json())).delivery, 'Applied');
  } finally {
    app.dispose(); for (const [k, v] of Object.entries(previous)) { if (v === undefined) delete g[k]; else g[k] = v; }
    await panelServer.close(); await fs.rm(root, { recursive: true, force: true });
  }
});
