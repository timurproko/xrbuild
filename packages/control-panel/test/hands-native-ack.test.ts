import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { readProject } from '../src/projects.ts';
import { readHandsState, saveHandsState } from '../src/hands-state.ts';
import { MSG_HAND_PROFILE_ACK, encodeProfileControl } from '../../sdk/src/hand-profile-control.ts';

test('native launch sequence-zero acknowledgement updates Hands without Apply and listener retires with the run', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hands-native-ack-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace'), dir = path.join(workspace, 'projects/unsorted/fake');
  await fs.mkdir(path.join(core, 'native/host/build/Release'), { recursive: true }); await fs.mkdir(path.join(dir, 'dist'), { recursive: true });
  await fs.writeFile(path.join(core, 'native/host/build/Release/xrb-host.exe'), 'inert fixture; never executed');
  await fs.writeFile(path.join(dir, 'xrb-project.json'), JSON.stringify({ name: 'Fake', kind: 'app', entry: 'dist', inputs: ['hand'] }));
  await fs.writeFile(path.join(dir, 'dist/index.html'), '<h1>fake</h1>');
  await saveHandsState(core, workspace, { owner: 'core', id: 'simulated' }, (await readHandsState(core, workspace)).revision);
  const port = await freePort(), app = createServer({ repo: core, workspace, port }), panel = app.panel as any;
  const sockets: Socket[] = [];
  class Socket {
    binaryType = ''; onopen: any; onmessage: any; onerror: any; onclose: any; closed = false;
    constructor(url: string) { assert.equal(url, 'ws://fixture/?token=owning-run'); sockets.push(this); queueMicrotask(() => this.onopen?.()); }
    send() { assert.fail('the acknowledgement observer must not send provider/profile commands'); }
    close() { this.closed = true; }
  }
  panel.nativeHandSocket = Socket;
  panel.nativeProviders = async () => ({ providers: [{ name: 'simulated', role: 'input', builtin: true, path: null, version: '1', description: 'fake metadata only' }], error: null, rejected: [] });
  let envelope: any;
  panel.runner.start = async request => {
    const config = JSON.parse(await fs.readFile(request.hostArgs.find(a => a.startsWith('--config=')).slice(9), 'utf8'));
    envelope = config.handProfileRun;
    panel.runner.s = { ...panel.runner.s, phase: 'running', projectId: request.projectId, channelUrl: 'ws://fixture/?token=owning-run' };
    panel.runner.emit('state', panel.runner.state());
  };
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  const get = () => fetch(`http://127.0.0.1:${port}/api/hands`).then(r => r.json());
  try {
    await panel.run((await readProject(dir, 'fake', 'unsorted'))!, 'built');
    assert.equal(envelope.sequence, 0); assert.equal(sockets.length, 1, 'native launch must observe retained and future SDK acknowledgements');
    const live = panel.liveHands, bytes = await fs.readFile(path.join(workspace, 'config/hands/profile.json'), 'utf8');
    assert.equal((await get()).delivery, 'Applying');
    sockets[0].onmessage({ data: encodeProfileControl(MSG_HAND_PROFILE_ACK, { ...envelope, sequence: 1 }) });
    sockets[0].onmessage({ data: encodeProfileControl(MSG_HAND_PROFILE_ACK, { ...envelope, runId: 'retired-run-123456789' }) });
    assert.equal((await get()).delivery, 'Applying');
    sockets[0].onmessage({ data: encodeProfileControl(MSG_HAND_PROFILE_ACK, envelope) });
    assert.equal((await get()).delivery, 'Applied'); assert.equal(live.envelope.sequence, 0, 'no subsequent Apply occurred');
    assert.equal(await fs.readFile(path.join(workspace, 'config/hands/profile.json'), 'utf8'), bytes);
    panel.runner.s.phase = 'idle'; panel.runner.emit('state', panel.runner.state());
    assert.equal(sockets[0].closed, true);
    live.delivery = 'Applying'; sockets[0].onmessage({ data: encodeProfileControl(MSG_HAND_PROFILE_ACK, envelope) });
    assert.equal(live.delivery, 'Applying', 'a retired callback has no side effects');
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
