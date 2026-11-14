import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOwnershipExclusion, recheckOwnershipExclusion, ownershipExclusionSignal, withA1OwnershipExclusion } from './ownership-exclusion.mjs';

test('serialized owner/generation assertions cannot mint a scoped ownership capability', async () => {
  for (const forged of [{}, { owned: true }, { state: 'available', generation: 'caller-asserted', target: 'fixture' }]) {
    assert.throws(() => assertOwnershipExclusion(forged, {}), /missing, expired or bound/);
    await assert.rejects(() => recheckOwnershipExclusion(forged, {}), /missing, expired or bound/);
    assert.throws(() => ownershipExclusionSignal(forged), /Expired/);
  }
});

test('missing supported facility never invokes execution or discovers installed user state', async () => {
  let calls = 0;
  await assert.rejects(() => withA1OwnershipExclusion({ runtime: {}, options: {}, context: {} }, () => calls++), /facility unavailable/);
  assert.equal(calls, 0);
});
