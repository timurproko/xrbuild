import { mountToolNavigation } from './navigation.js';
import { mountHandsShell } from './hands-shell.js';
import { mountProviderRecorder } from './hands-recorder.js';
import { mountHandsPostprocessing } from './hands-postprocessing.js';
import { handsWriteQueue, commitHandsFields } from './hands-commits.js';
const $ = id => document.getElementById(id), key = p => p ? `${p.owner}/${p.id}` : '';
let snapshot = null, view = null, adjustments = null, disposed = false, profileKey = '', profileGeneration = 0, writes = 0, readGeneration = 0;
let sourceEdit = null, sourceConflict = null, sourceBusy = false, sourceReadError = false;
const enqueue = handsWriteQueue();
const beginWrite = () => { writes++; profileGeneration++; readGeneration++; };
const endWrite = () => { writes--; profileGeneration++; };
function message(text = '') { $('hands-message').textContent = text; $('hands-message').hidden = !text; }
async function request(method, body, endpoint = '/api/hands') {
  const res = await fetch(endpoint, { method, cache: 'no-store', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await res.json(); if (!res.ok) { const error = new Error(data.error ?? 'Hands request failed'); error.status = res.status; throw error; } return data;
}
function renderSource() {
  if (!snapshot) return;
  const select = $('hands-provider'), selected = sourceEdit?.value ?? key(snapshot.selected);
  const missing = selected && !snapshot.providers.some(p => key(p) === selected);
  const options = [null, ...snapshot.providers, ...(missing ? [{ owner: selected.split('/')[0], id: selected.split('/')[1], label: `${selected} (missing)`, available: false }] : [])];
  const signature = JSON.stringify(options);
  if (select.dataset.options !== signature) {
    select.replaceChildren();
    for (const p of options) {
      const option = document.createElement('option'); option.value = key(p);
      option.textContent = p ? `${p.label}${p.available ? '' : ' (unavailable)'}` : 'Choose a provider';
      option.disabled = !!p && !p.available; select.append(option);
    }
    select.dataset.options = signature;
  }
  select.value = selected; select.disabled = sourceBusy;
  $('hands-source-recovery').hidden = !sourceEdit || sourceBusy || !$('hands-message').textContent;
  $('hands-source-discard').hidden = !sourceConflict;
}
async function applyViewProfile(data, generation = profileGeneration) {
  if (!data.profile || !view || view.active || view.replaying || recorder.replaying || generation !== profileGeneration) return;
  const next = JSON.stringify(data.profile); if (next === profileKey) return;
  try { if (await view.setProfile(data.profile, { isCurrent: () => !disposed && !view.active && !view.replaying && !recorder.replaying && generation === profileGeneration })) profileKey = next; }
  catch (error) { message(`Saved profile; view unavailable: ${error.message}`); }
}
async function mountAdjustments(data) {
  if (!data.profile || adjustments || disposed) return;
  const { mountHandAdjustments } = await import('./hands-adjustments.js');
  if (disposed) return;
  adjustments = mountHandAdjustments($('hands-adjustments-root'), {
    load: () => request('GET'),
    serialize: operation => enqueue(async () => {
      beginWrite();
      try { const result = await operation(); if (!disposed) { snapshot = result; renderSource(); } return result; }
      finally { endWrite(); }
    }),
    apply: async body => {
      const result = await request('POST', body, '/api/hands/apply');
      snapshot = { ...snapshot, ...result }; renderSource(); await applyViewProfile(result); return result;
    },
  });
}
async function load(discard = false) {
  const read = ++readGeneration, generation = profileGeneration, epoch = adjustments?.deliveryEpoch;
  try {
    const data = await request('GET'); if (disposed || read !== readGeneration || writes) return;
    snapshot = data;
    if (sourceReadError && !sourceEdit) { sourceReadError = false; message(); }
    renderSource();
    await mountAdjustments(data); if (disposed || read !== readGeneration) return;
    adjustments?.refresh(data, { discard });
    adjustments?.updateDelivery(data.delivery, data.deliveryState, data.revision, epoch);
    await applyViewProfile(data, generation);
  } catch (error) { if (!disposed && read === readGeneration && !sourceEdit) { sourceReadError = true; message(error.message); $('hands-source-recovery').hidden = false; } }
}
async function saveSource(review = false) {
  if (!sourceEdit || sourceBusy) return;
  if (review && sourceConflict) sourceEdit.base = sourceConflict;
  const edit = sourceEdit; sourceBusy = true; message(); renderSource();
  try {
    const result = await enqueue(async () => {
      beginWrite();
      try {
        return await commitHandsFields({ base: edit.base, changes: { selected: edit.value }, load: () => request('GET'), read: data => key(data.selected),
          save: (current, changes) => request('PUT', { provider: changes.selected ? { owner: changes.selected.split('/')[0], id: changes.selected.split('/')[1] } : null, revision: current.revision, registryRevision: current.registryRevision }) });
      } finally { endWrite(); }
    });
    if (disposed) return;
    snapshot = result; sourceEdit = sourceConflict = null; message();
  } catch (error) {
    if (disposed) return;
    sourceConflict = error.current ?? null;
    const saved = sourceConflict ? sourceConflict.providers.find(p => key(p) === key(sourceConflict.selected))?.label ?? (key(sourceConflict.selected) || 'No provider') : '';
    message(sourceConflict ? `Changed elsewhere. Saved: ${saved}. Retry your choice or use saved.` : `Couldn't save provider. ${error.message.replace(/;?\s*reload before (saving|applying)/ig, '')}`);
  } finally { sourceBusy = false; if (!disposed) { renderSource(); void load(); } }
}
$('hands-provider').addEventListener('change', () => {
  if (!snapshot || sourceBusy) return;
  const value = $('hands-provider').value;
  if (value && !snapshot.providers.some(p => key(p) === value && p.available)) { renderSource(); return; }
  sourceEdit = { base: snapshot, value }; sourceConflict = null; void saveSource();
});
$('hands-form').addEventListener('submit', event => event.preventDefault());
$('hands-source-retry').addEventListener('click', () => { if (sourceEdit) void saveSource(true); else { message(); void load(); } });
$('hands-source-discard').addEventListener('click', () => { sourceEdit = sourceConflict = null; message(); void load(); });
const navigation = mountToolNavigation($('hands-menu-button'), $('hands-menu'), { origin: location.origin, current: 'hands' });
const disposeShell = mountHandsShell({ resetView: () => view?.resetView(), setViewOptions: options => view?.setViewOptions(options) });
const postprocessing = mountHandsPostprocessing($('hands-postprocessing-root'));
try {
  const { createHandsView } = await import('./hands-view.js');
  view = createHandsView({ canvas: $('hands-canvas'), viewport: $('hands-viewport'),
    onMetrics: metrics => {
      const render = metrics.renderFps.toFixed(1), tracking = metrics.trackingFps === null ? '—' : metrics.trackingFps.toFixed(1);
      if ($('hands-render-fps').textContent !== render) $('hands-render-fps').textContent = render;
      if ($('hands-tracking-fps').textContent !== tracking) $('hands-tracking-fps').textContent = tracking;
      const chip = $('hands-tracking-fps').parentElement, tooltip = metrics.trackingFps === null ? 'No live hand session' : 'Delivered tracking results per second';
      if (chip.dataset.tooltip !== tooltip) chip.dataset.tooltip = tooltip;
    },
    onStatus: status => {
      const hidden = status.phase === 'replay' || status.phase === 'running' && status.hands > 0;
      if ($('hands-view-empty').hidden !== hidden) $('hands-view-empty').hidden = hidden;
      const text = status.phase === 'running' ? 'No hands detected.' : 'No live hand session.';
      if ($('hands-view-empty').firstElementChild.textContent !== text) $('hands-view-empty').firstElementChild.textContent = text;
      if (status.phase === 'idle') { profileKey = ''; $('hands-tracking-fps').textContent = '—'; }
    },
  });
} catch (error) { $('hands-view-error').hidden = false; $('hands-view-error').textContent = `3D view unavailable: ${error.message}`; }
// Retain the recorder integration API, but no recorder nodes enter the page and legacy tools are not loaded.
const recorder = mountProviderRecorder({ actions: document.createElement('div'), status: document.createElement('p'), view,
  restoreProfile: async () => { profileKey = ''; const generation = profileGeneration; try { await applyViewProfile(await request('GET'), generation); } catch (error) { message(error.message); } } });
export const handsPage = { get view() { return view; }, get snapshot() { return snapshot; }, recorder, request };
const events = new EventSource('/api/events');
events.addEventListener('hands-changed', () => { profileGeneration++; void load(); });
events.addEventListener('plugins-changed', () => { void load(); });
const deliveryTimer = setInterval(() => { if (!writes) void load(); }, 1000);
addEventListener('beforeunload', event => { if (sourceEdit || sourceBusy) { event.preventDefault(); event.returnValue = ''; } });
addEventListener('pagehide', () => { disposed = true; readGeneration++; clearInterval(deliveryTimer); events.close(); recorder.dispose(); adjustments?.dispose(); postprocessing.dispose(); navigation?.(); disposeShell(); view?.dispose(); }, { once: true });
await load();
