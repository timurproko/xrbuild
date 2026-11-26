import { randomUUID } from 'node:crypto';
import { sameOrigin } from './state-paths.mjs';
import { bridgeReadiness } from './bridge/readiness.mjs';
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
/** One lease covers both services, including connection, enumeration and asynchronous cleanup. */
export function calibrationCapture(context, { prepare = () => bridgeReadiness(context), factory = options => import('./bridge/server.mjs').then(module => module.createBridge(options)), ttlMs = 20000 } = {}) {
  let owner = null, closed = false;
  const closeOwner = async value => {
    if (!value || value.closing) return value?.closing;
    clearTimeout(value.timer);
    value.closing = (async () => {
      await value.pending?.catch(() => {});
      await Promise.all(value.services.map(service => service.close()));
      value.release(); if (owner === value) owner = null;
    })();
    return value.closing;
  };
  const touch = value => { clearTimeout(value.timer); value.timer = setTimeout(() => { void closeOwner(value).catch(() => {}); }, ttlMs); value.timer.unref?.(); };
  return {
    busy: () => !!owner,
    async status() { try { return await prepare() ?? { available: true, reason: 'Connect to check depth cameras.' }; } catch (error) { return { available: false, code: 'preparation-failed', reason: 'Camera preparation failed.', detail: error.message }; } },
    async handle(req, res) {
      if (req.url !== '/api/calibration/capture') return false;
      if (closed || req.method !== 'POST' || !sameOrigin(req) || req.headers.origin !== `http://${req.headers.host}`) { json(res, 403, { error: 'Same-origin explicit capture request required.' }); return true; }
      try {
        let bytes = ''; for await (const chunk of req) { bytes += chunk; if (bytes.length > 4096) throw new Error('Capture request is too large.'); }
        const input = JSON.parse(bytes || '{}');
        if (input.action === 'connect') {
          if (owner) throw new Error('Another Calibration tab owns capture. Stop it there first.');
          const ready = await prepare();
          if (ready?.available === false) { json(res, 409, { error: ready.reason, ...ready }); return true; }
          // Preparation is asynchronous; disposal or another tab may have won meanwhile.
          if (closed) throw new Error('Calibration connection cancelled.');
          if (owner) throw new Error('Another Calibration tab owns capture. Stop it there first.');
          const value = { id: randomUUID(), release: context.acquireCapture(), services: [], pending: null, closing: null, timer: null };
          owner = value; touch(value);
          value.pending = (async () => {
            const options = { port: 0, maxPeers: 1, runtimeOptions: context, origins: [`http://${req.headers.host}`] };
            // Sequential allocation lets cleanup retain every successfully allocated service.
            value.services.push(await factory(options));
            value.services.push(await factory(options));
          })();
          try {
            await value.pending;
            if (closed || value.closing || owner !== value) throw new Error('Calibration connection cancelled.');
            touch(value);
            json(res, 200, { id: value.id, cameras: value.services.map(service => ({ url: `ws://127.0.0.1:${service.port}/bridge`, token: service.token })) });
          } catch (error) { await closeOwner(value); throw error; }
        } else {
          const value = owner;
          if (!value || input.id !== value.id) throw new Error('Calibration capture ownership expired.');
          if (input.action === 'heartbeat' && !value.closing) { touch(value); json(res, 200, { ok: true }); }
          else if (input.action === 'disconnect') { await closeOwner(value); json(res, 200, { ok: true }); }
          else throw new Error('Unsupported capture action.');
        }
      } catch (error) { if (!res.writableEnded) json(res, 409, { error: error.message }); }
      return true;
    },
    async close() { closed = true; await closeOwner(owner); },
  };
}
