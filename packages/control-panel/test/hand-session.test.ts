import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { HandSessions } from '../src/hand-session.ts';
import { handProfile } from '../../sdk/src/hand-profile.ts';
const worker = process.env.XRB_TEST_PROVIDER_WORKER, helper = process.env.XRB_TEST_ACQUISITION_HELPER;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function fixture(options: { prepare?: (request: any) => Promise<any>; heartbeatMs?: number } = {}) {
  let origin = '', acquired = 0, releases = 0;
  const sessions = new HandSessions({ origin: () => origin, platform: 'win32', testScope: randomBytes(32).toString('hex'), heartbeatMs: options.heartbeatMs,
    acquire: () => { acquired++; return () => { releases++; }; },
    prepare: options.prepare ?? (async () => ({ workerExe: worker!, helperExe: helper!, runtimeName: 'simulated', revision: 'revision', profile: handProfile(), source: { owner: 'core', id: 'simulated', label: 'Synthetic', version: '1' }, config: { hands: 2, rateHz: 120 } })),
  });
  const server = http.createServer((req, res) => { void sessions.handle(req, res).catch(e => { res.writeHead(e.status ?? 500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: e.message, details: e.details })); }); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (action = '', body?: any, capability = '', extra: Record<string, string> = {}) => {
    return new Promise<{status: number; body: any}>((resolve, reject) => {
      const req = http.request(origin + '/api/hands/session' + action, { method: body ? 'POST' : 'GET', headers: { origin, 'sec-fetch-site': 'same-origin', 'x-xrb-hands': '1', ...(capability ? { authorization: `Bearer ${capability}` } : {}), ...extra } }, res => {
        let text = ''; res.setEncoding('utf8').on('data', chunk => text += chunk).on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(text) }));
      }); req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
  };
  return { sessions, call, get acquired() { return acquired; }, get releases() { return releases; }, async close() { await sessions.close(); await new Promise<void>(r => server.close(() => r())); } };
}
const selection = { provider: { owner: 'core', id: 'simulated' }, revision: 'revision', registryRevision: 'registry' };
test('session routes require exact Host/Origin, fetch metadata, header and memory-only capability before acquisition', async () => {
  const f = await fixture({ prepare: async () => { throw new Error('must not acquire'); } });
  try {
    for (const extra of [{ origin: 'http://foreign.invalid' }, { origin: '' }, { host: 'foreign.invalid' }, { 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': '' }, { 'x-xrb-hands': '' }]) assert.equal((await f.call('/bootstrap', {}, '', extra)).status, 403);
    assert.equal((await f.call('', selection)).status, 403);
    const page = (await f.call('/bootstrap', {})).body; assert.equal(page.capability.length, 64);
    assert.equal((await f.call('', {}, page.capability)).status, 400);
    assert.equal((await f.call()).status, 403); assert.equal(f.acquired, 0);
    const state = (await f.call('', undefined, page.capability)).body;
    assert.equal(JSON.stringify(state).includes(page.capability), false); assert.equal(state.phase, 'not-started');
  } finally { await f.close(); }
});
test('Stop during preparation fences late Start and drains before another owner can acquire', async () => {
  let finish!: (value: any) => void;
  const f = await fixture({ prepare: () => new Promise(r => { finish = r; }) });
  try {
    const a = (await f.call('/bootstrap', {})).body.capability, b = (await f.call('/bootstrap', {})).body.capability;
    const starting = f.call('', selection, a); while (!finish) await delay(5);
    const state = (await f.call('', undefined, a)).body;
    assert.equal((await f.call('/stop', { sessionId: state.sessionId }, b)).status, 403);
    const stopping = f.call('/stop', { sessionId: state.sessionId }, a);
    await delay(30); assert.equal(f.sessions.busy, true);
    assert.equal((await f.call('', selection, b)).status, 409); assert.equal(f.acquired, 1);
    finish({}); assert.equal((await starting).status, 409); assert.equal((await stopping).status, 200);
    assert.equal(f.sessions.busy, false); assert.equal(f.releases, 1);
  } finally { await f.close(); }
});
for (const outcome of ['resolve', 'reject']) test(`timed-out Stop releases exactly once when cancelled preparation later ${outcome}s and permits restart`, async t => {
  let now = 0, finish!: (value: any) => void, reject!: (reason: Error) => void, preparations = 0;
  t.mock.method(performance, 'now', () => now);
  const f = await fixture({ prepare: () => ++preparations === 1 ? new Promise((yes, no) => { finish = yes; reject = no; }) : Promise.reject(new Error('Restart reached preparation')) });
  try {
    const owner = (await f.call('/bootstrap', {})).body.capability;
    const starting = f.call('', selection, owner); while (!finish) await delay(5);
    const state = (await f.call('', undefined, owner)).body;
    const stopping = f.call('/stop', { sessionId: state.sessionId }, owner);
    while (f.sessions.status(owner).phase !== 'stopping') await delay(5);
    now = 32000;
    assert.equal((await stopping).body.phase, 'failed'); assert.equal(f.sessions.busy, true); assert.equal(f.releases, 0);
    assert.equal((await f.call('', selection, owner)).status, 409, 'must not acquire while preparation remains alive');
    if (outcome === 'resolve') finish({}); else reject(new Error('Delayed preparation failed'));
    assert.equal((await starting).status, 409);
    assert.equal(f.sessions.preparing, false); assert.equal(f.sessions.busy, false); assert.equal(f.releases, 1);
    await f.call('/stop', { sessionId: state.sessionId }, owner); assert.equal(f.releases, 1, 'repeated Stop cannot double-release');
    const restarted = await f.call('', selection, owner);
    assert.match(restarted.body.error, /Restart reached preparation/); assert.equal(f.acquired, 2); assert.equal(f.releases, 2); assert.equal(f.sessions.busy, false);
  } finally { await f.close(); }
});

test('supervisor crash reaps the exact owned worker by creation identity and permits Start without stale Busy', { skip: !worker || !helper, timeout: 20000 }, async () => {
  const f = await fixture({ heartbeatMs: 100000 });
  try {
    const owner = (await f.call('/bootstrap', {})).body.capability;
    const launched = await f.call('', selection, owner); assert.equal(launched.status, 200);
    const running = (f.sessions as any).current;
    assert.ok(running.pid); assert.match(running.birth, /^\d+$/);
    const exited = new Promise<void>(r => running.child.once('close', () => r())); running.child.kill(); await exited;
    const deadline = Date.now() + 8000; while (f.sessions.busy && Date.now() < deadline) await delay(20);
    assert.equal(f.sessions.busy, false, 'launcher death cannot strand a dead same-panel lease');
    assert.equal(f.releases, 1); assert.match(f.sessions.status(owner).reason, /exited unexpectedly/);
    const next = await f.call('', selection, owner); assert.equal(next.status, 200); assert.notEqual(next.body.sessionId, launched.body.sessionId);
    await f.call('/stop', { sessionId: next.body.sessionId }, owner); assert.equal(f.sessions.busy, false); assert.equal(f.releases, 2);
  } finally { await f.close(); }
});

test('real reserved supervised session is owner-bound, receives native handoff, stops and releases on page loss', { skip: !worker || !helper, timeout: 20000 }, async () => {
  const f = await fixture({ heartbeatMs: 500 });
  try {
    const owner = (await f.call('/bootstrap', {})).body.capability;
    const launched = await f.call('', selection, owner); assert.equal(launched.status, 200, JSON.stringify(launched.body));
    assert.equal(launched.body.phase, 'running'); assert.equal(launched.body.observer.length, 64); assert.equal(new URL(launched.body.url).search, '');
    // The native receiver is deliberately not adopted by a second page. Page heartbeat loss alone stops capture.
    const other = (await f.call('/bootstrap', {})).body.capability;
    const publicState = (await f.call('', undefined, other)).body; assert.equal('observer' in publicState, false); assert.equal('profile' in publicState, false);
    assert.equal((await f.call('/stop', { sessionId: launched.body.sessionId }, other)).status, 403);
    const until = Date.now() + 8000; while (f.sessions.busy && Date.now() < until) await delay(20);
    assert.equal(f.sessions.busy, false); assert.equal(f.releases, 1);
    assert.match((await f.call('', undefined, owner)).body.reason, /heartbeat expired/);
  } finally { await f.close(); }
});
