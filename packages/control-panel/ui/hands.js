import { mountToolNavigation } from './navigation.js';
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
  $('hands-availability').textContent = source ? `${source.purpose} · ${source.reason}${snapshot.initial && key(snapshot.selected) === key(source) ? ' · Initial default' : ''}`
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
void fetch('/api/navigation').then(r => r.json()).then(data => { $('hands-diagnostics').hidden = !data.tools?.some(t => t.route === '/hands-diagnostics/'); }).catch(() => {});
const events = new EventSource('/api/events');
events.addEventListener('hands-changed', () => { $('hands-message').textContent = 'The saved choice changed. Reload to review it.'; });
events.addEventListener('plugins-changed', () => { $('hands-message').textContent = 'Provider availability changed. Reload before saving.'; });
addEventListener('pagehide', () => events.close(), { once: true });
await load();
