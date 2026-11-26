import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { calibrationCapture } from '../calibration-capture.mjs';

test('two bridge services share exclusion, reject takeover, expire and release only after cleanup', async () => {
  let held = false, closes = 0, creates = 0;
  const capture = calibrationCapture({ acquireCapture() { assert.equal(held, false); held = true; return () => { held = false; }; } }, { prepare() {}, ttlMs: 100, async factory() { creates++; return { port: 5210 + creates, token: 'a'.repeat(64), async close() { closes++; } }; } });
  const server = http.createServer((req, res) => { void capture.handle(req, res); }); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`, call = (value: object, origin = base) => fetch(base + '/api/calibration/capture', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(value) });
  try {
    assert.equal(capture.status().available, true); assert.equal(creates, 0);
    assert.equal((await call({ action: 'connect' }, 'https://untrusted.test')).status, 403); assert.equal(creates, 0);
    const connected = await call({ action: 'connect' }).then(r => r.json()); assert.equal(connected.cameras.length, 2); assert.ok(held);
    assert.equal((await call({ action: 'connect' })).status, 409); assert.equal((await call({ action: 'disconnect', id: 'foreign' })).status, 409); assert.ok(held);
    await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(held, false); assert.equal(closes, 2);
    const again = await call({ action: 'connect' }).then(r => r.json()); assert.ok(held);
    assert.equal((await call({ action: 'disconnect', id: again.id })).status, 200); assert.equal(held, false); assert.equal(closes, 4);
  } finally { await capture.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('partial service allocation rolls back without losing the acquisition lease', async () => {
  let held = false, closes = 0, creates = 0;
  const capture = calibrationCapture({ acquireCapture() { held = true; return () => { held = false; }; } }, { prepare() {}, async factory() { if (++creates === 2) throw new Error('Second bridge failed'); return { async close() { assert.ok(held); closes++; } }; } });
  const server = http.createServer((req, res) => { void capture.handle(req, res); }); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const response = await fetch(base + '/api/calibration/capture', { method: 'POST', headers: { origin: base }, body: JSON.stringify({ action: 'connect' }) });
    assert.equal(response.status, 409); assert.equal(closes, 1); assert.equal(held, false);
  } finally { await capture.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
