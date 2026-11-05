import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyWorkspace } from './verify-workspace.mjs';

test('workspace dependencies require materialized files with pinned hashes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-pins-'));
  try {
    const plugin = path.join(root, 'plugins', 'sample');
    const file = path.join(root, 'third_party', 'sample', 'runtime.dll');
    await fs.mkdir(plugin, { recursive: true });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(path.join(plugin, 'deps.json'), JSON.stringify({ sources: [] }));
    const key = 'sample/runtime.dll';
    const bytes = Buffer.from('binary fixture');
    const hash = createHash('sha256').update(bytes).digest('hex');
    await fs.writeFile(path.join(plugin, 'deps.lock.json'), JSON.stringify({ [key]: hash }));
    await fs.writeFile(file, bytes);
    assert.equal(await verifyWorkspace(root), 1);
    const cli = fileURLToPath(new URL('./verify-workspace.mjs', import.meta.url));
    const good = spawnSync(process.execPath, [cli, `--workspace=${root}`], { cwd: root, encoding: 'utf8' });
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /1 pinned workspace dependencies verified/);
    for (const args of [[], ['--workspace='], [`--workspace=${root}`, '--other'], [root]]) {
      const bad = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /usage:/);
    }
    await fs.writeFile(file, 'version https://git-lfs.github.com/spec/v1\n');
    await assert.rejects(verifyWorkspace(root), /SHA-256 mismatch/);
    await fs.rm(file);
    await assert.rejects(verifyWorkspace(root), /ENOENT/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
