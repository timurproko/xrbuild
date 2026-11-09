import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, valid, renderable, SCENARIOS } from '../src/synthetic.ts';

test('shared authored pose has stable IDs, panel-metre wrist positions and mirrored hands', () => {
  const hands = generate('stationary', 0);
  assert.equal(hands.length, 2);
  assert.deepEqual(hands.map(h => h.id), [1, 2]);
  assert.deepEqual(hands[0].keypoints[0], [-0.11, -0.08, 0.07]);
  for (const hand of hands) { assert.equal(hand.keypoints.length, 21); assert.ok(valid(hand)); }
  for (let k = 0; k < 21; k++) assert.ok(Math.abs(hands[0].keypoints[k][0] + hands[1].keypoints[k][0]) < 1e-9);
  assert.deepEqual(hands, generate('stationary', 100));
});
test('every scenario is reproducible and generated arrays do not alias', () => {
  for (const scenario of SCENARIOS) {
    assert.deepEqual(generate(scenario, 3.5), generate(scenario, 3.5));
    const changed = generate(scenario, 1);
    changed[0].keypoints[0][0] = 999;
    assert.notEqual(generate(scenario, 1)[0].keypoints[0][0], 999);
  }
});
test('motion and authored pinch stay valid over a full sequence', () => {
  for (let tick = 0; tick < 720; tick++) assert.ok(generate('motion', tick / 60).every(valid));
  const pinch = generate('motion', 3.5)[0];
  assert.ok(Math.abs(pinch.keypoints[4][0] - pinch.keypoints[8][0] - 0.012) < 1e-9);
  assert.deepEqual(pinch.pinch, [false, false, false, false], 'provider must not claim native pinch');
});
test('teleport, dropout and invalid-pose boundaries are explicit', () => {
  assert.ok(Math.abs(generate('teleport', 2)[0].keypoints[0][0] - generate('teleport', 1.999)[0].keypoints[0][0] - 0.16) < 1e-9);
  assert.equal(generate('dropout', 1.999).length, 2);
  assert.equal(generate('dropout', 2).length, 0);
  assert.equal(generate('dropout', 3).length, 2);
  assert.ok(generate('invalid', 1).every(valid));
  assert.ok(generate('invalid', 2).every(h => !valid(h)));
});
test('bad times, partial/NaN positions and invalid hand counts are rejected', () => {
  for (const time of [-1, NaN, Infinity]) assert.throws(() => generate('motion', time));
  for (const count of [0, 3, 1.5]) assert.throws(() => generate('motion', 0, count));
  const [hand] = generate('stationary', 0);
  hand.keypoints[0][0] = NaN; assert.equal(valid(hand), false); assert.equal(renderable(hand), false);
  const [implausible] = generate('invalid', 2.5); assert.equal(renderable(implausible), true, 'finite invalid geometry can be shown diagnostically');
  const [partial] = generate('stationary', 0); partial.scores[0] = 0; assert.equal(valid(partial), false);
});
