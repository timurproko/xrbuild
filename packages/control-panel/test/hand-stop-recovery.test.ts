import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandsSession } from '../ui/hands-session.js';
import { handProfile } from '../../sdk/src/hand-profile.ts';
const id = '12345678-1234-1234-1234-123456789abc';
function fixture(hangStatus = false, requestTimeoutMs = 20) {
  let busy = false, loseReply = false, failStop = false, holdStatus = false, releaseStatus: (() => void) | undefined;
  let holdStart = false, releaseStart: (() => void) | undefined;
  const statuses: any[] = [];
  const profile = { version: 1, runId: id, sequence: 0, revision: 'r', profile: handProfile() };
  const view = { profile: handProfile(), active: false, async setProfile() { return true; }, beginSession() { this.active = true; return true; }, clearSession() { this.active = false; }, clearHands() {}, pushFrame() { return true; } };
  const session = createHandsSession({ view, requestTimeoutMs, frame: () => 1, cancel: () => {}, decode: () => null, Socket: class { close() {} }, onStatus: (s: any) => statuses.push(s), fetcher: async (url: string) => {
    const action = url.split('/session')[1];
    if (failStop && action === '/stop') throw new Error('Fixture Stop reply lost');
    if (loseReply && (action === '/stop' || action === '/status' && hangStatus)) return new Promise(() => {});
    if (!action) { if (holdStart) { holdStart = false; await new Promise<void>(resolve => { releaseStart = resolve; }); } busy = true; }
    if (action === '/stop') busy = false;
    const value = action === '/bootstrap' ? { capability: 'c'.repeat(64) } : { owns: busy, busy, phase: busy ? 'running' : 'stopped', sessionId: busy ? id : null, epoch: 'a'.repeat(64), observer: 'd'.repeat(64), url: 'ws://127.0.0.1:2222/hands', profile };
    const response = { ok: true, json: async () => value };
    if (action === '/status' && holdStatus) { holdStatus = false; return new Promise(resolve => { releaseStatus = () => resolve(response); }); }
    return response;
  } });
  return { session, view, statuses, holdStart() { holdStart = true; }, releaseStart() { releaseStart?.(); }, get heldStart() { return !!releaseStart; }, holdStatus() { holdStatus = true; }, releaseStatus() { releaseStatus?.(); }, get held() { return !!releaseStatus; }, set busy(value: boolean) { busy = value; }, set loseReply(value: boolean) { loseReply = value; }, set failStop(value: boolean) { failStop = value; } };
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
test('Stop waits for a Start not yet registered by the service, then joins it before offering Start again', async () => {
  const f = fixture();
  try {
    f.holdStart(); const starting = f.session.start({});
    while (!f.heldStart) await new Promise(r => setTimeout(r, 1));
    let ended = false; const stopping = f.session.stop().then(() => { ended = true; });
    await new Promise(r => setTimeout(r, 5)); assert.equal(ended, false, 'idle status is not proof an in-flight Start cannot launch');
    assert.equal(f.session.stopping, true);
    f.releaseStart(); await starting; await stopping;
    assert.equal(f.session.active, false); assert.equal(f.session.stopping, false); assert.equal(f.session.blocked, false);
  } finally { f.releaseStart(); f.session.dispose(); }
});

test('a delayed idle status cannot declare a newer unresolved worker released', async () => {
  const f = fixture(false, 1000);
  try {
    f.holdStatus(); const stale = f.session.status();
    while (!f.held) await new Promise(r => setTimeout(r, 1));
    await f.session.start({}); f.failStop = true; await f.session.stop();
    assert.equal(f.session.blocked, true);
    f.releaseStatus(); await stale;
    assert.equal(f.session.blocked, true, 'old idle reply is not evidence about the newer owned worker');
    f.failStop = false; f.busy = false; await f.session.status(); assert.equal(f.session.blocked, false);
  } finally { f.releaseStatus(); f.session.dispose(); }
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
