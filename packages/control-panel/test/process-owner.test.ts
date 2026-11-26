import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownProcessBirth, processBirth, recordedOwnerAlive } from '../src/process-owner.ts';

test('live generations are preserved, reused PIDs are not mistaken for the exited writer', async () => {
  assert.equal(await recordedOwnerAlive(42, '100', async () => '100', () => true), true);
  assert.equal(await recordedOwnerAlive(42, '100', async () => '200', () => true), false);
  assert.equal(await recordedOwnerAlive(42, '100', async () => '', () => true), false);
});
test('unavailable identity and legacy records never authorize removing an apparently live lock', async () => {
  assert.equal(await recordedOwnerAlive(42, '100', async () => null, () => true), true);
  assert.equal(await recordedOwnerAlive(42, '100', async () => null, () => false), false);
  assert.equal(await recordedOwnerAlive(42, undefined, async () => '200', () => true), true);
  assert.equal(await recordedOwnerAlive(42, undefined, async () => '200', () => false), false);
});
test('the OS reports a stable generation for this live writer', async () => {
  const birth = await ownProcessBirth();
  if (process.platform === 'win32' || process.platform === 'linux') assert.match(birth!, /^\d+$/);
  if (birth) {
    assert.equal(await processBirth(process.pid), birth);
    assert.equal(await recordedOwnerAlive(process.pid, birth), true);
    assert.equal(await recordedOwnerAlive(process.pid, `${birth}0`), false);
  }
});
