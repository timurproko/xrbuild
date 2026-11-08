import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeValueSha256} from '../bridge/runtime.mjs';

test('runtime text provenance is stable across checkout line endings while binaries remain exact',()=>{
  assert.equal(runtimeValueSha256('apriltag-LICENSE.md',Buffer.from('one\ntwo\n')),runtimeValueSha256('apriltag-LICENSE.md',Buffer.from('one\r\ntwo\r\n')));
  assert.notEqual(runtimeValueSha256('hand-tracking-rgbd.exe',Buffer.from('one\ntwo\n')),runtimeValueSha256('hand-tracking-rgbd.exe',Buffer.from('one\r\ntwo\r\n')));
});
