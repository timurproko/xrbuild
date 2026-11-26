import { openRecordingArchive } from './src/live/recording/archive.ts';

/** Legacy playback only. No camera, inference, fusion, calibration or generated input is imported. */
export function mountHandsTools({ root, view }) {
  root.innerHTML = `<div class="xrb-stack">
    <div class="xrb-button-row"><button type="button" data-import>Import</button><button type="button" data-folder>Folder</button></div>
    <input type="file" data-file accept=".csv,.handtracking,.handlab,.handpair" hidden>
    <div data-list class="xrb-stack"></div>
    <section data-playback class="xrb-stack" hidden>
      <p data-label class="xrb-help"></p>
      <label data-track-label hidden>Stream<select data-track name="recording-stream" aria-label="Recorded stream"></select></label>
      <div class="xrb-button-row"><button type="button" data-play>Play</button><button type="button" data-rewind>Rewind</button><button type="button" data-export>Export</button><button type="button" data-close>Close</button></div>
      <input type="range" class="xrb-range" data-seek min="0" value="0" step="1" aria-label="Recorded frame">
      <label>Speed<select data-speed name="recording-speed"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
      <div data-media class="xrb-media-stage" hidden><canvas data-image aria-label="Recorded pixels"></canvas></div>
      <label data-plane-label hidden>Pixels<select data-plane name="recording-plane"><option value="rgb">RGB</option><option value="depth">Saved depth</option></select></label>
      <p data-frame class="xrb-help"></p>
    </section>
    <p data-error class="field-error" role="status" hidden></p>
  </div>`;
  const $ = selector => root.querySelector(selector), events = new AbortController(), signal = events.signal;
  let disposed = false, archive = null, fileName = '', track = 0, index = 0, generation = 0, playing = false, raf = 0, began = 0, offset = 0, busy = false, pending = null;
  const urls = new Set();
  const error = text => { $('[data-error]').textContent = text; $('[data-error]').hidden = !text; };
  async function request(url, method = 'GET') {
    const response = await fetch(`/api/hands/tools/${url}`, { method, cache: 'no-store', signal });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Recording request failed.'); }
    return response;
  }
  function stop() { playing = false; cancelAnimationFrame(raf); $('[data-play]').textContent = 'Play'; }
  async function show(next) {
    if (!archive || disposed) return;
    index = next; $('[data-seek]').value = String(index);
    if (busy) { pending = next; return; }
    busy = true; const owner = generation, selected = archive.tracks[track];
    try {
      if (view?.active) throw new Error('Stop live hands before replay.');
      const frame = await selected.frame(next); if (disposed || owner !== generation) return;
      if (view?.active) throw new Error('Stop live hands before replay.');
      view?.showLegacyFrame(frame.pose);
      $('[data-label]').textContent = `${archive.kind} · ${frame.pose.space} · replay`;
      $('[data-frame]').textContent = `${next + 1} / ${selected.times.length} · ${(selected.times[next] / 1000).toFixed(2)} s`;
      const canvas = $('[data-image]'), context = canvas.getContext('2d');
      $('[data-media]').hidden = !frame.png && !frame.packet; $('[data-plane-label]').hidden = !frame.packet;
      if (frame.png) {
        const image = await createImageBitmap(frame.png);
        try { if (!disposed && owner === generation) { canvas.width = image.width; canvas.height = image.height; context.drawImage(image, 0, 0); } } finally { image.close(); }
      } else if (frame.packet) {
        const p = frame.packet; canvas.width = p.width; canvas.height = p.height;
        const image = context.createImageData(p.width, p.height), depth = $('[data-plane]').value === 'depth';
        const source = new Uint8Array(p.buffer, depth ? p.alignedOffset : p.rgbOffset, depth ? p.alignedBytes : p.rgbBytes);
        for (let i = 0; i < p.width * p.height; i++) {
          if (depth) { const z = source[i * 2] | source[i * 2 + 1] << 8, shade = z ? Math.max(1, 255 - Math.min(254, z / 32)) : 0; image.data.set([shade, shade, shade, 255], i * 4); }
          else image.data.set([source[i * 3], source[i * 3 + 1], source[i * 3 + 2], 255], i * 4);
        }
        context.putImageData(image, 0, 0);
      }
    } catch (e) { if (!disposed && owner === generation) { stop(); error(e.message); } }
    finally { busy = false; if (!disposed && pending !== null) { const next = pending; pending = null; void show(next); } }
  }
  async function adopt(file, name) {
    stop(); if (view?.active) throw new Error('Stop live hands before replay.');
    const owner = ++generation; pending = null;
    const next = await openRecordingArchive(file); if (disposed || owner !== generation) return;
    for (const url of urls) URL.revokeObjectURL(url); urls.clear();
    archive = next; fileName = name; track = index = 0; error('');
    $('[data-track]').replaceChildren(...archive.tracks.map((t, i) => new Option(t.label, String(i))));
    $('[data-track-label]').hidden = archive.tracks.length < 2; $('[data-playback]').hidden = false;
    $('[data-seek]').max = String(archive.tracks[0].times.length - 1); await show(0);
  }
  async function list() {
    const data = await (await request('recordings')).json(); if (disposed) return;
    const list = $('[data-list]'); list.replaceChildren();
    if (!data.recordings.length) { const p = document.createElement('p'); p.className = 'xrb-help'; p.textContent = 'No recordings.'; list.append(p); }
    for (const recording of data.recordings) {
      const row = document.createElement('div'); row.className = 'xrb-button-row';
      const open = document.createElement('button'); open.type = 'button'; open.textContent = new Date(recording.createdUtc).toLocaleString();
      open.addEventListener('click', () => { void request(`recordings/${encodeURIComponent(recording.id)}`).then(r => r.blob()).then(file => adopt(file, recording.name)).catch(e => error(e.message)); }, { signal });
      const download = document.createElement('a'); download.textContent = 'Export'; download.href = `/api/hands/tools/recordings/${encodeURIComponent(recording.id)}`; download.download = recording.name;
      row.append(open, download); list.append(row);
    }
  }
  function play(now) {
    if (!playing || disposed || !archive) return;
    const times = archive.tracks[track].times, time = offset + (now - began) * Number($('[data-speed]').value);
    let next = index; while (next + 1 < times.length && times[next + 1] <= time) next++;
    if (next !== index) void show(next);
    if (next === times.length - 1) stop(); else raf = requestAnimationFrame(play);
  }
  $('[data-import]').addEventListener('click', () => $('[data-file]').click(), { signal });
  $('[data-file]').addEventListener('change', () => { const file = $('[data-file]').files[0]; $('[data-file]').value = ''; if (file) void adopt(file, file.name).catch(e => error(e.message)); }, { signal });
  $('[data-folder]').addEventListener('click', () => { void request('recordings/open-folder', 'POST').catch(e => error(e.message)); }, { signal });
  $('[data-play]').addEventListener('click', () => { if (playing) stop(); else if (archive) { playing = true; began = performance.now(); offset = archive.tracks[track].times[index]; $('[data-play]').textContent = 'Pause'; raf = requestAnimationFrame(play); } }, { signal });
  $('[data-rewind]').addEventListener('click', () => { stop(); void show(0); }, { signal });
  $('[data-seek]').addEventListener('input', () => { stop(); void show(Number($('[data-seek]').value)); }, { signal });
  $('[data-track]').addEventListener('change', () => { stop(); generation++; track = Number($('[data-track]').value); $('[data-seek]').max = String(archive.tracks[track].times.length - 1); void show(0); }, { signal });
  $('[data-plane]').addEventListener('change', () => { void show(index); }, { signal });
  $('[data-close]').addEventListener('click', () => { stop(); generation++; archive = null; pending = null; for (const url of urls) URL.revokeObjectURL(url); urls.clear(); $('[data-playback]').hidden = true; view?.clearLegacy(); }, { signal });
  $('[data-export]').addEventListener('click', () => { if (!archive) return; for (const previous of urls) URL.revokeObjectURL(previous); urls.clear(); const url = URL.createObjectURL(archive.original), a = document.createElement('a'); urls.add(url); a.href = url; a.download = fileName; a.click(); }, { signal });
  void list().catch(e => { if (!disposed) error(e.message); });
  return { dispose() { disposed = true; generation++; pending = null; stop(); events.abort(); for (const url of urls) URL.revokeObjectURL(url); root.replaceChildren(); view?.clearLegacy(); } };
}
