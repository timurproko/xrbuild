import { mountToolNavigation } from './navigation.js';
import { mountHandAdjustments } from './hands-adjustments.js';
import { enhanceSelects, installDropdowns } from './design-system.js';
const $ = id => document.getElementById(id);
const key = p => p ? `${p.owner}/${p.id}` : '';
let snapshot = null;
async function request(method, body, endpoint = '/api/hands') {
  const res = await fetch(endpoint, { method, cache: 'no-store', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
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
const adjustments = mountHandAdjustments($('hands-adjustments'), {
  load: () => request('GET'),
  apply: async body => {
    const result = await request('POST', body, '/api/hands/apply');
    // Only advance a picker which actually reviewed the Apply request's base.
    // Adjustment-only Reload may have seen another client's source Save.
    if (snapshot?.revision === body.revision) snapshot.revision = result.revision;
    else $('hands-message').textContent = 'Source settings changed. Reload to review the current selection.';
    return result;
  },
});
const disposeSelects = enhanceSelects($('hands-form')), disposeDropdowns = installDropdowns(document);
async function load(discard = false) {
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
    adjustments.refresh(snapshot, { discard });
  } catch (error) { snapshot = null; $('hands-message').textContent = error.message; }
}
$('hands-provider').addEventListener('change', availability);
$('hands-reload').addEventListener('click', () => void load(true));
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
void fetch('/api/navigation').then(r => r.json()).then(data => { $('hands-diagnostics').hidden = !data.tools?.some(t => t.route === '/hands-diagnostics/'); }).catch(() => {});
const events = new EventSource('/api/events');
events.addEventListener('hands-changed', () => { $('hands-message').textContent = 'Hands settings changed. Reload to review them.'; adjustments.markStale(); });
events.addEventListener('plugins-changed', () => { $('hands-message').textContent = 'Provider availability changed. Reload before saving.'; });
const deliveryTimer = setInterval(() => { void request('GET').then(data => adjustments.updateDelivery(data.delivery, data.deliveryState)).catch(() => {}); }, 1000);
addEventListener('pagehide', () => { clearInterval(deliveryTimer); events.close(); adjustments.dispose(); disposeSelects(); disposeDropdowns(); }, { once: true });
await load();
