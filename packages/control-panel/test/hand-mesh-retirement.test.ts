import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HandMeshRetirement } from '../src/hand-mesh-retirement.ts';
const tick = () => new Promise(r => setTimeout(r, 0));

test('shared retirement coalesces pending verification and never forgets a failed owner', async () => {
  const fence = new HandMeshRetirement(); let fail = true, calls = 0;
  const run = { stop: async () => { calls++; if (fail) throw new Error('unverified'); } } as any;
  const a = fence.retire(run), b = fence.drain(); assert.equal(fence.blocked, true); assert.equal(a, b);
  assert.equal(await a, false); assert.equal(calls, 1); assert.equal(fence.cleanupFailed, true);
  await tick(); assert.equal(calls, 1, 'no background retry-to-green loop');
  fail = false; assert.equal(await fence.drain(), true); assert.equal(calls, 2); assert.equal(fence.blocked, false);
});

test('a second owner retires credentials immediately even while the previous tree is joining', async () => {
  const fence = new HandMeshRetirement(); let finish: () => void = () => {}, stopped = false;
  const old = { stop: () => new Promise<void>(r => { finish = r; }) } as any;
  const newer = { stop: async () => { stopped = true; } } as any;
  const first = fence.retire(old), second = fence.retire(newer);
  assert.equal(stopped, true); assert.equal(fence.blocked, true);
  finish(); assert.equal(await first, true); assert.equal(await second, true); assert.equal(fence.blocked, false);
});
