import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { freePort } from '../src/host-runner.ts';
import { logicalInputNames } from '../ui/provider-choice.js';
import { navigationItems } from '../ui/navigation.js';
import { validateToolLinks } from '../src/navigation.ts';

test('input presentation has only logical kinds and Hands is always a core destination', () => {
  assert.deepEqual(logicalInputNames(['mouse', 'tracker', 'old-alias', 'simulated', 'replay', 'keyboard']), ['mouse', 'hand', 'keyboard']);
  assert.equal(navigationItems('http://127.0.0.1:5180').find(item => item.id === 'hands')?.href, 'http://127.0.0.1:5180/hands/');
  assert.throws(() => validateToolLinks({ tools: [{ id: 'shadow', label: 'Shadow', route: '/hands/', module: 'tool.mjs' }] }), /overlap/);
});

test('core Hands opens without optional plugins or state creation; old alias redirects without starting tools', async () => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hands-http-'));
  const core = path.join(root, 'core'), workspace = path.join(root, 'missing');
  await fs.mkdir(core);
  const port = await freePort(), app = createServer({ repo: core, workspace, port }); app.server.listen(port, '127.0.0.1'); await once(app.server, 'listening');
  try {
    const address = app.server.address() as { port: number }, base = `http://127.0.0.1:${address.port}`;
    const html = await fetch(base + '/hands/').then(r => r.text());
    assert.match(html, /Skeleton provider/); assert.match(html, /does not start it/);
    const old = await fetch(base + '/hand-tracking/?x=1', { redirect: 'manual' });
    assert.equal(old.headers.get('location'), '/hands/?x=1');
    const state = await fetch(base + '/api/hands').then(r => r.json());
    assert.equal(state.choiceRequired, true); assert.equal(state.initial, false);
    assert.equal(state.providers.find((p: { id: string }) => p.id === 'webxr').transport, 'webxr');
    assert.equal(app.panel.runner.state().phase, 'idle'); assert.equal(app.panel.jobs.list().length, 0);
    await assert.rejects(fs.stat(workspace), /ENOENT/);
    const response = await fetch(base + '/api/hands', { method: 'PUT', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ provider: null, revision: state.revision, registryRevision: 'stale' }) });
    assert.equal(response.status, 409);
    assert.equal((await fetch(base + '/api/hands', { method: 'PUT', headers: { Origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ provider: { owner: 'core', id: 'webxr' }, revision: state.revision, registryRevision: state.registryRevision }) })).status, 200);
    const saved = await fetch(base + '/api/hands').then(r => r.json()); assert.deepEqual(saved.selected, { owner: 'core', id: 'webxr' });
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
