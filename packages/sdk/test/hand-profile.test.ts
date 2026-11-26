import assert from 'node:assert/strict';
import test from 'node:test';
import { handProfile, HAND_APPEARANCE_DEFAULTS, HAND_APPEARANCE_RANGES } from '../src/hand-profile.ts';

test('portable Hands defaults are exact and overrides remain absent', () => {
  assert.deepEqual(handProfile(), { version: 1, offsetMm: { x: 0, y: 0, z: 0 }, sizeFactor: 1, appearance: {} });
  assert.deepEqual(HAND_APPEARANCE_DEFAULTS.jointColorLinear, [0, .541, 1]);
  assert.deepEqual(HAND_APPEARANCE_DEFAULTS.boneColorLinear, [0, .482, 1]);
  assert.equal(HAND_APPEARANCE_DEFAULTS.opacity, .333);
  assert.deepEqual(handProfile({ appearance: HAND_APPEARANCE_DEFAULTS }).appearance, HAND_APPEARANCE_DEFAULTS);
});
test('all profile fields reject wrong types/nonfinite/out of bounds with field reasons', () => {
  for (const axis of ['x', 'y', 'z']) for (const value of [NaN, Infinity, -151, 151, '1', null])
    assert.throws(() => handProfile({ offsetMm: { [axis]: value } }), new RegExp(`offsetMm.${axis}`));
  for (const value of [NaN, Infinity, .49, 1.51, '1', null]) assert.throws(() => handProfile({ sizeFactor: value }), /sizeFactor/);
  for (const [field, [min, max]] of Object.entries(HAND_APPEARANCE_RANGES)) {
    for (const value of [min, max]) assert.equal(handProfile({ appearance: { [field]: value } }).appearance[field], value);
    for (const value of [min - .1, max + .1, NaN, Infinity, '1', null]) assert.throws(() => handProfile({ appearance: { [field]: value } }), new RegExp(field));
  }
  for (const field of ['jointColorLinear', 'boneColorLinear', 'indicatorColorLinear'])
    for (const value of [[], [0, 1], [0, 1, 2], [NaN, 0, 0], 'blue']) assert.throws(() => handProfile({ appearance: { [field]: value } }), new RegExp(field));
  for (const field of ['showJoints', 'showBones', 'showPinchGrabIndicator'])
    for (const value of [0, 1, 'true', null]) assert.throws(() => handProfile({ appearance: { [field]: value } }), new RegExp(field));
});
