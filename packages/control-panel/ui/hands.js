import { mountToolNavigation } from './navigation.js';
import { mountHandsShell } from './hands-shell.js';
const $ = id => document.getElementById(id);
const key = p => p ? `${p.owner}/${p.id}` : '';
let snapshot = null;
async function request(method, body) {
  const res = await fetch('/api/hands', { method, cache: 'no-store', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Hands request failed');
  return data;
}
function availability() {
  const source = snapshot?.providers.find(p => key(p) === $('hands-provider').value);
  const missing = $('hands-provider').value && !source;
  $('hands-availability').textContent = source ? `${source.purpose} · ${source.reason}${source.runtimeState ? ` · Last reported: ${source.runtimeState}` : ''}${snapshot.initial && key(snapshot.selected) === key(source) ? ' · Initial default' : ''}`
    : missing ? 'Selected provider is missing. It has not been replaced.' : 'Hand requires a provider choice.';
  $('hands-save').disabled = !snapshot || !!missing || !!source && !source.available;
}
async function load() {
  $('hands-save').disabled = true;
  try {
    snapshot = await request('GET');
    const select = $('hands-provider'); select.replaceChildren();
    for (const p of [null, ...snapshot.providers, ...(snapshot.selected && !snapshot.providers.some(p => key(p) === key(snapshot.selected)) ? [{ ...snapshot.selected, label: `${key(snapshot.selected)} (missing)`, available: false }] : [])]) {
      const option = document.createElement('option'); option.value = key(p);
      option.textContent = p ? `${p.label}${p.available ? '' : ' (unavailable)'}` : 'Choose a provider';
      option.disabled = !!p && !p.available && key(p) !== key(snapshot.selected);
      select.append(option);
    }
    select.value = key(snapshot.selected); availability(); $('hands-message').textContent = '';
  } catch (error) { snapshot = null; $('hands-message').textContent = error.message; }
}
$('hands-provider').addEventListener('change', availability);
$('hands-reload').addEventListener('click', () => void load());
$('hands-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!snapshot) return;
  const source = snapshot.providers.find(p => key(p) === $('hands-provider').value);
  $('hands-save').disabled = true;
  try {
    await request('PUT', { provider: source ? { owner: source.owner, id: source.id } : null, revision: snapshot.revision, registryRevision: snapshot.registryRevision });
    await load(); $('hands-message').textContent = 'Saved. Applies on next launch.';
  } catch (error) { $('hands-message').textContent = `${error.message} Reload to review the current selection.`; }
});
mountToolNavigation($('hands-menu-button'), $('hands-menu'), { origin: location.origin, current: 'hands' });
let view = null;
const disposeShell = mountHandsShell({ resetView: () => view?.resetView(), setViewOptions: options => view?.setViewOptions(options) });
try {
  const { createHandsView } = await import('./hands-view.js');
  view = createHandsView({ canvas: $('hands-canvas'), viewport: $('hands-viewport'), onMetrics: metrics => {
    $('hands-render-fps').textContent = metrics.renderFps.toFixed(1);
  } });
} catch (error) { $('hands-view-error').hidden = false; $('hands-view-error').textContent = `3D view unavailable: ${error.message}`; }
addEventListener('pagehide', () => { disposeShell(); view?.dispose(); }, { once: true });
const events = new EventSource('/api/events');
events.addEventListener('hands-changed', () => { $('hands-message').textContent = 'The saved choice changed. Reload to review it.'; });
events.addEventListener('plugins-changed', () => { $('hands-message').textContent = 'Provider availability changed. Reload before saving.'; });
addEventListener('pagehide', () => events.close(), { once: true });
await load();
