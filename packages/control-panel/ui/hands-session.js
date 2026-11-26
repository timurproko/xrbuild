import { createSessionClock, sessionPacket, SESSION_BOUNDS } from './hands-session-wire.js';
/** One owning page. Socket credit is returned only at the actual consumer frame boundary. */
export function createHandsSession({ view, replaying = () => false, onStatus = () => {}, fetcher = fetch, Socket = WebSocket, now = () => performance.now(), decode, frame = requestAnimationFrame, cancel = cancelAnimationFrame }) {
  let capability = '', current = null, disposed = false, generation = 0, raf = 0;
  const raw = new Set(), lifecycle = new Set();
  const notify = value => { onStatus(value); for (const listener of lifecycle) listener(value); };
  async function request(action = '', body) {
    const response = await fetcher('/api/hands/session' + action, { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { 'x-xrb-hands': '1', ...(body ? { 'content-type': 'application/json' } : {}), ...(capability ? { authorization: `Bearer ${capability}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Hands session request failed'); return value;
  }
  async function bootstrap() { if (!capability) { const b = await request('/bootstrap', {}); if (disposed) return; capability = b.capability; } }
  function retire(s, reason = '') {
    if (!s || current !== s || s.retired) return;
    s.retired = true; s.pending = null; clearInterval(s.heartbeat); clearInterval(s.pingTimer); clearTimeout(s.syncTimer); s.socket?.close(); view.clearSession();
    notify({ phase: reason ? 'failed' : 'stopped', reason, epoch: s.epoch, sessionId: s.sessionId });
  }
  async function stop(reason = '') {
    generation++; const s = current; if (!s) return;
    retire(s, reason);
    try { if (!s.sessionId) { const status = await request(); if (status.owns) s.sessionId = status.sessionId; } if (s.sessionId) await request('/stop', { sessionId: s.sessionId }); } catch (error) { if (!disposed) onStatus({ phase: 'failed', reason: error.message }); }
    if (current === s) current = null;
  }
  async function applyProfile(s, envelope) {
    if (!envelope || s.retired || current !== s || envelope.runId !== s.sessionId || envelope.sequence <= s.profileSequence) return;
    const sequence = envelope.sequence;
    if (await view.setProfile(envelope.profile, { isCurrent: () => !s.retired && current === s && sequence > s.profileSequence })) {
      if (s.retired || current !== s) return;
      // setProfile resolves after the shared ingress/visual snapshot has changed, never on receipt alone.
      s.profileSequence = sequence;
      await request('/ack', { sessionId: s.sessionId, profile: envelope });
    }
  }
  async function start(selection) {
    if (disposed || current) throw new Error('Stop the active Hands session first');
    if (!view || replaying() || view.replaying || view.active) throw new Error('Stop replay and wait for the 3D view before Start');
    const ownGeneration = ++generation;
    await bootstrap(); if (disposed || ownGeneration !== generation) return;
    const s = { sessionId: null, epoch: null, retired: false, profileSequence: -1, clock: createSessionClock({ now }), pending: null, lastFresh: null, invalidStreak: 0, accepted: 0, dropped: 0, rejected: 0, times: [], pings: new Set() };
    current = s; notify({ phase: 'starting' });
    // Status polling also binds heartbeat during slow native create/start; the id is not known until this read.
    let polling = false;
    s.heartbeat = setInterval(async () => {
      if (s.retired || polling) return; polling = true;
      try {
        let status = await request();
        if (status.owns) { s.sessionId ??= status.sessionId; status = await request('/heartbeat', { sessionId: s.sessionId }); }
        if (s.sessionId && (!status.owns || status.sessionId !== s.sessionId || ['failed', 'stopped'].includes(status.phase))) { void stop(status.reason || 'Provider session ended'); return; }
        if (status.profile && s.socket) await applyProfile(s, status.profile);
      } catch (error) { void stop(error.message); } finally { polling = false; }
    }, 1000);
    try {
      const result = await request('', selection);
      if (s.retired || disposed || ownGeneration !== generation) { if (result.sessionId) { s.sessionId = result.sessionId; await request('/stop', { sessionId: result.sessionId }); } return; }
      Object.assign(s, { sessionId: result.sessionId, epoch: result.epoch, source: result.source });
      await applyProfile(s, result.profile);
      if (s.retired || !view.beginSession({ epoch: s.epoch })) throw new Error('Hand viewport did not accept its session');
      const socket = new Socket(result.url); s.socket = socket; s.consumerStarted = now(); socket.binaryType = 'arraybuffer';
      const ping = () => { if (!s.retired && socket.readyState === 1) { const p0 = now(); s.pings.add(p0); if (s.pings.size > 8) s.pings.delete(s.pings.values().next().value); const data = new ArrayBuffer(9), v = new DataView(data); v.setUint8(0, 111); v.setFloat64(1, p0, true); socket.send(data); } };
      socket.onopen = () => { if (s.retired) { socket.close(); return; } socket.send(new TextEncoder().encode(result.observer)); result.observer = ''; ping(); s.pingTimer = setInterval(ping, 2000); };
      s.syncTimer = setTimeout(() => { if (!s.clock.mapping) void stop('Cannot synchronize provider clock'); }, 2000);
      socket.onmessage = event => {
        if (s.retired || current !== s) return;
        try { const message = sessionPacket(event.data, s.epoch, decode); if (message.type === 'clock') { if (!s.pings.delete(message.clocks[0])) throw new Error('Unsolicited clock reply'); s.clock.sample(message.clocks); } else { if (s.pending) throw new Error('Provider violated frame credit'); s.pending = message; } }
        catch (error) { s.rejected++; void stop(error.message); }
      };
      socket.onerror = () => { void stop('Provider transport failed'); };
      socket.onclose = () => { if (!s.retired) void stop('Provider transport disconnected'); };
      notify({ phase: 'waiting', source: s.source, epoch: s.epoch, sessionId: s.sessionId });
    } catch (error) { if (!s.retired) await stop(error.message); throw error; }
  }
  function tick() {
    const s = current;
    if (s && !s.retired) {
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
    async status() { await bootstrap(); return request(); },
    get active() { return !!current && !current.retired; },
    recordingSource() { const s = current; return s && !s.retired && s.accepted && view.profile ? { kind: 'xrbuild-hand-session', version: 1, source: { owner: s.source.owner, id: s.source.id, ...(s.source.version ? { version: s.source.version } : {}) }, sessionId: s.sessionId, epoch: s.epoch, profile: view.profile, frameSpace: 'panel-metres', processing: 'provider-published', globalAdjustmentsApplied: false, clockDomain: 'windows-qpc-ms', axes: 'x-right,y-up,z-viewer' } : null; },
    subscribeRawFrames(listener) { raw.add(listener); return () => raw.delete(listener); },
    subscribeLifecycle(listener) { lifecycle.add(listener); return () => lifecycle.delete(listener); },
    dispose() { disposed = true; cancel(raf); void stop(); raw.clear(); lifecycle.clear(); },
  };
}
