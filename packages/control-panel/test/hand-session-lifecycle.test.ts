import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { HandSessions } from '../src/hand-session.ts';
import { createHandsSession } from '../ui/hands-session.js';
import { handProfile } from '../../sdk/src/hand-profile.ts';
const delay = (ms = 5) => new Promise<void>(r => setTimeout(r, ms));
const selection = { provider: { owner: 'core', id: 'simulated' }, revision: 'a'.repeat(64), registryRevision: 'registry' };
async function until(check: () => boolean) { for (let i = 0; i < 200; i++) { if (check()) return; await delay(); } assert.fail('Lifecycle transition did not settle'); }
/** OS/ABI coverage lives in native tests; these fakes make every service await/deadline controllable. */
async function fixture(t: any, heartbeatMs = 1000000) {
  let now = 0, origin = '', acquired = 0, released = 0, reserved = 0, reservationClosed = 0, bootstraps = 0;
  let mode = 'running', finishPrepare: any, finishReserve: any;
  t.mock.method(performance, 'now', () => now);
  const children: any[] = [], sockets: any[] = [], statuses: any[] = [];
  const prepared = { workerExe: 'fixture/xrb-provider-session.exe', helperExe: 'fixture/xrb-acquisition.exe', runtimeName: 'simulated', config: {}, source: { owner: 'core', id: 'simulated', label: 'Synthetic', version: '1' }, profile: handProfile(), revision: selection.revision };
  const reservation = () => ({ ticket: 'b'.repeat(64), async handoff() {}, async close() { reservationClosed++; } });
  const service = new HandSessions({ origin: () => origin, platform: 'win32', heartbeatMs,
    acquire: () => { acquired++; return () => { released++; }; },
    prepare: async () => mode === 'preparing' ? new Promise(r => { finishPrepare = () => r(prepared); }) : prepared,
    reserve: (async () => { reserved++; return mode === 'reserving' ? new Promise(r => { finishReserve = () => r(reservation()); }) : reservation(); }) as any,
    spawn: (() => {
      const child: any = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.closed = false; child.killed = 0;
      child.exit = () => { if (!child.closed) { child.closed = true; child.stdout.end(); child.stderr.end(); child.emit('close', 0, null); } };
      child.stdin = new Writable({ write(_data, _encoding, callback) {
        if (mode !== 'starting') child.stdout.write('@provider ' + JSON.stringify({ phase: 'running', url: 'ws://127.0.0.1:2222/hands' }) + '\n'); callback();
      } });
      child.stdin.on('finish', () => { if (!['hang-stop', 'join-pending'].includes(mode)) child.exit(); }); child.kill = () => { child.killed++; child.exit(); };
      children.push(child); return child;
    }) as any,
  });
  const server = http.createServer((req, res) => { void service.handle(req, res).catch(e => { res.writeHead(e.status ?? 500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message, details: e.details })); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (action: string, body: object, capability = '') => {
    const response = await fetch(origin + '/api/hands/session' + action, { method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin', 'x-xrb-hands': '1', authorization: `Bearer ${capability}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const client = (intercept?: (url: string, next: () => Promise<Response>) => Promise<Response>) => {
    const view = { active: false, replaying: false, profile: handProfile(), clears: 0, async setProfile(p: any) { this.profile = p; return true; }, beginSession() { this.active = true; return true; }, clearSession() { this.active = false; this.clears++; }, clearHands() {}, pushFrame() { return true; } };
    class Socket { readyState = 1; constructor() { sockets.push(this); } close() {} send() {} }
    const session = createHandsSession({ view, Socket, decode: () => null, frame: () => 1, cancel: () => {}, onStatus: (s: any) => statuses.push(s),
      fetcher: (url: string, options: any) => { if (url.endsWith('/bootstrap')) bootstraps++; const next = () => fetch(origin + url, { ...options, headers: { ...options.headers, origin, 'sec-fetch-site': 'same-origin' } }); return intercept ? intercept(url, next) : next(); } });
    return { session, view };
  };
  return { service, call, client, children, sockets, statuses,
    set mode(value: string) { mode = value; }, advance(ms: number) { now += ms; },
    get acquired() { return acquired; }, get released() { return released; }, get reserved() { return reserved; }, get reservationClosed() { return reservationClosed; }, get bootstraps() { return bootstraps; },
    finishPrepare() { finishPrepare?.(); }, finishReserve() { finishReserve?.(); },
    async close() { mode = 'running'; children.forEach(c => c.exit()); await service.close(); await new Promise<void>(r => server.close(() => r())); },
  };
}
for (const phase of ['preparing', 'reserving', 'starting', 'running']) test(`Stop during ${phase} drains ownership once and the next explicit Start succeeds`, async t => {
  const f = await fixture(t);
  try {
    const owner = (await f.call('/bootstrap', {})).body.capability; f.mode = phase;
    const starting = f.call('', selection, owner);
    await until(() => phase === 'preparing' ? f.acquired === 1 : phase === 'reserving' ? f.reserved === 1 : f.children.length === 1);
    const status = f.service.status(owner);
    if (phase === 'running') assert.equal((await starting).status, 200);
    const stopping = f.call('/stop', { sessionId: status.sessionId }, owner);
    await until(() => f.service.status(owner).phase === 'stopping' || !f.service.busy);
    if (phase === 'preparing') f.finishPrepare(); if (phase === 'reserving') f.finishReserve();
    await stopping; await starting;
    assert.equal(f.service.busy, false); assert.equal(f.released, 1); assert.equal(f.children.every(c => c.closed), true);
    f.mode = 'running'; const again = await f.call('', selection, owner); assert.equal(again.status, 200, again.body.error);
    await f.call('/stop', { sessionId: again.body.sessionId }, owner); assert.equal(f.released, 2); assert.equal(f.service.busy, false);
  } finally { await f.close(); }
});
for (const phase of ['starting', 'running']) test(`worker crash during ${phase} releases and permits explicit restart`, async t => {
  const f = await fixture(t);
  try {
    const owner = (await f.call('/bootstrap', {})).body.capability; f.mode = phase;
    const starting = f.call('', selection, owner); await until(() => f.children.length === 1);
    if (phase === 'running') await starting;
    f.children[0].exit(); await starting; await until(() => !f.service.busy);
    assert.equal(f.released, 1); assert.equal(f.service.status(owner).phase, 'failed');
    f.mode = 'running'; const again = await f.call('', selection, owner); assert.equal(again.status, 200);
    await f.call('/stop', { sessionId: again.body.sessionId }, owner); assert.equal(f.released, 2);
  } finally { await f.close(); }
});
test('startup timeout and hung Stop terminate only the owned child, verify closure, and permit restart', async t => {
  const f = await fixture(t);
  try {
    const owner = (await f.call('/bootstrap', {})).body.capability; f.mode = 'starting';
    const starting = f.call('', selection, owner); await until(() => f.children.length === 1); f.advance(30001);
    assert.equal((await starting).status, 409); assert.equal(f.service.busy, false); assert.equal(f.released, 1);
    f.mode = 'hang-stop'; const running = await f.call('', selection, owner); assert.equal(running.status, 200);
    const stopping = f.call('/stop', { sessionId: running.body.sessionId }, owner);
    await until(() => f.service.status(owner).phase === 'stopping'); f.advance(13001); await stopping;
    assert.equal(f.children[1].killed, 1); assert.equal(f.service.busy, false); assert.equal(f.released, 2);
    f.mode = 'running'; const again = await f.call('', selection, owner); assert.equal(again.status, 200);
    await f.call('/stop', { sessionId: again.body.sessionId }, owner); assert.equal(f.released, 3);
  } finally { await f.close(); }
});
test('failure retires admission but retains ownership until exact supervisor join and launcher close', async t => {
  const f = await fixture(t);
  try {
    const owner = (await f.call('/bootstrap', {})).body.capability;
    const run = await f.call('', selection, owner); assert.equal(run.status, 200);
    f.mode = 'join-pending'; const child = f.children[0];
    child.stdout.write('@provider ' + JSON.stringify({ phase: 'acquiring', pid: 1234567 }) + '\n');
    child.stdout.write('@provider ' + JSON.stringify({ phase: 'failed', reason: 'Tracking stalled: no usable frames' }) + '\n');
    await until(() => f.service.status(owner).phase === 'stopping');
    assert.equal(f.released, 0); assert.equal(f.service.busy, true);
    assert.equal((await f.call('', selection, owner)).status, 409, 'cannot offer overlapping acquisition');
    child.stdout.write('@provider ' + JSON.stringify({ phase: 'joined', pid: 7654321 }) + '\n');
    assert.equal(f.released, 0, 'wrong designated process receipt cannot release');
    child.stdout.write('@provider ' + JSON.stringify({ phase: 'joined', pid: 1234567 }) + '\n'); child.exit();
    await until(() => !f.service.busy); assert.equal(f.released, 1); assert.match(f.service.status(owner).reason, /Tracking stalled/);
    f.mode = 'running'; assert.equal((await f.call('', selection, owner)).status, 200);
  } finally { await f.close(); }
});

test('expired credentials are rejected without mutating even their old acquisition; only lifecycle teardown releases it', async t => {
  const f = await fixture(t);
  try {
    const owner = (await f.call('/bootstrap', {})).body.capability, running = await f.call('', selection, owner); assert.equal(running.status, 200);
    f.advance(61001); const expired = await f.call('/stop', { sessionId: running.body.sessionId }, owner);
    assert.equal(expired.status, 403); assert.equal(expired.body.details.code, 'hands-page-capability-expired');
    assert.equal(f.service.busy, true); assert.equal(f.service.status().phase, 'running'); assert.equal(f.released, 0);
    f.children[0].exit(); await until(() => !f.service.busy); assert.equal(f.released, 1);
    const fresh = (await f.call('/bootstrap', {})).body.capability, restarted = await f.call('', selection, fresh); assert.equal(restarted.status, 200);
    await f.call('/stop', { sessionId: restarted.body.sessionId }, fresh); assert.equal(f.released, 2);
  } finally { await f.close(); }
});

test('idle capability expiry renews once through the real HTTP service and Start works without reload', async t => {
  const f = await fixture(t), { session } = f.client();
  try {
    await session.stop(); assert.equal(f.acquired, 0); await session.status(); assert.equal(f.bootstraps, 1);
    f.advance(61001);
    await Promise.all([session.status(), session.status()]); await session.status();
    assert.equal(f.bootstraps, 2, 'concurrent expired responses share one bootstrap'); assert.equal(f.acquired, 0);
    await session.start(selection); assert.equal(session.active, true); await session.stop();
    assert.equal(f.service.busy, false); assert.equal(f.released, 1);
    f.advance(61001); await session.start(selection); assert.equal(session.active, true, 'Start preflight also renews an idle expired page'); await session.stop(); assert.equal(f.released, 2);
  } finally { session.dispose(); await f.close(); }
});
test('late expiry reply for the old capability cannot retire a replacement session', async t => {
  const f = await fixture(t); let hold = false, release!: () => void;
  const { session } = f.client(async (url, next) => {
    const shouldHold = hold && url.endsWith('/status'); if (shouldHold) hold = false;
    const response = await next(); if (!shouldHold) return response;
    return new Promise(resolve => { release = () => resolve(response); });
  });
  try {
    await session.status(); f.advance(61001); hold = true;
    const stale = session.status(); await until(() => !!release);
    await session.status(); await session.start(selection); assert.equal(session.active, true);
    release(); await stale; assert.equal(session.active, true); assert.equal(f.released, 0); assert.equal(f.bootstraps, 2);
    await session.stop(); assert.equal(f.released, 1);
  } finally { release?.(); session.dispose(); await f.close(); }
});

test('suspended active page retires old frames before renewing and ignores old socket errors after restart', async t => {
  const f = await fixture(t, 5000), { session, view } = f.client();
  try {
    await session.start(selection); const old = f.sockets[0]; assert.equal(session.active, true);
    f.advance(61001); const resumed = await session.status();
    assert.equal(session.active, false); assert.equal(view.active, false); assert.ok(view.clears > 0); assert.equal(resumed.owns, false);
    await until(() => !f.service.busy); assert.equal(f.released, 1); assert.equal(f.bootstraps, 2);
    await session.start(selection); assert.equal(session.active, true);
    old.onerror(); old.onclose(); await delay(20); assert.equal(session.active, true, 'retired socket cannot stop the replacement session');
    await session.stop(); assert.equal(f.service.busy, false); assert.equal(f.released, 2);
  } finally { session.dispose(); await f.close(); }
});
test('tab suspension past heartbeat expiry releases before capability expiry and delayed disconnect permits restart', async t => {
  const f = await fixture(t, 5000), { session, view } = f.client();
  try {
    await session.start(selection); f.advance(5001);
    await until(() => !f.service.busy); assert.equal(f.released, 1); assert.match(f.service.status().reason, /heartbeat expired/);
    f.sockets[0].onclose(); await until(() => !session.active && !session.stopping);
    assert.equal(view.active, false); assert.equal(f.bootstraps, 1, 'still-valid page capability does not require renewal');
    await session.start(selection); assert.equal(session.active, true); await session.stop(); assert.equal(f.released, 2);
  } finally { session.dispose(); await f.close(); }
});

test('renewed page cannot adopt or stop another page which acquired during suspension', async t => {
  const f = await fixture(t), { session } = f.client();
  try {
    await session.status(); f.advance(61001);
    const other = (await f.call('/bootstrap', {})).body.capability, running = await f.call('', selection, other); assert.equal(running.status, 200);
    const status = await session.status(); assert.equal(status.owns, false); assert.equal(status.busy, true); assert.equal(session.active, false);
    await assert.rejects(session.start(selection), /owns acquisition/);
    assert.equal(f.service.status(other).sessionId, running.body.sessionId); assert.equal(f.released, 0); assert.equal(f.acquired, 1);
    await f.call('/stop', { sessionId: running.body.sessionId }, other); assert.equal(f.released, 1); assert.equal(f.service.busy, false);
  } finally { session.dispose(); await f.close(); }
});
for (const phase of ['preparing', 'reserving', 'starting', 'running']) test(`panel exit during ${phase} drains the old service and a new panel can acquire`, async t => {
  const f = await fixture(t);
  try {
    const owner = (await f.call('/bootstrap', {})).body.capability; f.mode = phase;
    const starting = f.call('', selection, owner);
    await until(() => phase === 'preparing' ? f.acquired === 1 : phase === 'reserving' ? f.reserved === 1 : f.children.length === 1);
    if (phase === 'running') await starting;
    const closed = f.service.close(); f.finishPrepare(); f.finishReserve(); await closed; await starting;
    assert.equal(f.service.busy, false); assert.equal(f.released, 1); assert.equal(f.children.every(c => c.closed), true);
    assert.equal((await f.call('/bootstrap', {})).status, 503, 'closed panel intentionally cannot restart');
    const replacement = await fixture(t);
    try { const token = (await replacement.call('/bootstrap', {})).body.capability, running = await replacement.call('', selection, token); assert.equal(running.status, 200); await replacement.call('/stop', { sessionId: running.body.sessionId }, token); assert.equal(replacement.released, 1); }
    finally { await replacement.close(); }
  } finally { await f.close(); }
});
