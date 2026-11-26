import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { REPO } from '../src/env.ts';
import { LiveHands } from '../src/hands-live.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
test('Apply tracks module and Hand-off app acknowledgements independently, ignoring retired/foreign replies', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hands-target-acks-'));
  const port = await freePort(), app = createServer({ repo: REPO, workspace: root, port }), panel = app.panel as any;
  panel.nativeProviders = async () => ({ providers: [], rejected: [], error: null });
  let state = await readHandsState(REPO, root); state = await saveHandsState(REPO, root, null, state.revision);
  const a = new LiveHands(state.profile, state.revision), b = new LiveHands(state.profile, state.revision);
  panel.liveHands = a; panel.runner.s.phase = 'running';
  panel.handSessions.current = { id: b.envelope.runId, owner: 'owning-page', token: '', epoch: 'a'.repeat(64), phase: 'running', heartbeat: Date.now(), ended: false, cancelled: false, preparing: false, live: b };
  await new Promise<void>(r => app.server.listen(port, '127.0.0.1', r));
  try {
    const result = await fetch(app.url + 'api/hands/apply', { method: 'POST', headers: { origin: new URL(app.url).origin, 'content-type': 'application/json' }, body: JSON.stringify({ profile: { ...state.profile, offsetMm: { x: 10, y: 0, z: 0 } }, revision: state.revision }) });
    assert.equal(result.status, 200); assert.equal((await result.json()).deliveryState, 'pending');
    assert.equal(b.acknowledge(a.envelope), false, 'app acknowledgement cannot stand in for module');
    a.acknowledge(a.envelope);
    let current = await (await fetch(app.url + 'api/hands')).json(); assert.equal(current.deliveryState, 'pending'); assert.equal(current.targets.find((t: any) => t.target === 'Hands').state, 'pending');
    assert.equal(b.acknowledge({ ...b.envelope, sequence: 0 }), false);
    b.acknowledge(b.envelope); current = await (await fetch(app.url + 'api/hands')).json(); assert.equal(current.deliveryState, 'applied');
    b.close(); b.deliveryState = 'pending'; assert.equal(b.acknowledge(b.envelope), false);
    panel.runner.s.phase = 'idle'; panel.handSessions.current.ended = true;
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
