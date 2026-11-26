import { CameraCalibration } from './src/live/multiview/viewer.ts';
import { CalibrationCamera } from './src/live/multiview/calibration-port.ts';
import { matchingProfiles, profileKey } from './src/live/rgbd/profiles.ts';
import { exportSpatialCalibration } from './src/live/multiview/calibration.ts';
import { calibrationStorage } from './calibration-storage.mjs';

export async function calibrationRequest(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options, headers: { 'content-type': 'application/json', ...options.headers } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `Calibration request failed (${response.status}).`);
  return value;
}
/** Injected ports are the same seam used by software-only tests; no product fixture mode exists. */
export async function mountCalibration(root, { capture, request = calibrationRequest, createCamera = (_side, callbacks) => new CalibrationCamera(callbacks), now = () => performance.now(), storage = null, onController = () => {} } = {}) {
  storage ??= calibrationStorage(request);
  const el = id => root.querySelector(`#${id}`), events = new AbortController();
  let saved = []; const urls = new Map();
  let disposed = false, connecting = false, work = false, lease = null, heartbeat = null, operation = 0, dirty = false, entriesKey = '', lastResult = null, stopWork = null;
  const error = value => { el('cal-error').textContent = value?.message || String(value || ''); el('cal-error').hidden = !value; };
  const api = input => request('/api/calibration/capture', { method: 'POST', body: JSON.stringify(input), keepalive: true });
  const ports = {};
  const controller = new CameraCalibration(ports, storage, now); onController(controller);
  const render = () => {
    if (disposed) return;
    const state = controller.snapshot(), active = ['starting', 'running', 'stopping'].includes(state.phase);
    el('cal-connect').disabled = connecting || !!stopWork || work || active || !capture?.available;
    el('cal-start').disabled = !lease || connecting || work || active || !el('cal-camera-a').value || !el('cal-camera-b').value || el('cal-camera-a').value === el('cal-camera-b').value;
    el('cal-stop').disabled = !lease && !connecting && !active;
    for (const id of ['cal-camera-a', 'cal-camera-b', 'cal-profile-a', 'cal-profile-b', 'cal-method']) el(id).disabled = active || connecting || !!stopWork || work;
    const marker = el('cal-method').value === 'marker';
    el('cal-manual').hidden = marker || !active && !state.targets;
    el('cal-marker-help').hidden = !marker || !active;
    el('cal-marker-assets').hidden = !marker;
    for (const side of ['a', 'b']) el(`cal-preview-${side}`).hidden = !active;
    el('cal-stop').textContent = marker && active && !state.result ? 'Cancel' : 'Stop';
    el('cal-fit').disabled = work || state.entries.filter(entry => entry.a && entry.b && entry.use === 'fit').length < 6;
    el('cal-save').disabled = work || !state.result?.spatialQualified || storage.ready === false;
    el('cal-import-button').disabled = work;
    el('cal-import').disabled = work; el('cal-clear').disabled = work; el('cal-saved').disabled = work;
    el('cal-load').disabled = work || !saved.length;
    el('cal-reload').disabled = work;
    for (const id of ['cal-target-id', 'cal-target-use', 'cal-fixed', 'cal-description', 'cal-uncertainty']) el(id).disabled = work;
    el('cal-export').disabled = !state.result || work;
    const key = JSON.stringify(state.entries);
    if (key !== entriesKey) { const selected = el('cal-targets').value; el('cal-targets').replaceChildren(...state.entries.map(entry => new Option(`${entry.id} · ${entry.use} · A ${entry.a ? '✓' : '—'} / B ${entry.b ? '✓' : '—'}`, entry.id))); el('cal-targets').value = selected || state.entries[0]?.id || ''; entriesKey = key; }
    el('cal-remove').disabled = work || !state.targets;
    if (state.result !== lastResult) {
      lastResult = state.result;
      if (state.result && marker && state.phase === 'running') dirty = true;
      if (!state.result) { el('cal-quality').textContent = 'No result.'; el('cal-result').hidden = true; }
      else {
        const result = state.result, mm = value => value == null ? '—' : (value * 1000).toFixed(1);
        el('cal-quality').textContent = `${result.spatialQualified ? 'Spatial checks passed' : 'Provisional'} · fit ${mm(result.fit.rmsM)} mm · check ${mm(result.check.rmsM)} mm · max ${mm(Math.max(result.fit.maximumM ?? 0, result.check.maximumM ?? 0))} mm · ${result.check.reprojectionRmsPx?.toFixed(1) ?? '—'} px. Physical accuracy and timing unverified.${result.reasons.length ? ' ' + result.reasons.join('; ') : ''}`;
        el('cal-result').textContent = `${result.input.sources.a.serial} (${profileKey(result.input.sources.a.color)}) ← ${result.input.sources.b.serial} (${profileKey(result.input.sources.b.color)})\nR: ${result.bToA.rotationRowMajor.map(value => value.toFixed(6)).join(' ')}\nt (m): ${Object.values(result.bToA.translationMeters).map(value => value.toFixed(6)).join(' ')}`;
        el('cal-result').hidden = false;
      }
    }
    if (active) el('cal-capture-status').textContent = state.phase !== 'running' ? `${state.phase}…` : marker ? state.result ? 'Measurement complete. Stop cameras when finished.' : `${state.marker.paired}/12 pairs · ${state.marker.issue || state.marker.reason}` : `Running · ${state.targets} targets`;
  };
  const release = async value => { if (value) await api({ action: 'disconnect', id: value.id }); };
  const stop = () => {
    if (stopWork) return stopWork;
    ++operation; connecting = false;
    if (heartbeat) clearInterval(heartbeat); heartbeat = null;
    const value = lease; lease = null;
    stopWork = (async () => {
      try { await controller.stop(); }
      finally {
        Object.values(ports).forEach(port => port.disconnect());
        await release(value);
      }
      if (!disposed) el('cal-capture-status').textContent = capture?.available ? 'Stopped.' : capture?.reason || 'Native bridge unavailable.';
    })().finally(() => { stopWork = null; render(); });
    render(); return stopWork;
  };
  const failed = reason => { error(reason); void stop().catch(error); };
  for (const side of ['a', 'b']) ports[side] = createCamera(side, { async frame(value) {
    if (disposed || controller.snapshot().phase !== 'running') return;
    await controller.push(side, value);
    if (disposed || controller.snapshot().phase !== 'running') return;
    const { packet } = value, canvas = el(`cal-preview-${side}`), ctx = canvas.getContext('2d');
    canvas.width = packet.width; canvas.height = packet.height;
    const image = ctx.createImageData(packet.width, packet.height), rgb = new Uint8Array(packet.buffer, packet.rgbOffset, packet.rgbBytes);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) { image.data[j] = rgb[i]; image.data[j + 1] = rgb[i + 1]; image.data[j + 2] = rgb[i + 2]; image.data[j + 3] = 255; }
    ctx.putImageData(image, 0, 0);
    if (el('cal-method').value === 'marker') {
      ctx.strokeStyle = getComputedStyle(root).getPropertyValue('--accent').trim() || '#008aff'; ctx.lineWidth = 2;
      for (const detection of packet.meta.marker?.detections || []) { ctx.beginPath(); detection.corners.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath(); ctx.stroke(); }
    }
    render();
  }, failed });
  const on = (id, type, fn) => el(id).addEventListener(type, () => { void Promise.resolve().then(fn).catch(error); }, { signal: events.signal });
  const clear = () => { controller.clearTargets(); dirty = false; render(); };
  const replaceDraft = () => !dirty || confirm('Discard the unsaved calibration draft?');
  on('cal-connect', 'click', async () => {
    if (connecting) return;
    await stop(); const generation = ++operation; connecting = true; error(''); render();
    try {
      const value = await api({ action: 'connect' });
      if (disposed || generation !== operation) { await release(value); return; }
      lease = value;
      heartbeat = setInterval(() => { void api({ action: 'heartbeat', id: value.id }).catch(failed); }, 5000);
      await Promise.all(['a', 'b'].map((side, i) => ports[side].connect(value.cameras[i])));
      if (disposed || generation !== operation) return;
      for (const side of ['a', 'b']) {
        const devices = ports[side].snapshot().devices.filter(device => matchingProfiles(device).length);
        el(`cal-camera-${side}`).replaceChildren(new Option('Select camera', ''), ...devices.map(device => new Option(device.serial, device.serial)));
        el(`cal-profile-${side}`).replaceChildren();
      }
      const distinct = new Set(Object.values(ports).flatMap(port => port.snapshot().devices.filter(device => matchingProfiles(device).length).map(device => device.serial)));
      el('cal-capture-status').textContent = distinct.size < 2 ? 'Two compatible depth cameras are required.' : 'Select two cameras and profiles.';
    } catch (reason) { await stop(); throw reason; }
    finally { if (generation === operation) connecting = false; render(); }
  });
  for (const side of ['a', 'b']) {
    on(`cal-camera-${side}`, 'change', () => { const device = ports[side].snapshot().devices.find(device => device.serial === el(`cal-camera-${side}`).value); el(`cal-profile-${side}`).replaceChildren(...matchingProfiles(device).map(profile => new Option(profile, profile))); render(); });
    el(`cal-preview-${side}`).addEventListener('click', event => {
      if (el('cal-method').value !== 'manual' || work) return;
      const rect = event.currentTarget.getBoundingClientRect(), canvas = event.currentTarget;
      const id = el('cal-target-id').value.trim(); work = true; error('');
      void controller.addTarget(side, id, el('cal-target-use').value, { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }).then(() => { dirty = true; render(); el('cal-targets').value = id; }).catch(error).finally(() => { work = false; render(); });
    }, { signal: events.signal });
  }
  on('cal-method', 'change', render);
  for (const [id, name] of [['cal-marker-download', 'tag36h11-0.svg'], ['cal-marker-license', 'APRILTAG-LICENSE.txt']]) on(id, 'click', () => {
    const link = document.createElement('a'); link.href = `/calibration/tools/assets/${name}`; link.download = name; document.body.append(link); link.click(); link.remove();
  });
  on('cal-start', 'click', async () => {
    if (!replaceDraft()) return; clear(); error('');
    const choices = Object.fromEntries(['a', 'b'].map(side => [side, { serial: el(`cal-camera-${side}`).value, profile: el(`cal-profile-${side}`).value }]));
    const starting = controller.start(choices, el('cal-method').value); render();
    try { await starting; } catch (reason) { await stop(); throw reason; } finally { render(); }
  });
  on('cal-stop', 'click', stop);
  on('cal-targets', 'change', () => { const entry = controller.snapshot().entries.find(entry => entry.id === el('cal-targets').value); if (entry) { el('cal-target-id').value = entry.id; el('cal-target-use').value = entry.use; } });
  on('cal-remove', 'click', () => { controller.removeTarget(el('cal-targets').value); dirty = true; render(); });
  on('cal-clear', 'click', () => { if (replaceDraft()) clear(); });
  for (const id of ['cal-fixed', 'cal-description', 'cal-uncertainty']) on(id, 'change', () => { controller.invalidateResult(); render(); });
  on('cal-fit', 'click', async () => {
    if (!el('cal-fixed').checked) throw new Error('Confirm fixed cameras and static targets.');
    work = true; error(''); render();
    try { await controller.fitManual({ staticTargetConfirmed: true, description: el('cal-description').value.trim(), referenceUncertaintyM: el('cal-uncertainty').value === '' ? null : Number(el('cal-uncertainty').value) / 1000 }); dirty = true; }
    finally { work = false; render(); }
  });
  const listSaved = async () => {
    saved = await controller.saved();
    el('cal-saved').replaceChildren(...(saved.length ? saved.map((result, index) => new Option(`${result.input.sources.a.serial} ← ${result.input.sources.b.serial} · ${result.inputSha256.slice(0, 8)}`, String(index))) : [new Option('No saved results', '')]));
  };
  const reloadSaved = async () => { await storage.prepare?.(); await listSaved(); render(); };
  on('cal-reload', 'click', async () => { work = true; error(''); render(); try { await reloadSaved(); } finally { work = false; render(); } });
  const adoptFile = async file => {
    if (!replaceDraft()) return;
    await stop(); clear(); error(''); work = true; render();
    try {
      const result = await controller.import(file);
      el('cal-fixed').checked = false; el('cal-description').value = result.input.evidence.description;
      el('cal-uncertainty').value = result.input.evidence.referenceUncertaintyM === null ? '' : String(result.input.evidence.referenceUncertaintyM * 1000);
      el('cal-method').value = result.input.evidence.automaticMarker ? 'marker' : 'manual';
      dirty = false;
    } finally { work = false; render(); }
  };
  on('cal-load', 'click', async () => { const result = saved[Number(el('cal-saved').value)]; if (result) await adoptFile(exportSpatialCalibration(result)); });
  on('cal-import-button', 'click', () => el('cal-import').click());
  on('cal-import', 'change', async () => { const file = el('cal-import').files?.[0]; el('cal-import').value = ''; if (file) await adoptFile(file); });
  on('cal-save', 'click', async () => {
    work = true; error(''); render();
    try { await controller.save(); dirty = false; await listSaved(); el('cal-quality').textContent += ' Saved.'; }
    finally { work = false; render(); }
  });
  on('cal-export', 'click', () => {
    const url = URL.createObjectURL(controller.export()), link = document.createElement('a');
    link.href = url; link.download = 'hand-tracking-spatial-calibration.json'; document.body.append(link); link.click(); link.remove();
    urls.set(url, setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 30000));
    // Download initiation is not proof of durable storage; unsaved drafts keep their warning.
  });
  try { await reloadSaved(); } catch (reason) { error(reason); }
  const timer = setInterval(render, 200); render();
  el('cal-connect').disabled = !capture?.available;
  el('cal-capture-status').textContent = capture?.reason || 'Not connected.';
  addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }, { signal: events.signal });
  return () => { disposed = true; events.abort(); clearInterval(timer); for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url); } urls.clear(); void stop().catch(() => {}); };
}
