export const RECORDING_LIMITS = Object.freeze({ bytes: 16 * 1024 * 1024, samples: 10000, durationMs: 120000 });
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const base64 = packet => { let text = ''; for (const byte of packet) text += String.fromCharCode(byte); return btoa(text); };
/** Raw session observer; never samples the renderer or adjusts provider coordinates. */
export function createProviderRecording({ producer, format, onComplete = () => {} }) {
  let active = false, document = null, used = 0, first = null, sequence = -1, disposed = false;
  function finish(reason = 'Stopped') {
    if (!active) return null; active = false;
    if (!document.samples.length) { onComplete(null, 'No frames recorded.'); return null; }
    try { format.validate(document); onComplete(document, reason); return document; }
    catch (error) { onComplete(null, `Recording rejected: ${error.message}`); return null; }
  }
  const unsubscribeFrames = producer.subscribeRawFrames(event => {
    if (!active || disposed) return;
    if (event.epoch !== document.epoch) { finish('Session changed.'); return; }
    if (!Number.isSafeInteger(event.sequence) || event.sequence <= sequence || !Number.isFinite(event.captureTimeMs) || !Number.isFinite(event.publishTimeMs) || event.publishTimeMs < event.captureTimeMs || !(event.packet instanceof Uint8Array) || event.packet.byteLength > 4096) { finish('Invalid session sample.'); return; }
    if (first !== null && event.captureTimeMs < document.samples.at(-1).captureTimeMs) { finish('Capture clock changed.'); return; }
    const sample = { sequence: event.sequence, captureTimeMs: event.captureTimeMs, publishTimeMs: event.publishTimeMs, packet: base64(event.packet) };
    first ??= sample.captureTimeMs;
    const added = bytes(sample) + (document.samples.length ? 1 : 0);
    if (document.samples.length >= RECORDING_LIMITS.samples || used + added > RECORDING_LIMITS.bytes || sample.captureTimeMs - first > RECORDING_LIMITS.durationMs) { finish('Recording limit reached.'); return; }
    document.samples.push(sample); used += added; sequence = event.sequence;
    if (document.samples.length === RECORDING_LIMITS.samples || sample.captureTimeMs - first === RECORDING_LIMITS.durationMs) finish('Recording limit reached.');
  });
  const unsubscribeLifecycle = producer.subscribeLifecycle(event => {
    if (active && (event.epoch !== document.epoch || ['stopped', 'failed', 'retired', 'idle'].includes(event.phase))) finish(event.reason || 'Session ended.');
  });
  return {
    get active() { return active; },
    start() {
      if (disposed || active) throw new Error('Recorder is not idle.');
      const source = producer.recordingSource(); if (!source) throw new Error('Recording needs a live hand session.');
      // Explicit portable/provenance fields only: no arbitrary workspace record, token or path is copied.
      document = structuredClone({ kind: source.kind, version: source.version, source: source.source && { owner: source.source.owner, id: source.source.id, ...(source.source.version ? { version: source.source.version } : {}) },
        sessionId: source.sessionId, epoch: source.epoch, profile: source.profile && { version: source.profile.version, offsetMm: source.profile.offsetMm, sizeFactor: source.profile.sizeFactor, appearance: source.profile.appearance },
        frameSpace: source.frameSpace, processing: source.processing, globalAdjustmentsApplied: source.globalAdjustmentsApplied, clockDomain: source.clockDomain, axes: source.axes, samples: [] });
      if (document.kind !== 'xrbuild-hand-session' || document.version !== 1 || !document.profile || !document.source?.owner || !document.source?.id || typeof document.epoch !== 'string' || !document.epoch || document.frameSpace !== 'panel-metres' || document.processing !== 'provider-published' || document.globalAdjustmentsApplied !== false || document.clockDomain !== 'windows-qpc-ms' || document.axes !== 'x-right,y-up,z-viewer') throw new Error('Incompatible recording producer.');
      used = bytes(document); if (used > RECORDING_LIMITS.bytes / 2) throw new Error('Recording metadata exceeds its limit.');
      first = null; sequence = -1; active = true;
    },
    stop: finish,
    dispose() { if (disposed) return; disposed = true; try { finish('Page closed.'); } finally { unsubscribeFrames(); unsubscribeLifecycle(); document = null; } },
  };
}

