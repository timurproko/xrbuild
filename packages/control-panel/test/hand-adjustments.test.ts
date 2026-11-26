import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { readHandsState, saveHandsState, saveHandAdjustments } from '../src/hands-state.ts';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';

test('one Hands record preserves source/unknown fields and rejects stale or invalid adjustment writers', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'adjustments-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace');
  try {
    const first = await readHandsState(core, workspace);
    assert.equal(first.profile.sizeFactor, 1); await assert.rejects(fs.stat(workspace), /ENOENT/);
    let state = await saveHandsState(core, workspace, { owner: 'core', id: 'webxr' }, first.revision);
    const file = path.join(workspace, 'config/hands/profile.json');
    const raw = { ...state.raw, future: 7, appearance: { future: 'keep', opacity: .8 } };
    await fs.writeFile(file, JSON.stringify(raw)); state = await readHandsState(core, workspace);
    const writes = await Promise.allSettled([
      saveHandAdjustments(core, workspace, { sizeFactor: .75, appearance: {} }, state.revision),
      saveHandsState(core, workspace, null, state.revision),
    ]);
    assert.equal(writes.filter(r => r.status === 'fulfilled').length, 1);
    state = await readHandsState(core, workspace);
    const source = state.provider;
    state = await saveHandAdjustments(core, workspace, { offsetMm: { x: 10 }, appearance: {} }, state.revision);
    assert.deepEqual(state.provider, source); assert.equal(state.raw.future, 7);
    assert.deepEqual(state.raw.appearance, { future: 'keep' });
    const bytes = await fs.readFile(file, 'utf8');
    await assert.rejects(saveHandAdjustments(core, workspace, { sizeFactor: 2 }, state.revision), /sizeFactor/);
    assert.equal(await fs.readFile(file, 'utf8'), bytes);
    await fs.writeFile(file, JSON.stringify({ ...state.raw, offsetMm: { x: 151 } }));
    await assert.rejects(readHandsState(core, workspace), /offsetMm.x.*-150..150/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('adjustment API persists without acquisition and source Save preserves it', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'adjustments-api-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'workspace'); await fs.mkdir(core);
  const port = await freePort(), app = createServer({ repo: core, workspace, port });
  app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${port}`;
  const get = () => fetch(base + '/api/hands').then(r => r.json());
  const post = (body: unknown) => fetch(base + '/api/hands/apply', { method: 'POST', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    let state = await get();
    const invalid = await post({ revision: state.revision, registryRevision: state.registryRevision, profile: { sizeFactor: 2 } });
    assert.equal(invalid.status, 400); assert.match((await invalid.json()).error, /sizeFactor/);
    const applied = await post({ revision: state.revision, registryRevision: state.registryRevision, profile: { sizeFactor: .8 } });
    assert.equal(applied.status, 200); assert.equal((await applied.json()).delivery, 'Saved for next launch');
    assert.equal((await post({ revision: state.revision, profile: {} })).status, 409);
    state = await get(); assert.equal(state.profile.sizeFactor, .8);
    const saved = await fetch(base + '/api/hands', { method: 'PUT', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ provider: { owner: 'core', id: 'webxr' }, revision: state.revision, registryRevision: state.registryRevision }) });
    assert.equal(saved.status, 200); assert.equal((await get()).profile.sizeFactor, .8);
    assert.equal(app.panel.runner.state().phase, 'idle'); assert.equal(app.panel.jobs.list().length, 0);
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
