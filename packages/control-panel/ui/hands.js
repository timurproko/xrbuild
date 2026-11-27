import { mountToolNavigation, isPanelUnavailable } from './navigation.js';
import { openColorPopover, installNumberSteppers } from './design-system.js';
import { mountHandsShell } from './hands-shell.js';
import { mountProviderRecorder } from './hands-recorder.js';
import { mountHandsPostprocessing } from './hands-postprocessing.js';
import { handsWriteQueue, commitHandsFields } from './hands-commits.js';
const $ = id => document.getElementById(id), key = p => p ? `${p.owner}/${p.id}` : '';
// Same key as HANDS_TAB_KEY in hands-adjustments.js (loaded later): show the remembered tab from the first paint.
try {
  const saved = localStorage.getItem('xrb.hands.tab');
  if (saved && saved !== 'setup' && document.querySelector(`.hands-adjustment-tabs [data-tab="${saved}"]`)) {
    for (const tab of document.querySelectorAll('.hands-adjustment-tabs [data-tab]')) { const on = tab.dataset.tab === saved; tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; }
    $('hands-setup').hidden = true;
    const panel = document.querySelector(`[data-tab-panel="${saved}"]`); if (panel) panel.hidden = false;
    const action = document.querySelector(`[data-tab-action="${saved}"]`); if (action) action.hidden = false;
  }
} catch { /* Storage may be blocked; Setup stays first. */ }
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
    setup: $('hands-setup'),
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
  } catch (error) { if (isPanelUnavailable(error)) return; if (!disposed && read === readGeneration && !sourceEdit) { sourceReadError = true; message(error.message); $('hands-source-recovery').hidden = false; } }
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
// Monitor frame: pick a monitor in Setup (remembered in this browser); its EDID size draws the frame.
const MONITOR_KEY = 'xrb.hands.monitor', MONITOR_SIZE_KEY = 'xrb.hands.monitorSize';
/** Frame the last monitor before the first frame; the live list (about a second later) then only confirms it. */
function restoreMonitorFrame() { try { const size = JSON.parse(localStorage.getItem(MONITOR_SIZE_KEY) || 'null'); if (size?.widthMm) view?.setMonitor(size); } catch { /* No remembered size. */ } }
async function loadMonitors() {
  const select = $('hands-monitor');
  let monitors = [];
  try { monitors = (await (await fetch('/api/monitors', { cache: 'no-store' })).json()).monitors ?? []; } catch { /* No monitor list: the frame stays off. */ }
  let saved = ''; try { saved = localStorage.getItem(MONITOR_KEY) ?? ''; } catch { /* Storage may be blocked. */ }
  const sized = monitors.filter(m => m.widthMm && m.heightMm);
  if (!monitors.some(m => m.device === saved && m.widthMm)) saved = (sized.find(m => m.primary) ?? sized[0])?.device ?? '';
  select.replaceChildren(new Option('None', ''), ...monitors.map(m => {
    const option = new Option(m.widthMm ? `${m.name} · ${m.widthMm} × ${m.heightMm} mm` : `${m.name} · size unknown`, m.device);
    option.disabled = !m.widthMm; return option;
  }));
  select.value = saved; select.disabled = !sized.length;
  const apply = () => {
    const monitor = monitors.find(m => m.device === select.value) ?? null;
    try { localStorage.setItem(MONITOR_SIZE_KEY, monitor?.widthMm ? JSON.stringify({ widthMm: monitor.widthMm, heightMm: monitor.heightMm }) : ''); } catch { /* Storage may be blocked. */ }
    view?.setMonitor(monitor);
  };
  select.addEventListener('change', () => { try { localStorage.setItem(MONITOR_KEY, select.value); } catch { /* Storage may be blocked. */ } apply(); });
  apply();
}
// Object shape and grid color are viewer preferences, remembered in this browser only.
const stored = key => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } };
const store = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Storage may be blocked. */ } };
function mountViewPreferences() {
  const object = $('hands-object'), swatch = $('hands-grid-color');
  object.value = ['cube', 'sphere', 'suzanne'].includes(stored('xrb.hands.object')) ? stored('xrb.hands.object') : 'cube';
  object.addEventListener('change', () => { store('xrb.hands.object', object.value); void view?.setObject(object.value); });
  void view?.setObject(object.value);
  const opacity = $('hands-grid-opacity'), range = $('hands-grid-opacity-range');
  const savedOpacity = Number.parseFloat(stored('xrb.hands.gridOpacity'));
  let gridColor = /^#[0-9a-f]{6}$/i.test(stored('xrb.hands.gridColor')) ? stored('xrb.hands.gridColor') : '#ffffff';
  let gridOpacity = Number.isFinite(savedOpacity) ? Math.min(1, Math.max(0, savedOpacity)) : .5;
  const applyGrid = () => { swatch.style.backgroundColor = gridColor; opacity.value = String(gridOpacity); range.value = String(gridOpacity); view?.setGrid({ color: gridColor, opacity: gridOpacity }); };
  const setOpacity = (value, save) => { const next = Number.parseFloat(value); if (!Number.isFinite(next)) return; gridOpacity = Math.min(1, Math.max(0, next)); applyGrid(); if (save) store('xrb.hands.gridOpacity', String(gridOpacity)); };
  range.addEventListener('input', () => setOpacity(range.value, true));
  opacity.addEventListener('input', () => setOpacity(opacity.value, false));
  opacity.addEventListener('change', () => setOpacity(opacity.value, true));
  applyGrid();
  // Object position (mm, panel space; default the screen centre 0, 0, 0).
  let position = { x: 0, y: 0, z: 0 };
  try { const saved = JSON.parse(stored('xrb.hands.objectPosition') || 'null'); if (saved) for (const axis of ['x', 'y', 'z']) if (Number.isFinite(saved[axis])) position[axis] = Math.min(300, Math.max(-300, saved[axis])); } catch { /* Defaults stay. */ }
  const applyPosition = () => {
    for (const axis of ['x', 'y', 'z']) $(`hands-object-${axis}`).value = String(position[axis]);
    view?.setObjectPosition(position.x / 1000, position.y / 1000, position.z / 1000);
  };
  for (const field of document.querySelectorAll('[data-object-axis]')) {
    const update = save => { const value = Number.parseFloat(field.value); if (!Number.isFinite(value)) return; position[field.dataset.objectAxis] = Math.min(300, Math.max(-300, value)); applyPosition(); if (save) store('xrb.hands.objectPosition', JSON.stringify(position)); };
    field.addEventListener('input', () => update(false));
    field.addEventListener('change', () => update(true));
  }
  applyPosition();
  installNumberSteppers($('hands-setup'));
  swatch.addEventListener('click', () => openColorPopover(swatch, { value: gridColor,
    onInput: color => { gridColor = color; applyGrid(); }, onClose: color => { gridColor = color; store('xrb.hands.gridColor', color); applyGrid(); } }));
}
const disposeShell = mountHandsShell({ resetView: () => view?.resetView(), setViewOptions: options => view?.setViewOptions(options) });
const postprocessing = mountHandsPostprocessing($('hands-postprocessing-root'));
try {
  const { createHandsView } = await import('./hands-view.js');
  view = createHandsView({ canvas: $('hands-canvas'), viewport: $('hands-viewport'),
    // The view is ready once it renders; its rate is shown only while a hand session runs.
    onMetrics: metrics => { document.body.dataset.handsView = 'ready'; const render = document.body.dataset.handsSession === 'live' ? metrics.renderFps.toFixed(1) : '—'; if ($('hands-render-fps').textContent !== render) $('hands-render-fps').textContent = render; },
    onStatus: status => {
      if (status.phase === 'idle') { profileKey = ''; $('hands-tracking-fps').textContent = '—'; }
    },
  });
  // Grid, axes and the monitor frame follow the View menu from the first frame (all on by default).
  view.setViewOptions(JSON.parse($('hands-view-options').value));
  restoreMonitorFrame(); void loadMonitors();
  mountViewPreferences();
} catch (error) { $('hands-view-error').hidden = false; $('hands-view-error').textContent = `3D view unavailable: ${error.message}`; }
// Retained integration API only: no recorder nodes or legacy tools enter the simplified page.
const recorder = mountProviderRecorder({ actions: document.createElement('div'), status: document.createElement('p'), view,
  restoreProfile: async () => { profileKey = ''; const generation = profileGeneration; try { await applyViewProfile(await request('GET'), generation); } catch (error) { message(error.message); } } });
