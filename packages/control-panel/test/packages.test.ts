import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PackageList, readZipEntry } from '../src/packages.ts';

test('lists zips with their identity, caches by size and time', async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), 'panel-out-'));
  await fs.mkdir(path.join(out, 'desktop'));
  await fs.mkdir(path.join(out, 'cx'));
  await fs.writeFile(path.join(out, 'desktop', 'Demo App.zip'), 'zip-a');
  await fs.writeFile(path.join(out, 'cx', 'Demo App.zip'), 'zip-c');
  await fs.writeFile(path.join(out, 'Broken.zip'), 'zip-b');
  await fs.writeFile(path.join(out, 'notes.txt'), 'not a zip');
  let reads = 0;
  const list = new PackageList(out, async (zip) => {
    reads++;
    if (zip.endsWith('Broken.zip')) throw new Error('not a zip');
    return JSON.stringify({ id: 'Demo App', title: 'Demo App', version: zip.includes(`${path.sep}cx${path.sep}`) ? '9.0.0' : '0.1.1' });
  });
  const pkgs = await list.list();
  assert.deepEqual(pkgs.map((p) => `${p.channel}:${p.file}`).sort(), [':Broken.zip', 'cx:Demo App.zip', 'desktop:Demo App.zip']);
  const hp = pkgs.find((p) => p.channel === 'desktop' && p.file === 'Demo App.zip')!;
  assert.equal(hp.channel, 'desktop');
  assert.equal(hp.version, '0.1.1');
  assert.equal(hp.sizeBytes, 5);
  assert.match(pkgs.find((p) => p.file === 'Broken.zip')!.error!, /cannot read/);
  assert.equal(await list.versionOf('Demo App', 'desktop'), '0.1.1');
  assert.equal(await list.versionOf('Demo App', 'cx'), '9.0.0');
  assert.equal(reads, 3, 'second listing came from the cache');
  await fs.writeFile(path.join(out, 'desktop', 'Demo App.zip'), 'zip-a2');
  await list.list();
  assert.equal(reads, 4, 'changed zip is read again');
  assert.equal(await list.delete('desktop', 'Demo App.zip'), true);
  await assert.rejects(fs.access(path.join(out, 'desktop', 'Demo App.zip')));
  assert.equal(await list.delete('desktop', 'Demo App.zip'), false);
  assert.equal(await list.delete('../desktop', 'Broken.zip'), false, 'paths outside builds are refused');
  assert.equal(await list.delete('', '../Broken.zip'), false, 'file paths outside builds are refused');
  assert.equal(await list.delete('', 'notes.txt'), false, 'only listed package files can be deleted');
});

test('reads package.json of a real package zip with Windows tar', { skip: process.platform !== 'win32' }, async (t) => {
  const builds = path.resolve(import.meta.dirname, '../../../builds');
  const name = (await fs.readdir(builds).catch(() => [] as string[])).find((f) => f.endsWith('.zip'));
  if (!name) return t.skip('no package in builds/ on this machine');
  const pkg = JSON.parse(await readZipEntry(path.join(builds, name), 'package.json'));
  assert.ok(typeof pkg.id === 'string' && pkg.id.length > 0);
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
});
