import { CameraCalibration } from './src/live/multiview/viewer.ts';
import { CalibrationCamera } from './src/live/multiview/calibration-port.ts';
import { matchingProfiles } from './src/live/rgbd/profiles.ts';

export async function calibrationRequest(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options, headers: { 'content-type': 'application/json', ...options.headers } });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `Calibration request failed (${response.status}).`);
  return value;
}
/** Injected ports are the same seam used by software-only tests; no product fixture mode exists. */
export async function mountCalibration(root, { capture, request = calibrationRequest, createCamera = (_side, callbacks) => new CalibrationCamera(callbacks), now = () => performance.now(), storage = { getItem: () => null, setItem: () => { throw new Error('Calibration storage is not connected.'); } }, onController = () => {} } = {}) {
  const el = id => root.querySelector(`#${id}`), events = new AbortController();
  let disposed = false, connecting = false, work = false, lease = null, heartbeat = null, operation = 0, dirty = false, entriesKey = '', lastResult = null;
  const error = value => { el('cal-error').textContent = value?.message || String(value || ''); el('cal-error').hidden = !value; };
  const api = input => request('/api/calibration/capture', { method: 'POST', body: JSON.stringify(input), keepalive: true });
  const ports = {};
  const controller = new CameraCalibration(ports, storage, now); onController(controller);
  const render = () => {
    if (disposed) return;
    const state = controller.snapshot(), active = ['starting', 'running', 'stopping'].includes(state.phase);
    el('cal-connect').disabled = connecting || active || !capture?.available;
    el('cal-start').disabled = !lease || connecting || work || active || !el('cal-camera-a').value || !el('cal-camera-b').value || el('cal-camera-a').value === el('cal-camera-b').value;
    el('cal-stop').disabled = !lease && !connecting && !active;
    for (const id of ['cal-camera-a', 'cal-camera-b', 'cal-profile-a', 'cal-profile-b', 'cal-method']) el(id).disabled = active || connecting;
    el('cal-manual').hidden = el('cal-method').value !== 'manual';
    el('cal-fit').disabled = work || state.entries.filter(entry => entry.a && entry.b && entry.use === 'fit').length < 6;
    el('cal-save').disabled = true;
    el('cal-export').disabled = !state.result || work;
    const key = JSON.stringify(state.entries);
    if (key !== entriesKey) { const selected = el('cal-targets').value; el('cal-targets').replaceChildren(...state.entries.map(entry => new Option(`${entry.id} · ${entry.use} · A ${entry.a ? '✓' : '—'} / B ${entry.b ? '✓' : '—'}`, entry.id))); el('cal-targets').value = selected || state.entries[0]?.id || ''; entriesKey = key; }
    el('cal-remove').disabled = work || !state.targets;
    if (state.result !== lastResult) {
      lastResult = state.result;
      if (!state.result) { el('cal-quality').textContent = 'No result.'; el('cal-result').hidden = true; }
      else {
        const result = state.result, mm = value => value == null ? '—' : (value * 1000).toFixed(1);
        el('cal-quality').textContent = `${result.spatialQualified ? 'Spatial checks passed' : 'Provisional'} · fit ${mm(result.fit.rmsM)} mm · check ${mm(result.check.rmsM)} mm. Physical accuracy and timing unverified.${result.reasons.length ? ' ' + result.reasons.join('; ') : ''}`;
        el('cal-result').textContent = `${result.input.sources.a.serial} ← ${result.input.sources.b.serial}\nR: ${result.bToA.rotationRowMajor.map(value => value.toFixed(6)).join(' ')}\nt (m): ${Object.values(result.bToA.translationMeters).map(value => value.toFixed(6)).join(' ')}`;
        el('cal-result').hidden = false;
      }
    }
    if (active) el('cal-capture-status').textContent = state.phase === 'running' ? `Running · ${state.targets} targets` : `${state.phase}…`;
  };
  const release = async value => { if (value) await api({ action: 'disconnect', id: value.id }); };
  const stop = async () => {
    ++operation; connecting = false;
    if (heartbeat) clearInterval(heartbeat); heartbeat = null;
    const value = lease; lease = null;
    try { await controller.stop(); }
    finally {
      Object.values(ports).forEach(port => port.disconnect());
      await release(value); if (!disposed) { el('cal-capture-status').textContent = 'Stopped.'; render(); }
    }
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
    ctx.putImageData(image, 0, 0); render();
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
      work = true; error('');
      void controller.addTarget(side, el('cal-target-id').value.trim(), el('cal-target-use').value, { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }).then(() => { dirty = true; }).catch(error).finally(() => { work = false; render(); });
    }, { signal: events.signal });
  }
  on('cal-method', 'change', render);
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
  const timer = setInterval(render, 200); render();
  el('cal-connect').disabled = !capture?.available;
  el('cal-capture-status').textContent = capture?.reason || 'Not connected.';
  addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }, { signal: events.signal });
  return () => { disposed = true; events.abort(); clearInterval(timer); void stop().catch(() => {}); };
}
