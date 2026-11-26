import assert from 'node:assert/strict';
import test from 'node:test';
import { handsEditorRevisions } from '../ui/hands-editor-revisions.js';
import { LiveHands, HAND_PROFILE_ACK_TIMEOUT_MS } from '../src/hands-live.ts';
import { handProfile } from '../../sdk/src/hand-profile.ts';

const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64);
test('revision histories distinguish incorporated own notifications from concurrent foreign edits', () => {
  const editor = handsEditorRevisions(); editor.incorporate(a, true);
  assert.equal(editor.changed(a), false);
  editor.changed(b); assert.equal(editor.stale, true); editor.incorporate(b); assert.equal(editor.stale, false);
  assert.equal(editor.changed(b), false);
  assert.equal(editor.changed(a), true, 'an actual return to an older hash is still a foreign change');
  editor.incorporate(b, true);
  editor.changed(c); editor.incorporate(b); assert.equal(editor.stale, true, 'own response must not clear a later foreign notification');
  editor.incorporate(c, true); assert.equal(editor.stale, false);
  const picker = handsEditorRevisions(); picker.incorporate(a, true);
  editor.incorporate(b); assert.equal(picker.changed(b), true, 'independent adjustment history cannot review a stale source picker');
  editor.changed(undefined); assert.equal(editor.stale, true, 'unversioned notices require review, not guessing');
  const review = editor.reviewToken(); editor.changed('d'.repeat(64));
  editor.incorporate(c, review); assert.equal(editor.stale, true, 'a notification arriving during Reload is not silently reviewed by an older response');
});
test('deadlines are sequence-bound, recover on late current ACK and cannot mutate retired runs', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const live = new LiveHands(handProfile(), a), original = live.envelope;
  t.mock.timers.tick(2000); live.update(handProfile({ sizeFactor: .8 }), b); const updated = live.envelope;
  t.mock.timers.tick(1000); assert.equal(live.deliveryState, 'pending', 'sequence-zero deadline was replaced');
  t.mock.timers.tick(HAND_PROFILE_ACK_TIMEOUT_MS - 1000); assert.equal(live.deliveryState, 'failed');
  assert.equal(live.acknowledge(original), false); assert.equal(live.deliveryState, 'failed');
  assert.equal(live.acknowledge(updated), true); assert.equal(live.deliveryState, 'applied');
  live.fail('late transport error'); assert.equal(live.deliveryState, 'applied', 'an observed ACK cannot be overwritten by a losing timeout');
  live.update(handProfile(), c); live.close();
  t.mock.timers.tick(HAND_PROFILE_ACK_TIMEOUT_MS); assert.equal(live.deliveryState, 'pending');
  assert.equal(live.acknowledge(live.envelope), false);
  const initial = new LiveHands(handProfile(), a);
  t.mock.timers.tick(HAND_PROFILE_ACK_TIMEOUT_MS); assert.equal(initial.deliveryState, 'failed', 'old bundles also get a deadline before any Apply');
  assert.equal(initial.acknowledge(initial.envelope), true); assert.equal(initial.deliveryState, 'applied'); initial.close();
});
