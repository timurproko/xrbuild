import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { REPO } from '../src/env.ts';
import { freePort } from '../src/host-runner.ts';

test('Hands recording tools read existing data with checked scoped assets and no user-data migration or startup', async () => {
  const parent = process.env.XRB_TEST_ROOT ?? os.tmpdir(); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'hands-data-')), port = await freePort();
  const preferences = path.join(root, 'config/plugins/input-hands/preferences.json'), recordings = path.join(root, '.xrb/hand-tracking/recordings');
  const existing = JSON.stringify({ version: 1, owner: 'input-hands', values: { 'handtracking.fusion-calibrations.v1': JSON.stringify({ version: 1, values: [] }) } });
  const csv = '# xrbuild-hand-tracking-csv v1\n# {"createdUtc":"2026-11-26T00:00:00Z","durationMs":0,"frames":1}\ntime_ms,space,hand_id,handedness,joint,x,y,z,valid\n' + Array.from({ length: 21 }, (_, i) => `0,hand-relative,1,left,${i},0,0,0,1`).join('\n') + '\n';
  await fs.mkdir(path.dirname(preferences), { recursive: true }); await fs.mkdir(recordings, { recursive: true });
  await fs.writeFile(preferences, existing); await fs.writeFile(path.join(recordings, 'hand-tracking-archive.csv'), csv);
  const app = createServer({ repo: REPO, workspace: root, port }); await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${port}`;
  try {
    const status = await fetch(base + '/api/hands/tools').then(r => r.json()); assert.equal(status.available, true, status.reason);
    const list = await fetch(base + '/api/hands/tools/recordings').then(r => r.json()); assert.equal(list.recordings.length, 1);
    assert.equal(await fetch(base + '/api/hands/tools/recordings/hand-tracking-archive').then(r => r.text()), csv);
    const prefs = await fetch(base + '/api/hands/tools/preferences').then(r => r.json()); assert.equal(prefs.values['handtracking.fusion-calibrations.v1'], JSON.stringify({ version: 1, values: [] }));
    assert.equal((await fetch(base + '/hands/tools/browser.mjs')).status, 200);
    assert.equal((await fetch(base + '/hands/tools/src/live/recording/archive.ts')).status, 200);
    for (const url of ['/hands/tools/src/main.ts', '/hands/tools/src/live/session.ts', '/hands/tools/src/live/multiview/fusion.ts', '/hands-diagnostics/', '/hand-tracking/', '/__handtracking/recordings']) assert.equal((await fetch(base + url, { redirect: 'manual' })).status, 404, url);
    assert.equal((await fetch(base + '/api/hands/tools/preferences', { method: 'PUT', headers: { Origin: 'https://untrusted.test', 'content-type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal(await fs.readFile(preferences, 'utf8'), existing); assert.equal(await fs.readFile(path.join(recordings, 'hand-tracking-archive.csv'), 'utf8'), csv);
    await assert.rejects(fs.stat(path.join(root, 'config/hands/profile.json')), /ENOENT/);
    assert.equal(app.panel.jobs.list().length, 0); assert.equal(app.panel.runner.busy, false);
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
test('missing optional recording owner leaves core Hands open with a concise reason', async () => {
  const parent = process.env.XRB_TEST_ROOT ?? os.tmpdir(); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'hands-no-tools-')), port = await freePort();
  await fs.writeFile(path.join(root, 'xrb-plugins.json'), JSON.stringify({ disabled: ['input-hands'], settings: {} }));
  const app = createServer({ repo: REPO, workspace: root, port }); await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${port}`, status = await fetch(base + '/api/hands/tools').then(r => r.json());
    assert.equal(status.available, false); assert.match(status.reason, /not installed/); assert.equal((await fetch(base + '/hands/')).status, 200);
    assert.equal(app.panel.jobs.list().length, 0);
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
