import { createSessionClock, sessionPacket, SESSION_BOUNDS } from './hands-session-wire.js';
/** One owning page. Socket credit is returned only at the actual consumer frame boundary. */
export function createHandsSession({ view, replaying = () => false, onStatus = () => {}, fetcher = fetch, Socket = WebSocket, now = () => performance.now(), decode, frame = requestAnimationFrame, cancel = cancelAnimationFrame }) {
  let capability = '', bootstrapPromise = null, current = null, disposed = false, generation = 0, raf = 0;
  const raw = new Set(), lifecycle = new Set();
  const notify = value => { onStatus(value); for (const listener of lifecycle) listener(value); };
  async function request(action = '', body, renew = true) {
    const sentCapability = capability;
    const response = await fetcher('/api/hands/session' + action, { method: body ? 'POST' : 'GET', cache: 'no-store', mode: 'same-origin', redirect: 'error', headers: { 'x-xrb-hands': '1', ...(body ? { 'content-type': 'application/json' } : {}), ...(sentCapability ? { authorization: `Bearer ${sentCapability}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok) {
      if (action !== '/bootstrap' && value.details?.code === 'hands-page-capability-expired') {
        // A delayed response for an old credential cannot retire a newer session/credential.
        if (sentCapability && sentCapability === capability) {
          if (current) { generation++; retire(current, 'Hands page authorization expired. Press Start again.'); current = null; }
          capability = '';
        }
        if (renew && !disposed) {
          await bootstrap();
          // Only retry a read; never replay Start/Stop/ACK/heartbeat under a different owner.
          if (action === '/status') return request(action, body, false);
        }
      }
      throw new Error(value.error || 'Hands session request failed');
    }
    return value;
  }
  async function bootstrap() {
    if (capability || disposed) return;
    const work = bootstrapPromise ??= (async () => { const b = await request('/bootstrap', {}); if (!disposed) capability = b.capability; })();
    try { await work; } finally { if (bootstrapPromise === work) bootstrapPromise = null; }
  }
  function retire(s, reason = '') {
    if (!s || current !== s || s.retired) return;
    s.retired = true; s.pending = null; clearInterval(s.heartbeat); clearInterval(s.pingTimer); clearTimeout(s.syncTimer); clearTimeout(s.freshness); s.socket?.close(); view.clearSession();
    for (const listener of lifecycle) listener({ phase: 'retired', reason, epoch: s.epoch, sessionId: s.sessionId });
    onStatus({ phase: reason ? 'failed' : 'stopping', reason, epoch: s.epoch, sessionId: s.sessionId });
  }
  async function stop(reason = '') {
    generation++; const s = current; if (!s) return;
    if (s.stopPromise) return s.stopPromise;
    retire(s, reason);
    return s.stopPromise = (async () => {
      try {
        if (!s.sessionId) { const status = await request('/status', {}); if (status.owns) s.sessionId = status.sessionId; }
        const result = s.sessionId ? await request('/stop', { sessionId: s.sessionId }) : null;
        const failure = result?.reason || reason;
        if (!disposed && current === s) notify({ phase: failure ? 'failed' : 'stopped', reason: failure, epoch: s.epoch, sessionId: s.sessionId });
      } catch (error) { if (!disposed && current === s) onStatus({ phase: 'failed', reason: error.message }); }
      if (current === s) current = null;
    })();
  }
  async function applyProfile(s, envelope) {
    if (!envelope || s.retired || current !== s || envelope.runId !== s.sessionId || !Number.isSafeInteger(envelope.sequence)) return false;
    if (envelope.sequence < s.profileSequence) return true;
    // One applying snapshot plus one newest replacement, never an autosave FIFO.
    if (!s.nextProfile || envelope.sequence >= s.nextProfile.sequence) s.nextProfile = envelope;
    if (!s.profileWork) s.profileWork = (async () => {
      while (s.nextProfile && !s.retired && current === s) {
        const expected = s.nextProfile; s.nextProfile = null;
        if (expected.sequence > s.profileSequence) {
          const applied = await view.setProfile(expected.profile, { isCurrent: () => !s.retired && current === s && (!s.nextProfile || s.nextProfile.sequence <= expected.sequence) });
          if (s.retired || current !== s) return false;
          if (!applied) { if (s.nextProfile) continue; return false; }
          s.profileSequence = expected.sequence;
        }
        if (expected.sequence === s.profileSequence) await request('/ack', { sessionId: s.sessionId, profile: expected });
      }
      return !s.retired && s.profileSequence >= 0;
    })().finally(() => { s.profileWork = null; });
    return s.profileWork;
  }
  async function start(selection) {
    if (disposed || current) throw new Error('Stop the active Hands session first');
    if (!view || replaying() || view.replaying || view.active) throw new Error('Stop replay and wait for the 3D view before Start');
    const ownGeneration = ++generation;
    await bootstrap(); if (disposed || ownGeneration !== generation) return;
    // Renew an idle page before allocating a Start context; renewal never starts capture by itself.
    await request('/status', {}); if (disposed || ownGeneration !== generation) return;
    const s = { sessionId: null, epoch: null, retired: false, profileSequence: -1, clock: createSessionClock({ now }), pending: null, lastFresh: null, invalidStreak: 0, accepted: 0, dropped: 0, rejected: 0, times: [], pings: new Set() };
    current = s; notify({ phase: 'starting' });
    // Status polling also binds heartbeat during slow native create/start; the id is not known until this read.
    let polling = false;
    s.heartbeat = setInterval(async () => {
      if (s.retired || polling) return; polling = true;
      try {
        let status = await request('/status', {});
        if (s.retired || current !== s) return;
        if (status.owns) { s.sessionId ??= status.sessionId; status = await request('/heartbeat', { sessionId: s.sessionId }); }
        if (s.retired || current !== s) return;
        if (s.sessionId && (!status.owns || status.sessionId !== s.sessionId || ['failed', 'stopped'].includes(status.phase))) { void stop(status.reason || 'Provider session ended'); return; }
        if (status.profile && s.sessionId) { try { await applyProfile(s, status.profile); } catch { /* Persistence and actual SDK delivery remain separate; keep the last valid snapshot. */ } }
      } catch (error) { if (!s.retired && current === s) void stop(error.message); } finally { polling = false; }
    }, 1000);
    try {
      const result = await request('', selection);
      if (s.retired || disposed || ownGeneration !== generation) { if (result.sessionId) { s.sessionId = result.sessionId; await request('/stop', { sessionId: result.sessionId }); } return; }
      Object.assign(s, { sessionId: result.sessionId, epoch: result.epoch, source: result.source });
      if (!await applyProfile(s, result.profile) && !s.retired) throw new Error('Initial hand profile was not applied');
      if (s.retired || disposed) return;
      if (!view.beginSession({ epoch: s.epoch })) throw new Error('Hand viewport did not accept its session');
      const socket = new Socket(result.url); s.socket = socket; s.consumerStarted = now(); socket.binaryType = 'arraybuffer';
      const ping = () => { if (!s.retired && socket.readyState === 1) { const p0 = now(); s.pings.add(p0); if (s.pings.size > 8) s.pings.delete(s.pings.values().next().value); const data = new ArrayBuffer(9), v = new DataView(data); v.setUint8(0, 111); v.setFloat64(1, p0, true); socket.send(data); } };
      socket.onopen = () => { if (s.retired) { socket.close(); return; } socket.send(new TextEncoder().encode(result.observer)); result.observer = ''; ping(); s.pingTimer = setInterval(ping, 2000); };
      s.syncTimer = setTimeout(() => { if (!s.clock.mapping) void stop('Cannot synchronize provider clock'); }, 2000);
      socket.onmessage = event => {
        if (s.retired || current !== s) return;
        try { const message = sessionPacket(event.data, s.epoch, decode); if (message.type === 'clock') { if (!s.pings.delete(message.clocks[0])) throw new Error('Unsolicited clock reply'); s.clock.sample(message.clocks); } else { if (s.pending) throw new Error('Provider violated frame credit'); s.pending = message; } }
        catch (error) { s.rejected++; void stop(error.message); }
      };
      socket.onerror = () => { if (!s.retired && current === s) void stop('Provider transport failed'); };
      socket.onclose = () => { if (!s.retired) void stop('Provider transport disconnected'); };
      notify({ phase: 'waiting', source: s.source, epoch: s.epoch, sessionId: s.sessionId });
    } catch (error) { if (!s.retired) await stop(error.message); throw error; }
  }
  function tick() {
    const s = current;
    if (s && !s.retired && s.socket) {
      if (s.pending && s.clock.mapping) {
        const event = s.pending; s.pending = null;
        try {
          const mapped = s.clock.admit(event);
          if (mapped !== null) {
            // Each subscriber gets its own packet/frame, before shared profile ingress mutates nothing.
            const sample = { epoch: s.epoch, sequence: event.sequence, captureTimeMs: event.frame.captureTimeMs, publishTimeMs: event.frame.hostTimeMs, packet: event.packet, frame: event.frame };
            for (const listener of raw) listener({ ...sample, packet: sample.packet.slice(), frame: structuredClone(sample.frame) });
            if (view.pushFrame({ epoch: s.epoch, sequence: event.sequence, frame: event.frame, capturePageMs: mapped })) {
              s.dropped += Math.max(0, event.sequence - (s.lastSequence ?? event.sequence) - 1); s.lastSequence = event.sequence; s.accepted++; s.invalidStreak = 0; s.lastFresh = now(); s.capture = mapped; s.hands = event.frame.hands.length; s.reportedHz = event.frame.trackingHz; s.times.push(now()); s.stale = false;
              clearTimeout(s.freshness); s.freshness = setTimeout(() => { if (!s.retired && current === s) { s.stale = true; view.clearHands(); notify({ phase: 'stalled', epoch: s.epoch, sessionId: s.sessionId, trackingFps: null, frameAgeMs: null }); } }, SESSION_BOUNDS.age);
            } else s.rejected++;
          } else { s.rejected++; view.clearHands(); if (++s.invalidStreak >= 3) throw new Error('Repeated stale or invalid provider captures'); }
          const ack = new ArrayBuffer(5), v = new DataView(ack); v.setUint8(0, 110); v.setUint32(1, event.transportSequence, true); s.socket.send(ack);
        } catch (error) { void stop(error.message); }
      }
      if (!s.retired) {
        const at = now();
        if (s.socket && at - (s.lastFresh ?? s.consumerStarted) > 10000) { void stop('No fresh valid provider frames for 10 seconds'); }
        s.times = s.times.filter(t => at - t <= 1000);
        if (s.lastFresh !== null && at - s.lastFresh > SESSION_BOUNDS.age && !s.stale) { s.stale = true; view.clearHands(); }
        notify({ phase: s.lastFresh === null ? 'waiting' : s.stale ? 'stalled' : s.hands ? 'running' : 'no-hands', source: s.source, epoch: s.epoch, sessionId: s.sessionId,
          trackingFps: s.lastFresh !== null && !s.stale ? s.times.length : null, frameAgeMs: s.lastFresh !== null && !s.stale ? Math.max(0, at - s.capture) : null, uncertaintyMs: s.clock.mapping?.uncertainty ?? null, reportedHz: s.reportedHz ?? null, dropped: s.dropped, rejected: s.rejected });
      }
    }
    if (!disposed) raf = frame(tick);
  }
  raf = frame(tick);
  return {
    start, stop,
    async refreshProfile() { const s = current; if (!s || s.retired) return; const status = await request('/status', {}); if (!s.retired && current === s && status.owns && status.sessionId === s.sessionId && status.profile) await applyProfile(s, status.profile); },
    async status() { await bootstrap(); return request('/status', {}); },
    get active() { return !!current && !current.retired; },
    get stopping() { return !!current?.retired; },
    recordingSource() { const s = current; return s && !s.retired && s.accepted && view.profile ? { kind: 'xrbuild-hand-session', version: 1, source: { owner: s.source.owner, id: s.source.id, ...(s.source.version ? { version: s.source.version } : {}) }, sessionId: s.sessionId, epoch: s.epoch, profile: view.profile, frameSpace: 'panel-metres', processing: 'provider-published', globalAdjustmentsApplied: false, clockDomain: 'windows-qpc-ms', axes: 'x-right,y-up,z-viewer' } : null; },
    subscribeRawFrames(listener) { raw.add(listener); return () => raw.delete(listener); },
    subscribeLifecycle(listener) { lifecycle.add(listener); return () => lifecycle.delete(listener); },
    dispose() { disposed = true; cancel(raf); void stop(); raw.clear(); lifecycle.clear(); },
  };
}
