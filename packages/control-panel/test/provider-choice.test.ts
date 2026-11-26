import assert from 'node:assert/strict';
import test from 'node:test';
import { logicalInputNames } from '../ui/provider-choice.js';

test('input choices expose only Mouse, Keyboard and Hand, collapsing all saved provider names', () => {
  assert.deepEqual(logicalInputNames(['mouse', 'tracker', 'another', 'simulated', 'replay', 'keyboard']), ['mouse', 'hand', 'keyboard']);
  assert.deepEqual(logicalInputNames(['unknown-provider']), ['hand']);
  assert.deepEqual(logicalInputNames(['none', '', 'mouse', 'mouse']), ['mouse']);
  assert.deepEqual(logicalInputNames([]), []);
});
