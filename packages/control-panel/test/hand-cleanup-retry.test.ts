import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { HandSessions } from '../src/hand-session.ts';
import { createHandsSession } from '../ui/hands-session.js';
import { handProfile } from '../../sdk/src/hand-profile.ts';
const delay = (ms = 5) => new Promise<void>(r => setTimeout(r, ms));
async function until(check: () => boolean, timeout = 2000) { const by = Date.now() + timeout; while (!check()) { assert.ok(Date.now() < by, 'cleanup attempt did not settle'); await delay(); } }
const selection = { provider: { owner: 'core', id: 'simulated' }, revision: 'r', registryRevision: 'g' };
const document = '12345678-1234-1234-1234-123456789abc';
async function fixture(native?: { supervisor: string; pid: number; birth: string }, autoStart = true) {
  let origin = '', allowed = false, hold = false, throwing = false, finishCheck: ((dead: boolean) => void) | undefined;
  let checks = 0, acquired = 0, released = 0;
  const children: any[] = [];
  const service = new HandSessions({ origin: () => origin, platform: 'win32', heartbeatMs: 1000000,
    ...(!native ? { verifyWorker: async () => { checks++; if (throwing) throw new Error('Transient verifier failure'); return hold ? new Promise<boolean>(r => { finishCheck = r; }) : allowed; } } : {}),
    acquire: () => { acquired++; return () => { released++; }; },
    prepare: async () => ({ workerExe: path.join(path.dirname(native?.supervisor ?? 'fixture/xrb-provider-supervisor.exe'), 'xrb-provider-session-test.exe'), helperExe: 'fixture/helper.exe', runtimeName: 'simulated', config: {}, source: { owner: 'core', id: 'simulated', label: 'Fixture' }, profile: handProfile(), revision: 'r' }),
    reserve: (async () => ({ ticket: 'b'.repeat(64), async handoff() {}, async close() {} })) as any,
    spawn: (() => {
      const child: any = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.closed = false; child.writes = 0; child.kills = 0;
      child.exit = (receipt = true) => { if (child.closed) return; child.closed = true;
        if (receipt) child.stdout.write('@provider ' + JSON.stringify({ phase: 'joined', pid: native?.pid ?? 12345 }) + '\n');
        child.stdout.end(); child.stderr.end(); child.emit('close', 0, null);
      };
      child.stdin = new Writable({ write(_data, _encoding, done) {
        child.writes++;
        child.stdout.write('@provider ' + JSON.stringify({ phase: 'spawned', pid: native?.pid ?? 12345, birth: native?.birth ?? '1' }) + '\n');
        child.stdout.write('@provider ' + JSON.stringify({ phase: 'running', url: 'ws://127.0.0.1:2222/hands' }) + '\n'); done();
      } });
      child.stdin.on('finish', () => child.exit()); child.kill = () => { child.kills++; child.exit(false); return true; };
      children.push(child); return child;
    }) as any,
  });
  const server = http.createServer((req, res) => { void service.handle(req, res).catch(e => { res.writeHead(e.status ?? 500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message, details: e.details })); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (action: string, body: object = {}, capability = '') => {
    const response = await fetch(origin + '/api/hands/session' + action, { method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin', 'x-xrb-hands': '1', authorization: `Bearer ${capability}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const page = (await call('/bootstrap', { document })).body;
  const launched = autoStart ? await call('', selection, page.capability) : { status: 200, body: null }; assert.equal(launched.status, 200);
  return { service, call, page, launched: launched.body, children,
    get current() { return (service as any).current; }, get checks() { return checks; }, get released() { return released; }, get acquired() { return acquired; },
    set allowed(value: boolean) { allowed = value; }, set throwing(value: boolean) { throwing = value; }, set hold(value: boolean) { hold = value; }, finishCheck(dead: boolean) { finishCheck?.(dead); },
    async close() { allowed = true; hold = false; finishCheck?.(true); children.forEach(c => c.exit()); await service.close(); await new Promise<void>(r => server.close(() => r())); },
  };
}

for (const route of ['stop', 'recover', 'start', 'takeover', 'reload']) test(`${route} retries failed exact-identity checks instead of caching an unsuccessful drain`, async () => {
  const f = await fixture();
  try {
    f.children[0].exit(false); await until(() => f.checks === 1 && !f.current.verification);
    assert.equal(f.service.busy, true); assert.equal(f.released, 0);
    const other = route === 'takeover' ? (await f.call('/bootstrap')).body.capability : f.page.capability;
    let proof = f.page.continuity, capability = other;
    const act = async () => {
      if (route === 'reload') {
        const result = await f.call('/bootstrap', { document, continuity: proof, reload: true });
        proof = result.body.continuity; capability = result.body.capability; return result;
      }
      return f.call(route === 'start' || route === 'takeover' ? '' : '/' + route,
        route === 'start' || route === 'takeover' ? { ...selection, ...(route === 'takeover' ? { takeoverSessionId: f.launched.sessionId } : {}) } : { sessionId: f.launched.sessionId }, capability);
    };
    const first = await act();
    assert.equal(first.status, route === 'start' || route === 'takeover' ? 409 : 200);
    assert.equal(f.checks, 2); assert.equal(f.released, 0); assert.equal(f.service.busy, true);
    assert.equal(f.current.stop, undefined, 'only an in-flight Stop may be shared');
    assert.equal(f.current.verification, undefined, 'a finished failed verification is not death evidence');
    f.allowed = true;
    const retried = await act(); assert.equal(retried.status, 200); assert.equal(f.checks, 3); assert.equal(f.released, 1);
    assert.equal(f.children[0].writes, 1, 'closed launcher control streams are not reused'); assert.equal(f.children[0].kills, 0);
    if (route !== 'start' && route !== 'takeover') {
      assert.equal(f.service.busy, false); assert.equal(f.acquired, 1, 'cleanup/reload never auto-starts');
      const next = await f.call('', selection, capability); assert.equal(next.status, 200);
    }
    assert.equal(f.acquired, 2); assert.notEqual(f.current.id, f.launched.sessionId);
  } finally { await f.close(); }
});

test('launcher close, concurrent Stop and Recover share one active check, then all can retry', async () => {
  const f = await fixture();
  try {
    f.hold = true; f.children[0].exit(false); await until(() => f.checks === 1);
    const stops = [f.call('/stop', { sessionId: f.launched.sessionId }, f.page.capability), f.call('/recover', { sessionId: f.launched.sessionId }, f.page.capability)];
    await delay(30); assert.equal(f.checks, 1); assert.equal(f.released, 0);
    f.finishCheck(false); await Promise.all(stops);
    assert.equal(f.current.stop, undefined); assert.equal(f.current.verification, undefined);
    f.hold = false; f.allowed = true;
    await f.call('/recover', { sessionId: f.launched.sessionId }, f.page.capability);
    assert.equal(f.checks, 2); assert.equal(f.released, 1); assert.equal(f.service.busy, false);
    await f.call('/recover', { sessionId: f.launched.sessionId }, f.page.capability); assert.equal(f.released, 1);
  } finally { await f.close(); }
});

test('a rejected verifier attempt is retired and the next Recover checks again', async () => {
  const f = await fixture();
  try {
    f.throwing = true; f.children[0].exit(false); await until(() => f.checks === 1 && !f.current.verification);
    assert.equal(f.service.busy, true); assert.equal(f.released, 0);
    f.throwing = false; f.allowed = true;
    await f.call('/recover', { sessionId: f.launched.sessionId }, f.page.capability);
    assert.equal(f.checks, 2); assert.equal(f.service.busy, false); assert.equal(f.released, 1);
  } finally { await f.close(); }
});

test('client Retry cleanup survives capability rotation without replaying unauthorized Stop forever', async () => {
  const f = await fixture(undefined, false);
  const view = { active: false, profile: handProfile(), async setProfile() { return true; }, beginSession() { this.active = true; return true; }, clearSession() { this.active = false; }, clearHands() {}, pushFrame() { return true; } };
  const client = createHandsSession({ view, Socket: class { close() {} }, frame: () => 1, cancel: () => {}, decode: () => null,
    fetcher: async (url: string, options: any) => { const result = await f.call(url.split('/session')[1], JSON.parse(options.body ?? '{}'), (options.headers.authorization ?? '').replace(/^Bearer /, '')); return { ok: result.status === 200, json: async () => result.body }; } });
  try {
    await client.start(selection); f.children[0].exit(false); await until(() => f.checks === 1 && !f.current.verification);
    await client.stop(); assert.equal(client.blocked, true); assert.equal(client.stopping, false);
    for (const capability of (f.service as any).pages.keys()) (f.service as any).pages.set(capability, -1);
    const renewed = await client.status(); assert.equal(renewed.owns, false); assert.equal(renewed.cleanupPending, true);
    const before = f.checks; await client.stop(); assert.ok(f.checks > before); assert.equal(client.blocked, true);
    f.allowed = true; await client.stop();
    assert.equal(client.blocked, false); assert.equal(client.stopping, false); assert.equal(f.released, 1); assert.equal(f.service.busy, false);
    await client.start(selection); assert.equal(client.active, true);
  } finally { f.allowed = true; await client.stop(); client.dispose(); await f.close(); }
});

test('expired-page background cleanup retries failed checks with a cooldown, then releases when verifiable', async () => {
  const f = await fixture();
  try {
    f.children[0].exit(false); await until(() => f.checks === 1 && !f.current.verification);
    f.current.heartbeat = performance.now() - 1000001;
    await until(() => f.checks === 2 && !f.current.stop);
    await delay(200); assert.equal(f.checks, 2, 'failed checks do not spin a new helper every timer tick');
    f.allowed = true; await until(() => !f.service.busy, 2500);
    assert.equal(f.checks, 3); assert.equal(f.released, 1);
  } finally { await f.close(); }
});

test('panel close/restart stays in-flight and retries until death is verified, rather than caching false success', async () => {
  const f = await fixture(); let closing: Promise<void> | undefined;
  try {
    f.children[0].exit(false); await until(() => f.checks === 1 && !f.current.verification);
    let finished = false; closing = f.service.close().then(() => { finished = true; });
    await until(() => f.checks >= 3, 3000);
    assert.equal(finished, false); assert.equal(f.service.busy, true); assert.equal(f.released, 0);
    f.allowed = true; await closing;
    assert.equal(finished, true); assert.equal(f.service.busy, false); assert.equal(f.released, 1);
    await f.service.close(); assert.equal(f.released, 1);
  } finally { f.allowed = true; await closing; await f.close(); }
});

const supervisor = process.env.XRB_TEST_PROVIDER_SUPERVISOR;
test('real bounded check first expires while a disposable process lives; after exit Retry cleanup and next Start succeed', { skip: !supervisor || process.platform !== 'win32', timeout: 20000 }, async () => {
  const target = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  const exited = once(target, 'close'); let f: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    const birth = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Id ${target.pid}).StartTime.ToFileTime().ToString()`], { windowsHide: true, encoding: 'utf8' }).trim();
    f = await fixture({ supervisor: path.resolve(supervisor!), pid: target.pid!, birth });
    f.children[0].exit(false);
    await until(() => !f!.current.verification && f!.current.phase === 'failed', 8000);
    assert.equal(f.service.busy, true); assert.equal(f.released, 0);
    target.kill(); await exited;
    execFileSync(supervisor!, ['--join', String(target.pid), birth], { windowsHide: true }); // Independent positive evidence, as in the reviewer reproduction.
    const at = Date.now(); const recovered = await f.call('/recover', { sessionId: f.launched.sessionId }, f.page.capability);
    assert.equal(recovered.status, 200); assert.equal(recovered.body.busy, false); assert.equal(recovered.body.cleanupPending, false);
    assert.equal(f.released, 1); assert.ok(Date.now() - at < 6000, 'fresh verification does not wait through the old 15-second stop loop');
    const next = await f.call('', selection, f.page.capability); assert.equal(next.status, 200); assert.notEqual(next.body.sessionId, f.launched.sessionId);
  } finally { if (target.exitCode === null && target.signalCode === null) target.kill(); await exited; await f?.close(); }
});
