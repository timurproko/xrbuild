import { mountToolNavigation } from './navigation.js';
import { mountHandsShell } from './hands-shell.js';
const $ = id => document.getElementById(id), key = p => p ? `${p.owner}/${p.id}` : '';
let snapshot = null, view = null, adjustments = null, tools = null, disposed = false, profileKey = '';
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
  $('hands-save').disabled = !snapshot || !!missing || !source || !source.available;
}
async function applyViewProfile(data) {
  if (!data.profile || !view) return;
  const next = JSON.stringify(data.profile); if (next === profileKey) return;
  try { if (await view.setProfile(data.profile)) profileKey = next; }
  catch (error) { message(`Saved profile; view unavailable: ${error.message}`); }
}
async function mountAdjustments(data) {
  if (!data.profile || adjustments || disposed) return;
  const { mountHandAdjustments } = await import('./hands-adjustments.js');
  if (disposed) return;
  adjustments = mountHandAdjustments($('hands-adjustments-root'), {
    load: () => request('GET'),
    apply: async body => {
      const result = await request('POST', body, '/api/hands/apply');
      if (snapshot) snapshot = { ...snapshot, ...result }; // Do not touch the source picker draft.
      await applyViewProfile(result); return result;
    },
  });
}
async function load(discard = false) {
  $('hands-save').disabled = true;
  try {
    const data = await request('GET'); if (disposed) return; snapshot = data;
    const select = $('hands-provider'); select.replaceChildren();
    const missing = snapshot.selected && !snapshot.providers.some(p => key(p) === key(snapshot.selected));
    for (const p of [null, ...snapshot.providers, ...(missing ? [{ ...snapshot.selected, label: `${key(snapshot.selected)} (missing)`, available: false }] : [])]) {
      const option = document.createElement('option'); option.value = key(p);
      option.textContent = p ? `${p.label}${p.available ? '' : ' (unavailable)'}` : 'Choose a provider';
      option.disabled = !!p && !p.available && key(p) !== key(snapshot.selected); select.append(option);
    }
    select.value = key(snapshot.selected); availability(); message();
    await mountAdjustments(data); adjustments?.refresh(data, { discard }); await applyViewProfile(data);
  } catch (error) { snapshot = null; message(error.message); }
}
$('hands-provider').addEventListener('change', availability);
$('hands-reload').addEventListener('click', () => void load(true));
$('hands-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!snapshot) return;
  const source = snapshot.providers.find(p => key(p) === $('hands-provider').value); if (!source?.available) return;
  $('hands-save').disabled = true;
  try {
    await request('PUT', { provider: { owner: source.owner, id: source.id }, revision: snapshot.revision, registryRevision: snapshot.registryRevision });
    await load(); message('Saved for next launch.');
  } catch (error) { message(`${error.message} Reload to review the current selection.`); }
});
const navigation = mountToolNavigation($('hands-menu-button'), $('hands-menu'), { origin: location.origin, current: 'hands' });
const disposeShell = mountHandsShell({ resetView: () => view?.resetView(), setViewOptions: options => view?.setViewOptions(options) });
try {
  const { createHandsView } = await import('./hands-view.js');
  view = createHandsView({ canvas: $('hands-canvas'), viewport: $('hands-viewport'),
    onMetrics: metrics => {
      $('hands-render-fps').textContent = metrics.renderFps.toFixed(1);
      $('hands-tracking-fps').textContent = metrics.trackingFps === null ? '—' : metrics.trackingFps.toFixed(1);
    },
    onStatus: status => {
      $('hands-view-empty').hidden = status.phase === 'replay' || status.phase === 'running' && status.hands > 0;
      $('hands-view-empty').firstElementChild.textContent = status.phase === 'running' ? 'No hands detected.' : 'No live hand session.';
      if (status.phase === 'idle') $('hands-tracking-fps').textContent = '—';
    },
  });
} catch (error) { $('hands-view-error').hidden = false; $('hands-view-error').textContent = `3D view unavailable: ${error.message}`; }
// Stable host object for the separately delivered session and recorder components. No producer here.
export const handsPage = { get view() { return view; }, get snapshot() { return snapshot; }, request };
const events = new EventSource('/api/events');
events.addEventListener('hands-changed', () => { message('Hands settings changed. Reload to review.'); adjustments?.markStale(); });
events.addEventListener('plugins-changed', () => { message('Provider availability changed. Reload before saving.'); });
const deliveryTimer = setInterval(() => { if (snapshot) void request('GET').then(data => { if (!disposed) { adjustments?.updateDelivery(data.delivery); void applyViewProfile(data); } }).catch(() => {}); }, 1000);
addEventListener('pagehide', () => { disposed = true; clearInterval(deliveryTimer); events.close(); tools?.dispose(); adjustments?.dispose(); navigation?.(); disposeShell(); view?.dispose(); }, { once: true });
await load();