/** Live PR supplies producer + format {validate(document), replay(document,{view}) -> disposer}. */
export function mountProviderRecorder({ actions, status, view, restoreProfile = () => {} }) {
  let capture = null, producer = null, format = null, documentFormat = null, document = null, saved = true, stopReplay = null, disposed = false, disposeLifecycle = null;
  const events = new AbortController(), signal = events.signal;
  actions.innerHTML = '<button type="button" data-record hidden>Start recording</button><button type="button" data-save hidden>Export</button><button type="button" data-replay hidden>Replay</button><button type="button" data-import hidden>Import hand session</button><input type="file" data-file accept=".xrbhands,.json" hidden>';
  const $ = selector => actions.querySelector(selector);
  const say = text => { status.textContent = text; };
  function refresh() {
    if (disposed) return;
    const available = !!producer?.recordingSource();
    $('[data-record]').hidden = !available && !capture?.active; $('[data-record]').textContent = capture?.active ? 'Stop recording' : 'Start recording';
    $('[data-save]').hidden = !document || !!capture?.active; $('[data-replay]').hidden = !document || !!capture?.active; $('[data-replay]').textContent = stopReplay ? 'Stop replay' : 'Replay'; $('[data-import]').hidden = !format || !!capture?.active;
    actions.hidden = !available && !document && !format;
  }
  function complete(value, reason) { if (disposed) return; document = value; documentFormat = format; saved = !value; say(reason); refresh(); }
  function endReplay() { if (!stopReplay) return; stopReplay(); stopReplay = null; if (view?.replaying) { view.clearSession(); void restoreProfile(); } refresh(); }
  function connect(options = {}) {
    if (disposed) return;
    capture?.dispose(); disposeLifecycle?.(); capture = null; producer = options.producer ?? null; format = options.format ?? null;
    if (format && typeof format.validate !== 'function') throw new Error('Recording validator is required.');
    if (producer && format) {
      capture = createProviderRecording({ producer, format, onComplete: complete });
      disposeLifecycle = producer.subscribeLifecycle(() => { if (!capture?.active) { say(producer.recordingSource() ? 'Ready to record.' : 'Recording needs a live hand session.'); refresh(); } });
    }
    say('Recording needs a live hand session.'); refresh();
  }
  $('[data-record]').addEventListener('click', () => { try { if (capture.active) capture.stop(); else { if (document && !saved) throw new Error('Export the previous recording first.'); endReplay(); capture.start(); saved = false; say('Recording.'); } refresh(); } catch (error) { say(error.message); } }, { signal });
  $('[data-save]').addEventListener('click', () => {
    if (!document) return;
    try { documentFormat.validate(document); const url = URL.createObjectURL(new Blob([JSON.stringify(document)], { type: 'application/json' })), link = actions.ownerDocument.createElement('a'); link.href = url; link.download = 'hands-session.xrbhands'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); saved = true; }
    catch (error) { say(error.message); }
  }, { signal });
  $('[data-import]').addEventListener('click', () => $('[data-file]').click(), { signal });
  $('[data-file]').addEventListener('change', async () => {
    const file = $('[data-file]').files[0]; $('[data-file]').value = ''; if (!file) return;
    try { if (capture?.active) throw new Error('Stop recording before import.'); if (document && !saved) throw new Error('Export the previous recording first.'); if (file.size > RECORDING_LIMITS.bytes) throw new Error('Recording exceeds 16 MiB.'); const next = JSON.parse(await file.text()); format.validate(next); if (disposed) return; document = next; documentFormat = format; saved = true; say('Hand session loaded.'); refresh(); }
    catch (error) { say(error.message); }
  }, { signal });
  $('[data-replay]').addEventListener('click', async () => {
    try {
      if (stopReplay) { endReplay(); return; }
      if (view?.active) throw new Error('Stop live hands before replay.');
      if (capture?.active) throw new Error('Stop recording before replay.');
      if (typeof documentFormat?.replay !== 'function') throw new Error('Replay adapter is unavailable.');
      documentFormat.validate(document);
      if (!view) throw new Error('3D view is unavailable.');
      const replayView = Object.create(view);
      replayView.beginSession = options => view.beginSession({ ...options, mode: 'replay' });
      replayView.clearSession = () => { view.clearSession(); void restoreProfile(); };
      const stop = await documentFormat.replay(document, { view: replayView }); if (disposed) { stop?.(); return; }
      stopReplay = stop; say('Recorded hand session.'); refresh();
    } catch (error) { say(error.message); }
  }, { signal });
  addEventListener('beforeunload', event => { if (!saved || capture?.active) { event.preventDefault(); event.returnValue = ''; } }, { signal });
  connect();
  return { connect, dispose() { if (disposed) return; disposed = true; events.abort(); stopReplay?.(); capture?.dispose(); disposeLifecycle?.(); actions.replaceChildren(); } };
}
