import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { logicalInputNames } from '../ui/provider-choice.js';

test('input choices retain hand values while collapsing all saved provider names', () => {
  assert.deepEqual(logicalInputNames(['mouse', 'tracker', 'another', 'simulated', 'replay', 'keyboard']), ['mouse', 'hand', 'keyboard']);
  assert.deepEqual(logicalInputNames(['unknown-provider']), ['hand']);
  assert.deepEqual(logicalInputNames(['none', '', 'mouse', 'mouse']), ['mouse']);
  assert.deepEqual(logicalInputNames([]), []);
});

test('Apps maps the retained hand value to Hands, including unavailable display', async () => {
  const app = await fs.readFile(new URL('../ui/app.js', import.meta.url), 'utf8');
  assert.match(app, /hand: available \? 'Hands' : 'Hands \(unavailable\)'/);
  assert.doesNotMatch(app, /hand: available \? 'Hand'/);
});
