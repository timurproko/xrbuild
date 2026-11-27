import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandsSession } from '../ui/hands-session.js';
import { handProfile } from '../../sdk/src/hand-profile.ts';
const id = '12345678-1234-1234-1234-123456789abc';
function fixture(hangStatus = false) {
  let busy = false, loseReply = false;
  const statuses: any[] = [];
  const profile = { version: 1, runId: id, sequence: 0, revision: 'r', profile: handProfile() };
  const view = { profile: handProfile(), active: false, async setProfile() { return true; }, beginSession() { this.active = true; return true; }, clearSession() { this.active = false; }, clearHands() {}, pushFrame() { return true; } };
  const session = createHandsSession({ view, requestTimeoutMs: 20, frame: () => 1, cancel: () => {}, decode: () => null, Socket: class { close() {} }, onStatus: (s: any) => statuses.push(s), fetcher: async (url: string) => {
    const action = url.split('/session')[1];
    if (loseReply && (action === '/stop' || action === '/status' && hangStatus)) return new Promise(() => {});
    if (!action) busy = true;
    return { ok: true, json: async () => action === '/bootstrap' ? { capability: 'c'.repeat(64) } : { owns: true, busy, phase: busy ? 'running' : 'stopped', sessionId: id, epoch: 'a'.repeat(64), observer: 'd'.repeat(64), url: 'ws://127.0.0.1:2222/hands', profile } };
  } });
  return { session, view, statuses, set busy(value: boolean) { busy = value; }, set loseReply(value: boolean) { loseReply = value; } };
}
test('lost Stop response reconciles completed service cleanup before terminal notification', async () => {
  const f = fixture();
  try {
    await f.session.start({}); f.loseReply = true; f.busy = false;
    await f.session.stop();
    assert.equal(f.session.active, false); assert.equal(f.session.stopping, false); assert.equal(f.session.blocked, false);
    assert.equal(f.view.active, false); assert.match(f.statuses.at(-1).reason, /timed out/);
  } finally { f.session.dispose(); }
});
test('unanswered Stop/status settles to retryable cleanup, never claims safe Start until service death is verified', async () => {
  const f = fixture(true);
  try {
    await f.session.start({}); f.loseReply = true;
    await f.session.stop();
    assert.equal(f.session.stopping, false); assert.equal(f.session.blocked, true); assert.equal(f.statuses.at(-1).cleanupPending, true);
    await assert.rejects(f.session.start({}), /Stop the active/);
    f.loseReply = false; f.busy = false; await f.session.status();
    assert.equal(f.session.blocked, false); assert.equal(f.session.stopping, false);
    await f.session.start({}); assert.equal(f.session.active, true);
    f.busy = false; await f.session.stop();
  } finally { f.session.dispose(); }
});
