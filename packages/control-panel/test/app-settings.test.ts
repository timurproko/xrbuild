import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readAppSettings, saveAppSettings } from '../src/app-settings.ts';

test('Apps cursor preference persists, rejects invalid writes and preserves unrelated fields', async () => {
  const artifacts = path.resolve(import.meta.dirname, '../../../.artifacts');
  await fs.mkdir(artifacts, { recursive: true });
  const workspace = await fs.mkdtemp(path.join(artifacts, 'app-settings-'));
  try {
    assert.deepEqual(await readAppSettings(workspace), { cursor: 'system' });
    for (const cursor of ['system', 'ring', 'ring-dot']) {
      await saveAppSettings(workspace, { cursor });
      assert.equal((await readAppSettings(workspace)).cursor, cursor);
    }
    const file = path.join(workspace, '.xrb/app-settings.json');
    await fs.writeFile(file, JSON.stringify({ cursor: 'old-style', unrelated: 42 }));
    assert.equal((await readAppSettings(workspace)).cursor, 'system');
    await saveAppSettings(workspace, { cursor: 'ring' });
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { cursor: 'ring', unrelated: 42 });
    for (const invalid of [null, [], {}, { cursor: 'bad' }, { cursor: 'system', another: 1 }]) await assert.rejects(saveAppSettings(workspace, invalid));
    assert.equal((await readAppSettings(workspace)).cursor, 'ring');
  } finally { await fs.rm(workspace, { recursive: true, force: true }); }
});
