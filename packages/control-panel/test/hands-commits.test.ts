import assert from 'node:assert/strict';
import test from 'node:test';
import { commitHandsFields, handsWriteQueue } from '../ui/hands-commits.js';

const initial = { revision: 'one', selected: 'tracker', x: 0, y: 0 };
const read = (state: any, field: string) => state[field];
test('finished-field commits rebase unrelated changes, reject same-field conflicts and never order hashes', async () => {
  let current = { ...initial, revision: 'older-hash', y: 15 }, writes = 0;
  const save = async (base: any, changes: any) => { assert.equal(base.revision, current.revision); writes++; current = { ...base, ...changes, revision: 'saved' }; return current; };
  const result = await commitHandsFields({ base: initial, changes: { x: 20 }, load: async () => current, save, read });
  assert.equal(result.x, 20); assert.equal(result.y, 15); assert.equal(writes, 1);
  current = { ...initial, revision: initial.revision, x: 30 };
  await assert.rejects(commitHandsFields({ base: initial, changes: { x: 40 }, load: async () => current, save, read }), (error: any) => error.current.x === 30 && error.fields[0] === 'x');
  assert.equal(writes, 1);
});
test('revision races retry boundedly but unsafe, busy and transport failures stay retryable', async () => {
  let attempts = 0;
  const conflict = Object.assign(new Error('Hands profile changed; reload before saving'), { status: 409 });
  await assert.rejects(commitHandsFields({ base: initial, changes: { x: 20 }, load: async () => initial, read, save: async () => { attempts++; throw conflict; } }), /changed/);
  assert.equal(attempts, 3);
  for (const message of ['Hands profile is unsafe', 'Wait for launch', 'Network error']) {
    attempts = 0;
    await assert.rejects(commitHandsFields({ base: initial, changes: { x: 20 }, load: async () => initial, read, save: async () => { attempts++; throw Object.assign(new Error(message), { status: 409 }); } }), new RegExp(message));
    assert.equal(attempts, 1);
  }
});
test('local source and adjustment writes serialize even after rejection', async () => {
  const enqueue = handsWriteQueue(), seen: number[] = [];
  let release!: () => void;
  const first = enqueue(async () => { seen.push(1); await new Promise<void>(resolve => release = resolve); throw new Error('failed'); });
  const second = enqueue(async () => { seen.push(2); return 42; });
  await Promise.resolve(); assert.deepEqual(seen, [1]); release();
  await assert.rejects(first, /failed/); assert.equal(await second, 42); assert.deepEqual(seen, [1, 2]);
});
