import { mountToolNavigation } from './navigation.js';
import { handsEditorRevisions } from './hands-editor-revisions.js';
import { mountHandAdjustments } from './hands-adjustments.js';
import { enhanceSelects, installDropdowns } from './design-system.js';
const $ = id => document.getElementById(id);
const key = p => p ? `${p.owner}/${p.id}` : '';
let snapshot = null;
const pickerRevisions = handsEditorRevisions();
const changedMessage = 'Hands settings changed. Reload to review them.';
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
    if (snapshot?.revision === body.revision) {
      snapshot.revision = result.revision; pickerRevisions.incorporate(result.revision);
      if (!pickerRevisions.stale && $('hands-message').textContent === changedMessage) $('hands-message').textContent = '';
    } else $('hands-message').textContent = 'Source settings changed. Reload to review the current selection.';
    return result;
  },
});
const disposeSelects = enhanceSelects($('hands-form')), disposeDropdowns = installDropdowns(document);
async function load(discard = false) {
  $('hands-save').disabled = true;
  const pickerReview = pickerRevisions.reviewToken(), adjustmentReview = adjustments.reviewToken();
  try {
    snapshot = await request('GET');
    pickerRevisions.incorporate(snapshot.revision, pickerReview);
    const select = $('hands-provider'); select.replaceChildren();
    for (const p of [null, ...snapshot.providers, ...(snapshot.selected && !snapshot.providers.some(p => key(p) === key(snapshot.selected)) ? [{ ...snapshot.selected, label: `${key(snapshot.selected)} (missing)`, available: false }] : [])]) {
      const option = document.createElement('option'); option.value = key(p);
      option.textContent = p ? `${p.label}${p.available ? '' : ' (unavailable)'}` : 'Choose a provider';
      option.disabled = !!p && !p.available && key(p) !== key(snapshot.selected);
      select.append(option);
    }
    select.value = key(snapshot.selected); availability(); $('hands-message').textContent = pickerRevisions.stale ? changedMessage : '';
    adjustments.refresh(snapshot, { discard, review: adjustmentReview });
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
let noticeRead = 0;
events.addEventListener('hands-changed', async event => {
  let revision; try { revision = JSON.parse(event.data).revision; } catch { /* An unversioned notice requires review. */ }
  if (typeof revision === 'string' && revision === snapshot?.revision && revision === adjustments.revision) return;
  const read = ++noticeRead;
  // A queued old notice and a real reversion can have the same hash. Read current state;
  // never sort hashes or treat every previously seen hash as permanently incorporated.
  try {
    let stable = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const epoch = adjustments.deliveryEpoch, current = await request('GET');
      if (read !== noticeRead) return;
      if (epoch !== adjustments.deliveryEpoch) continue;
      revision = current.revision; stable = true; break;
    }
    if (!stable) revision = undefined; // Busy concurrent editors still have an explicit Reload path.
  } catch { revision = undefined; }
  if (read !== noticeRead) return;
  if (pickerRevisions.changed(revision)) $('hands-message').textContent = changedMessage;
  adjustments.markStale(undefined, revision);
});
events.addEventListener('plugins-changed', () => { $('hands-message').textContent = 'Provider availability changed. Reload before saving.'; });
let deliveryRead = 0;
const deliveryTimer = setInterval(() => {
  const read = ++deliveryRead, epoch = adjustments.deliveryEpoch;
  void request('GET').then(data => { if (read === deliveryRead) adjustments.updateDelivery(data.delivery, data.deliveryState, data.revision, epoch); }).catch(() => {});
}, 1000);
addEventListener('pagehide', () => { clearInterval(deliveryTimer); events.close(); adjustments.dispose(); disposeSelects(); disposeDropdowns(); }, { once: true });
await load();
