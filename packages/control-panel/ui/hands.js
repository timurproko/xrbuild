import { mountToolNavigation } from './navigation.js';
import { mountHandsShell } from './hands-shell.js';
import { mountProviderRecorder } from './hands-recorder.js';
import { handsEditorRevisions } from './hands-editor-revisions.js';
const $ = id => document.getElementById(id), key = p => p ? `${p.owner}/${p.id}` : '';
let snapshot = null, view = null, adjustments = null, tools = null, disposed = false, profileKey = '', profileGeneration = 0, writes = 0;
const pickerRevisions = handsEditorRevisions(), changedMessage = 'Hands settings changed. Reload to review them.';
const beginWrite = () => { writes++; profileGeneration++; };
const endWrite = () => { writes--; profileGeneration++; };
function message(text = '') { $('hands-message').textContent = text; $('hands-message').hidden = !text; }
async function request(method, body, endpoint = '/api/hands') {
  const res = await fetch(endpoint, { method, cache: 'no-store', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Hands request failed'); return data;
}
function availability() {
  const source = snapshot?.providers.find(p => key(p) === $('hands-provider').value), missing = $('hands-provider').value && !source;
  $('hands-availability').textContent = source ? `${source.purpose} · ${source.reason}${snapshot.initial && key(snapshot.selected) === key(source) ? ' · Initial default' : ''}`
    : missing ? 'Selected provider is missing.' : snapshot?.providers.length ? 'Choose a provider.' : 'No providers available.';
  $('hands-previous-session').hidden = !source?.runtimeState;
  $('hands-previous-session').textContent = source?.runtimeState ? `Previous app session: ${source.runtimeState}` : '';
  $('hands-save').disabled = !snapshot || !!missing || !!source && !source.available;
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
    apply: async body => {
      beginWrite();
      try {
        const result = await request('POST', body, '/api/hands/apply');
        // Only rebase a source editor which reviewed this exact Apply base.
        if (snapshot?.revision === body.revision) {
          snapshot.revision = result.revision; snapshot.profile = result.profile; pickerRevisions.incorporate(result.revision);
          if (!pickerRevisions.stale && $('hands-message').textContent === changedMessage) message();
        } else message('Source settings changed. Reload to review the current selection.');
        await applyViewProfile(result); return result;
      } finally { endWrite(); }
    },
  });
}
async function load(discard = false) {
  const generation = profileGeneration, pickerReview = pickerRevisions.reviewToken(), adjustmentReview = adjustments?.reviewToken();
  $('hands-save').disabled = true;
  try {
    const data = await request('GET'); if (disposed) return; snapshot = data; pickerRevisions.incorporate(data.revision, pickerReview);
    const select = $('hands-provider'); select.replaceChildren();
    const missing = snapshot.selected && !snapshot.providers.some(p => key(p) === key(snapshot.selected));
    for (const p of [null, ...snapshot.providers, ...(missing ? [{ ...snapshot.selected, label: `${key(snapshot.selected)} (missing)`, available: false }] : [])]) {
      const option = document.createElement('option'); option.value = key(p);
      option.textContent = p ? `${p.label}${p.available ? '' : ' (unavailable)'}` : 'Choose a provider';
      option.disabled = !!p && !p.available && key(p) !== key(snapshot.selected); select.append(option);
    }
    select.value = key(snapshot.selected); availability(); message(pickerRevisions.stale ? changedMessage : '');
    await mountAdjustments(data); adjustments?.refresh(data, { discard, review: adjustmentReview });
    if (pickerRevisions.stale) adjustments?.markStale();
    await applyViewProfile(data, generation);
  } catch (error) { snapshot = null; message(error.message); }
}
$('hands-provider').addEventListener('change', availability);
$('hands-reload').addEventListener('click', () => void load(true));
$('hands-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!snapshot) return;
  const source = snapshot.providers.find(p => key(p) === $('hands-provider').value);
  if (source ? !source.available : !!$('hands-provider').value) return;
  $('hands-save').disabled = true; beginWrite();
  try {
    await request('PUT', { provider: source ? { owner: source.owner, id: source.id } : null, revision: snapshot.revision, registryRevision: snapshot.registryRevision });
    await load(); message('Saved for next launch.');
  } catch (error) { message(`${error.message} Reload to review the current selection.`); }
  finally { endWrite(); }
});
const navigation = mountToolNavigation($('hands-menu-button'), $('hands-menu'), { origin: location.origin, current: 'hands' });
const disposeShell = mountHandsShell({ resetView: () => view?.resetView(), setViewOptions: options => view?.setViewOptions(options) });
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
// Stable host object for the separately delivered session and recorder components. No producer here.
const recorder = mountProviderRecorder({ actions: $('hands-recording-actions'), status: $('hands-recording-status'), view,
  restoreProfile: async () => { profileKey = ''; const generation = profileGeneration; try { await applyViewProfile(await request('GET'), generation); } catch (error) { message(error.message); } } });
export const handsPage = { get view() { return view; }, get snapshot() { return snapshot; }, recorder, request };
async function mountRecordingTools() {
  const root = $('hands-recordings-root');
  try {
    const status = await request('GET', null, '/api/hands/tools'); if (disposed) return;
    if (!status.available) { root.firstElementChild.textContent = status.reason; return; }
    if (status.module !== '/hands/tools/browser.mjs') throw new Error('Invalid recording component.');
    const module = await import(status.module); if (disposed) return;
    const toolsView = view ? Object.create(view) : null;
    if (toolsView) Object.defineProperty(toolsView, 'active', { get: () => view.active || recorder.replaying });
    tools = module.mountHandsTools({ root, view: toolsView });
  } catch (error) { if (!disposed) root.textContent = `Recording tools unavailable: ${error.message}`; }
}
void mountRecordingTools();
const events = new EventSource('/api/events');
let noticeRead = 0;
events.addEventListener('hands-changed', async event => {
  profileGeneration++;
  let revision; try { revision = JSON.parse(event.data).revision; } catch { /* Unversioned notices require review. */ }
  if (typeof revision === 'string' && revision === snapshot?.revision && revision === adjustments?.revision) return;
  const read = ++noticeRead;
  try {
    let stable = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const epoch = adjustments?.deliveryEpoch, current = await request('GET');
      if (disposed || read !== noticeRead) return;
      if (epoch !== adjustments?.deliveryEpoch) continue;
      revision = current.revision; stable = true; break;
    }
    if (!stable) revision = undefined;
  } catch { revision = undefined; }
  if (disposed || read !== noticeRead) return;
  if (pickerRevisions.changed(revision)) message(changedMessage);
  adjustments?.markStale(undefined, revision);
});
events.addEventListener('plugins-changed', () => { message('Provider availability changed. Reload before saving.'); });
let deliveryRead = 0;
const deliveryTimer = setInterval(() => {
  if (!snapshot || writes) return;
  const generation = profileGeneration, read = ++deliveryRead, epoch = adjustments?.deliveryEpoch;
  void request('GET').then(data => { if (!disposed && !writes && read === deliveryRead && generation === profileGeneration) { adjustments?.updateDelivery(data.delivery, data.deliveryState, data.revision, epoch); void applyViewProfile(data, generation); } }).catch(() => {});
}, 1000);
addEventListener('pagehide', () => { disposed = true; clearInterval(deliveryTimer); events.close(); recorder.dispose(); tools?.dispose(); adjustments?.dispose(); navigation?.(); disposeShell(); view?.dispose(); }, { once: true });
await load();
