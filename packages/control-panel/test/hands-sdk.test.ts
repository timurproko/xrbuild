import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from '../src/server.ts';
import { REPO } from '../src/env.ts';
import { freePort } from '../src/host-runner.ts';
test('Hands SDK browser graph uses the real installed SDK, has closed imports and rejects unrelated sources', async () => {
  const parent = process.env.XRB_TEST_ROOT ?? os.tmpdir(); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'hands-sdk-')), port = await freePort();
  const app = createServer({ repo: REPO, workspace: root, port });
  await new Promise<void>(resolve => app.server.listen(port, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${port}`, queue = ['hands', 'hand-source', 'hand-visual', 'stereo', 'scene-hands', 'interaction/core/interactor'].map(name => `/sdk/${name}.js`), seen = new Set<string>();
    while (queue.length) {
      const name = queue.shift()!; if (seen.has(name)) continue; seen.add(name);
      const response = await fetch(base + name); assert.equal(response.status, 200, name);
      const source = await response.text(); assert.doesNotMatch(source, /from\s*['"][^'"]*\.ts['"]/);
      for (const match of source.matchAll(/from\s*['"](\.[^'"]+)['"]/g)) queue.push(new URL(match[1], base + name).pathname);
    }
    assert.ok(seen.has('/sdk/hand-mesh-visual.js'), 'standard drawing dependency is included in the exact browser closure');
    for (const name of ['/vendor/three.module.js', '/vendor/OrbitControls.js']) assert.equal((await fetch(base + name)).status, 200);
    for (const name of ['/sdk/host.js', '/sdk/index.js', '/sdk/channel.js', '/sdk/hands.ts', '/sdk/../../package.json']) assert.equal((await fetch(base + name)).status, 404, name);
    assert.equal(app.panel.jobs.list().length, 0); assert.equal(app.panel.runner.busy, false);
  } finally { await app.close(); await fs.rm(root, { recursive: true, force: true }); }
});
