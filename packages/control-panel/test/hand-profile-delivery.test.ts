import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { LiveHands, sendHandProfile } from '../src/hands-live.ts';
import { handProfile } from '../../sdk/src/hand-profile.ts';
import { MSG_HAND_PROFILE_ACK, MSG_SET_HAND_PROFILE, decodeProfileControl, encodeProfileControl, HandProfileReceiver } from '../../sdk/src/hand-profile-control.ts';

test('native controller waits for matching SDK ack, not a host send; stale ack cannot claim success', async () => {
  const live = new LiveHands(handProfile(), 'a'.repeat(64)), applied: number[] = [];
  class Socket {
    binaryType = ''; onopen: any; onerror: any; onclose: any; onmessage: any;
    constructor(readonlyUrl: string) { assert.match(readonlyUrl, /token=owned/); queueMicrotask(() => this.onopen()); }
    send(bytes: ArrayBuffer) {
      const e: any = decodeProfileControl(bytes, MSG_SET_HAND_PROFILE);
      this.onmessage({ data: encodeProfileControl(MSG_HAND_PROFILE_ACK, { ...e, sequence: -1 }) });
      const receiver = new HandProfileReceiver(e.runId, () => applied.push(e.sequence), ack => this.onmessage({ data: encodeProfileControl(MSG_HAND_PROFILE_ACK, ack) }));
      receiver.receive(e); assert.deepEqual(applied, []); receiver.flush();
    }
    close() {}
  }
  await sendHandProfile('ws://127.0.0.1:1/?token=owned', live.envelope, Socket as any);
  assert.deepEqual(applied, [0]); assert.equal(live.acknowledge({ ...live.envelope, sequence: -1 }), false);
  assert.equal(live.delivery, 'Applying'); assert.equal(live.acknowledge(live.envelope), true); assert.equal(live.delivery, 'Applied');
});

test('isolated browser run receives Apply through scoped endpoint, ignores stale ack and retires on stop', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hands-delivery-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace'); await fs.mkdir(core);
  const port = await freePort(), app = createServer({ repo: core, workspace, port }); app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${port}`, panel = app.panel as any;
  const get = () => fetch(base + '/api/hands').then(r => r.json());
  try {
    const state = await get(), session = 'browser-session-12345678', token = 'browser-token-1234567890';
    panel.previewProjection = { route: '/preview/fake/', token, session, projectId: 'fake', handPolicy: 'webxr' };
    panel.liveHands = new LiveHands(handProfile(), state.revision, session);
    (panel.runner as any).s.phase = 'running';
    const endpoint = new URL('/api/preview/hands', base);
    for (const [k, v] of Object.entries({ route: '/preview/fake/', token, session, project: 'fake' })) endpoint.searchParams.set(k, v);
    for (const k of ['token', 'session', 'route', 'project']) {
      const wrong = new URL(endpoint); wrong.searchParams.set(k, 'wrong'); assert.equal((await fetch(wrong)).status, 404);
    }
    const applied = await fetch(base + '/api/hands/apply', { method: 'POST', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ profile: { offsetMm: { x: 20 } }, revision: state.revision, registryRevision: state.registryRevision }) });
    assert.equal(applied.status, 200); assert.equal((await applied.json()).delivery, 'Applying');
    const response = await fetch(endpoint, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173'); assert.equal(response.headers.get('cache-control'), 'no-store');
    const message = await response.json(); assert.equal(message.sequence, 1); assert.equal(message.profile.offsetMm.x, 20);
    endpoint.searchParams.set('ack', '0'); endpoint.searchParams.set('revision', message.revision); await fetch(endpoint);
    assert.equal((await get()).delivery, 'Applying');
    endpoint.searchParams.set('ack', String(message.sequence)); await fetch(endpoint); assert.equal((await get()).delivery, 'Applied');
    const next = await get(); assert.equal(next.profile.offsetMm.x, 20);
    (panel.runner as any).s.phase = 'idle'; assert.equal((await fetch(endpoint)).status, 404);
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
