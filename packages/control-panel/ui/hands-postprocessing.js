import { renderField, installNumberSteppers } from './design-system.js';
import { handsEditorRevisions } from './hands-editor-revisions.js';
const key = p => p ? `${p.owner}/${p.id}` : '';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function request(method, body) {
  const res = await fetch('/api/hands/postprocessing', { method, cache: 'no-store', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await res.json(); if (!res.ok) throw new Error(data.error ?? 'Post-processing request failed'); return data;
}
/** Independent of the page/source/adjustment forms; mount into #hands-postprocessing-root. */
export function mountHandsPostprocessing(root, { load = () => request('GET'), save = body => request('PUT', body), pollMs = 1000 } = {}) {
  root.hidden = true;
  root.innerHTML = `<form class="xrb-stack" aria-label="Hand post-processing"><h2>Post-processing</h2>
    <label class="xrb-field-label">Hand mesh<select data-mesh-selector aria-label="Hand mesh"></select></label>
    <p class="xrb-help" data-mesh-empty hidden>No post-processing plugins installed.</p>
    <div class="xrb-stack" data-mesh-fields></div><p class="xrb-help" data-mesh-readiness></p>
    <div class="xrb-button-row"><button type="submit" data-mesh-save disabled>Save post-processing</button><button type="button" data-mesh-reload>Reload</button></div>
    <p class="xrb-help">Applies on next desktop run.</p>
    <p class="xrb-help">Post-processing is used only in desktop apps run from this panel, not browser previews, published web builds or offline packages.</p>
    <p class="xrb-help" data-mesh-runtime role="status" aria-live="polite"></p><p class="xrb-help" data-mesh-message role="status" aria-live="polite"></p></form>`;
  const form = root.querySelector('form'), select = root.querySelector('[data-mesh-selector]'), fields = root.querySelector('[data-mesh-fields]');
  const button = root.querySelector('[data-mesh-save]'), reload = root.querySelector('[data-mesh-reload]'), message = root.querySelector('[data-mesh-message]');
  const revisions = handsEditorRevisions();
  let snapshot = null, selected = '', drafts = {}, dirty = false, busy = false, disposed = false, reads = 0, stepperDispose = () => {};
  const plugin = () => snapshot?.plugins.find(p => key(p) === selected);
  const buttons = () => {
    button.disabled = !snapshot || !!snapshot.problem || !dirty || busy || revisions.stale || !!selected && !plugin()?.available;
    reload.disabled = busy; select.disabled = busy;
    for (const control of fields.querySelectorAll('input, select, button')) control.disabled = busy;
    root.dataset.dirty = String(dirty);
  };
  function renderFields() {
    stepperDispose();
    const p = plugin(), values = drafts[selected] ?? {};
    fields.innerHTML = (p?.declaration.settings ?? []).map(f => {
      let input;
      if (f.type === 'boolean') input = `<label class="xrb-switch"><input type="checkbox" data-mesh-field="${f.key}" aria-label="${esc(f.label)}"><span>${esc(f.label)}</span></label>`;
      else if (f.type === 'select') input = `<select data-mesh-field="${f.key}" aria-label="${esc(f.label)}">${f.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`;
      else input = `<input type="number" data-mesh-field="${f.key}" aria-label="${esc(f.label)}" min="${f.min}" max="${f.max}" step="${f.step ?? 'any'}" required>`;
      return f.type === 'boolean' ? `${input}${f.hint ? `<p class="xrb-help">${esc(f.hint)}</p>` : ''}` : renderField(esc(f.label), input, { hint: f.hint ?? '' });
    }).join('');
    for (const input of fields.querySelectorAll('[data-mesh-field]')) {
      const f = p.declaration.settings.find(f => f.key === input.dataset.meshField), v = values[f.key] ?? f.default;
      if (input.type === 'checkbox') input.checked = v; else input.value = v;
    }
    root.querySelector('[data-mesh-readiness]').textContent = snapshot?.problem ?? (selected ? p?.reason ?? 'Selected plugin is missing; desktop apps use the skeleton.' : 'None selected.');
    root.querySelector('[data-mesh-empty]').hidden = !!snapshot?.plugins.length || !!selected;
    stepperDispose = installNumberSteppers(fields); buttons();
  }
  function runtime(data) {
    if (disposed) return;
    root.querySelector('[data-mesh-runtime]').textContent = data.running
      ? `Current desktop run${data.active ? ` · ${data.active.label}` : ''}: ${data.status}`
      : 'Not started.';
  }
  function refresh(data, { discard = false } = {}) {
    if (disposed) return; runtime(data);
    root.hidden = !data.plugins.length;
    if (snapshot && !discard) {
      if (data.revision !== snapshot.revision) {
        revisions.changed(data.revision); message.textContent = 'Hands settings changed. Reload to review; your draft is preserved.';
      }
      if (data.registryRevision !== snapshot.registryRevision) { revisions.changed(); message.textContent = 'Mesh plugins changed. Reload before saving.'; }
      buttons(); return;
    }
    snapshot = data; selected = key(data.choice?.selected); drafts = {};
    for (const [id, v] of Object.entries(data.choice?.settings ?? {})) drafts[id] = { ...v.values };
    revisions.incorporate(data.revision, true); dirty = false; select.replaceChildren();
    for (const p of [null, ...data.plugins, ...(selected && !data.plugins.some(p => key(p) === selected) ? [{ ...data.choice.selected, label: `${selected} (missing)`, available: false }] : [])]) {
      const option = document.createElement('option'); option.value = key(p); option.textContent = p ? `${p.label}${p.available ? '' : ' (unavailable)'}` : 'None';
      option.disabled = !!p && !p.available && key(p) !== selected; select.append(option);
    }
    select.value = selected; message.textContent = data.problem ?? ''; renderFields();
  }
  async function read(discard = false) {
    const generation = ++reads;
    try { const data = await load(); if (!disposed && generation === reads && !busy) refresh(data, { discard }); }
    catch (e) { if (!disposed && generation === reads) message.textContent = e.message; }
  }
  const change = () => {
    if (busy || disposed) { select.value = selected; return; }
    selected = select.value; dirty = true; renderFields();
  };
  const input = event => {
    if (busy || disposed) return;
    const f = plugin()?.declaration.settings.find(f => f.key === event.target.dataset.meshField); if (!f) return;
    drafts[selected] ??= {}; drafts[selected][f.key] = f.type === 'boolean' ? event.target.checked : f.type === 'number' ? event.target.valueAsNumber : event.target.value;
    dirty = true; buttons();
  };
  const submit = async event => {
    event.preventDefault(); if (button.disabled || !form.reportValidity()) return;
    busy = true; reads++; buttons(); const p = plugin(), values = { ...(drafts[selected] ?? {}) };
    try {
      const result = await save({ selected: p ? { owner: p.owner, id: p.id } : null, values, revision: snapshot.revision, registryRevision: snapshot.registryRevision });
      if (disposed) return;
      snapshot = { ...snapshot, revision: result.revision, choice: result.choice }; revisions.incorporate(result.revision); dirty = false;
      renderFields(); // Restore the submitted snapshot even after a synthetic event on a disabled input.
      message.textContent = revisions.stale ? 'Saved; another change needs Reload/review.' : 'Saved. Applies on next desktop run.';
    } catch (e) { if (!disposed) message.textContent = `${e.message} Reload to review; your draft is preserved.`; }
    finally { busy = false; if (!disposed) buttons(); }
  };
  const reloadClick = () => { void read(true); };
  select.addEventListener('change', change); fields.addEventListener('input', input); fields.addEventListener('change', input);
  form.addEventListener('submit', submit); reload.addEventListener('click', reloadClick);
  const timer = pollMs ? setInterval(() => { if (!busy) void read(); }, pollMs) : null;
  void read(true);
  return { refresh, reload: reloadClick, dispose() {
    disposed = true; reads++; if (timer) clearInterval(timer); stepperDispose(); select.removeEventListener('change', change);
    fields.removeEventListener('input', input); fields.removeEventListener('change', input); form.removeEventListener('submit', submit); reload.removeEventListener('click', reloadClick);
  } };
}