const { createHandsSession } = await import('./hands-session.js');
const { createProviderFormat } = await import('./hands-provider-format.js');
const { decodeMessage } = await import('/sdk/protocol.js');
const { handProfile } = await import('/sdk/hand-profile.js');
const session = createHandsSession({ view, replaying: () => recorder.replaying, decode: decodeMessage });
const recordingFormat = createProviderFormat({ decode: decodeMessage, normalize: handProfile });
const { mountHandsLiveControls } = await import('./hands-live-controls.js');
const liveControls = mountHandsLiveControls({ session, view, load: () => request('GET') });
export const handsPage = { get view() { return view; }, get snapshot() { return snapshot; }, recorder, session, recordingFormat, request };
const events = new EventSource('/api/events');
events.addEventListener('hands-changed', () => { profileGeneration++; void session.refreshProfile().catch(() => {}); void load(); });
events.addEventListener('plugins-changed', () => { void load(); });
const deliveryTimer = setInterval(() => { if (!writes) void load(); }, 1000);
addEventListener('beforeunload', event => { if (sourceEdit || sourceBusy) { event.preventDefault(); event.returnValue = ''; } });
addEventListener('pagehide', () => { disposed = true; readGeneration++; clearInterval(deliveryTimer); events.close(); liveControls.dispose(); session.dispose(); recorder.dispose(); adjustments?.dispose(); postprocessing.dispose(); navigation?.(); disposeShell(); view?.dispose(); }, { once: true });
await load();
