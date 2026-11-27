import { renderField, setFieldError, installNumberSteppers, iconSvg, openFloating, positionFloating } from './design-system.js';
import { menuKeyboard } from './navigation.js';
const key = p => p ? `${p.owner}/${p.id}` : '';
const identity = value => value ? { owner: value.slice(0, value.lastIndexOf('/')), id: value.slice(value.lastIndexOf('/') + 1) } : null;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let mounts = 0;
async function request(method, body, suffix = '') {
  const res = await fetch(`/api/hands/postprocessing${suffix}`, { method, cache: 'no-store', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await res.json();
  if (!res.ok) { const error = new Error(data.error ?? 'Post-processing request failed'); error.status = res.status; throw error; }
  return data;
}
/** Independent root and revision-safe editor. Preview, persistence and runtime evidence are separate. */
export function mountHandsPostprocessing(root, { load = () => request('GET'), save = body => request('PUT', body), pollMs = 1000 } = {}) {
  const prefix = `hands-postprocessing-${++mounts}`;
  root.hidden = true;
  root.innerHTML = `<form class="xrb-stack hands-postprocessing" aria-label="Hand post-processing"><div class="row"><h2>Post-processing</h2><span class="spacer"></span>
    <button type="button" class="xrb-icon-button" id="${prefix}-settings" data-mesh-gear aria-label="Post-processing settings" aria-haspopup="menu" aria-controls="${prefix}-menu" aria-expanded="false">${iconSvg('settings')}</button>
    <div class="menu" id="${prefix}-menu" role="menu" aria-labelledby="${prefix}-settings" hidden><button type="button" role="menuitem" data-mesh-reset>Reset to defaults</button></div></div>
    <label class="xrb-field-label">Hand mesh<select data-mesh-selector aria-label="Hand mesh"></select></label>
    <div class="xrb-stack" data-mesh-fields></div><p class="xrb-help" data-mesh-readiness hidden></p>
    <p class="xrb-help" data-mesh-runtime role="status" aria-live="polite" hidden></p>
    <div data-mesh-recovery hidden><p class="field-error" data-mesh-message role="alert"></p><div class="xrb-button-row"><button type="button" class="small" data-mesh-retry>Retry</button><button type="button" class="small" data-mesh-discard hidden>Use saved</button></div></div>
    <p class="xrb-help">Post-processing is not used in browser previews, published web builds or offline packages.</p></form>`;
  const form = root.querySelector('form'), select = root.querySelector('[data-mesh-selector]'), fields = root.querySelector('[data-mesh-fields]');
  const message = root.querySelector('[data-mesh-message]'), recovery = root.querySelector('[data-mesh-recovery]');
  const retryButton = root.querySelector('[data-mesh-retry]'), discard = root.querySelector('[data-mesh-discard]');
  const gear = root.querySelector('[data-mesh-gear]'), menu = root.querySelector('[role="menu"]'), reset = root.querySelector('[data-mesh-reset]');
  const events = new AbortController(), document = root.ownerDocument, edits = new Map();
  let snapshot = null, selected = '', disposed = false, busy = false, reading = false, epoch = 0, version = 0;
  let failure = null, conflict = null, rendered = '', stepperDispose = () => {};
  const plugin = (data = snapshot, id = selected) => data?.plugins.find(p => key(p) === id);
  const schema = (data, id) => { const p = plugin(data, id); return p ? JSON.stringify([p.declaration.settingsVersion, p.declaration.settings]) : null; };
  const valueAt = (data, id, field) => {
    const p = plugin(data, id), f = p?.declaration.settings.find(f => f.key === field), stored = data?.choice?.settings?.[id];
    return stored?.version === p?.declaration.settingsVersion && Object.hasOwn(stored.values, field) ? stored.values[field] : f?.default;
  };
  const editKey = (id, field) => `${id}#${field}`;
  const closeMenu = (focus = false) => { menu.hidden = true; gear.setAttribute('aria-expanded', 'false'); if (focus) gear.focus(); };
  const showMenu = () => { if (!gear.disabled) { gear.setAttribute('aria-expanded', 'true'); openFloating(menu, { anchor: gear }); } };
  function buttons() {
    root.dataset.dirty = String(edits.size > 0); root.dataset.saving = String(busy);
    select.disabled = !snapshot || !!snapshot.problem;
    gear.disabled = reset.disabled = !snapshot || !!snapshot.problem || !plugin()?.available || !plugin()?.declaration.settings.length;
    message.textContent = failure ?? snapshot?.problem ?? '';
    recovery.hidden = !message.textContent; retryButton.disabled = busy;
    discard.hidden = !conflict; discard.disabled = busy;
  }
  function render() {
    if (!snapshot || disposed) { buttons(); return; }
    root.hidden = !snapshot.plugins.length;
    const p = plugin(), signature = JSON.stringify([selected, schema(snapshot, selected)]);
    // Do not reconstruct controls on every status poll or write completion: retain focus and partial input.
    if (signature !== rendered) {
      closeMenu(); stepperDispose(); rendered = signature;
      fields.innerHTML = (p?.declaration.settings ?? []).map(f => {
        const attrs = `aria-label="${esc(f.label)}" data-mesh-field="${f.key}"`;
        if (f.type === 'boolean') return `<label class="xrb-switch"><input type="checkbox" ${attrs}><span>${esc(f.label)}</span></label>${f.hint ? `<p class="xrb-help">${esc(f.hint)}</p>` : ''}`;
        const control = f.type === 'select' ? `<select ${attrs}>${f.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`
          : `<span class="hands-number-row"><input type="number" ${attrs} min="${f.min}" max="${f.max}" step="${f.step ?? 'any'}" required><input type="range" class="xrb-range" data-mesh-range="${f.key}" aria-label="${esc(f.label)} slider" min="${f.min}" max="${f.max}" step="${f.step ?? 'any'}"></span>`;
        return renderField(esc(f.label), control, { hint: f.hint ?? '' });
      }).join('');
      stepperDispose = installNumberSteppers(fields);
    }
    const options = [null, ...snapshot.plugins, ...(selected && !p ? [{ ...identity(selected), label: `${selected} (missing)`, available: false }] : [])];
    const optionsKey = JSON.stringify(options.map(p => [key(p), p?.label, p?.available]));
    if (select.dataset.options !== optionsKey) {
      select.replaceChildren(); select.dataset.options = optionsKey;
      for (const p of options) {
        const option = document.createElement('option'); option.value = key(p); option.textContent = p ? `${p.label}${p.available ? '' : ' (unavailable)'}` : 'None';
        option.disabled = !!p && !p.available && key(p) !== selected; select.append(option);
      }
    }
    select.value = selected;
    for (const field of fields.querySelectorAll('[data-mesh-field]')) {
      const f = p.declaration.settings.find(f => f.key === field.dataset.meshField), edit = edits.get(editKey(selected, f.key));
      const value = edit ? edit.value : valueAt(snapshot, selected, f.key);
      if (field.type === 'checkbox') field.checked = value; else field.value = edit?.raw ?? value;
      field.disabled = !p.available || !!snapshot.problem;
      const range = fields.querySelector(`[data-mesh-range="${f.key}"]`);
      if (range) { if (Number.isFinite(value)) range.value = value; range.disabled = field.disabled; }
      setFieldError(field, edit?.invalid ? field.validationMessage : '');
    }
    const readiness = root.querySelector('[data-mesh-readiness]');
    readiness.textContent = selected && !p?.available ? p?.reason ?? 'Selected plugin is missing.' : '';
    readiness.hidden = !readiness.textContent;
    buttons();
  }
  function runtime(data) {
    const status = root.querySelector('[data-mesh-runtime]');
    status.textContent = data.running ? data.status ?? '' : ''; status.hidden = !status.textContent;
  }
  function incorporate(data) {
    snapshot = data;
    if (!edits.has('$selection')) selected = key(data.choice?.selected);
    runtime(data); render();
  }
  function refresh(data, { discard: discardEdits = false } = {}) {
    if (disposed || busy) return;
    epoch++;
    if (discardEdits) { edits.clear(); failure = conflict = null; }
    incorporate(data);
  }
  async function read(discardEdits = false) {
    if (disposed || busy || reading) return;
    reading = true; const token = ++epoch;
    try {
      const data = await load();
      if (!disposed && token === epoch && !busy) {
        if (discardEdits) { edits.clear(); failure = conflict = null; }
        incorporate(data);
      }
    } catch (error) { if (!disposed && token === epoch) { failure = error.message; buttons(); } }
    finally { reading = false; }
  }
  function editField(field, committed = false) {
    if (!snapshot || snapshot.problem || !plugin()?.available) return;
    const id = selected, name = field.dataset.meshField ?? field.dataset.meshRange;
    const f = plugin().declaration.settings.find(f => f.key === name); if (!f) return;
    const canonical = fields.querySelector(`[data-mesh-field="${name}"]`), range = fields.querySelector(`[data-mesh-range="${name}"]`);
    if (field.type === 'range') canonical.value = field.value;
    const value = f.type === 'boolean' ? canonical.checked : f.type === 'number' ? canonical.valueAsNumber : canonical.value;
    if (range && canonical.validity.valid) range.value = value;
    const idKey = editKey(id, name), previous = edits.get(idKey), invalid = !canonical.checkValidity();
    if (!previous && equal(value, valueAt(snapshot, id, name)) && !invalid) return;
    if (!previous || !equal(previous.value, value) || previous.raw !== canonical.value) {
      edits.set(idKey, { id, name, base: previous?.base ?? valueAt(snapshot, id, name), value, raw: f.type === 'number' ? canonical.value : undefined,
        schema: previous?.schema ?? schema(snapshot, id), selectionBase: previous?.selectionBase ?? key(snapshot.choice?.selected), committed: false, invalid, version: ++version });
    }
    const edit = edits.get(idKey);
    if (committed && !invalid) edit.committed = true;
    setFieldError(canonical, committed && invalid ? canonical.validationMessage : ''); buttons();
    if (committed && !invalid && !conflict) { failure = null; void flush(); }
  }
  function choose() {
    if (!snapshot || select.disabled || disposed) return;
    const next = select.value, previous = edits.get('$selection');
    if (next === selected) return;
    selected = next;
    edits.set('$selection', { base: previous?.base ?? key(snapshot.choice?.selected), value: next, committed: true, version: ++version });
    render(); if (!conflict) { failure = null; void flush(); }
  }
  const makeConflict = (current, sent, keys, reason = 'Changed elsewhere.') => {
    const error = new Error(reason); error.current = current; error.keys = keys; error.sent = sent; return error;
  };
  async function flush() {
    if (disposed || busy || conflict || !snapshot || snapshot.problem) return;
    const target = selected;
    const sent = new Map([...edits].filter(([name, edit]) => edit.committed && (name === '$selection' || edit.id === target)));
    if (!sent.size) return;
    busy = true; epoch++; buttons(); let success = false;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await load(); if (disposed) return;
        if (current.problem) throw new Error(current.problem);
        const selection = sent.get('$selection'), savedSelection = key(current.choice?.selected);
        const conflicts = [...sent].filter(([name, edit]) => name === '$selection'
          ? savedSelection !== edit.base && savedSelection !== edit.value
          : schema(current, target) !== edit.schema || savedSelection !== (selection ? selection.base : edit.selectionBase) && savedSelection !== target
            || !equal(valueAt(current, target, edit.name), edit.base) && !equal(valueAt(current, target, edit.name), edit.value)).map(([name]) => name);
        if (conflicts.length) throw makeConflict(current, sent, conflicts);
        const p = plugin(current, target);
        if (target && !p?.available) throw makeConflict(current, sent, [...sent.keys()], p?.reason ?? 'Selected plugin is unavailable.');
        const values = Object.fromEntries((p?.declaration.settings ?? []).map(f => [f.key, valueAt(current, target, f.key)]));
        for (const [name, edit] of sent) if (name !== '$selection') values[edit.name] = edit.value;
        // Equivalent Enter/change or a value changed back while queued needs no duplicate PUT.
        const same = savedSelection === target && [...sent].every(([name, edit]) => name === '$selection' || equal(valueAt(current, target, edit.name), edit.value));
        let result;
        try {
          if (disposed) return;
          result = same ? current : { ...current, ...await save({ selected: identity(target), values, revision: current.revision, registryRevision: current.registryRevision }) };
        } catch (error) {
          if (error.status === 409 && /profile changed|providers changed|mesh plugins changed/i.test(error.message) && attempt < 2) continue;
          throw error;
        }
        if (disposed) return;
        for (const [name, edit] of sent) {
          const latest = edits.get(name);
          if (latest?.version === edit.version) edits.delete(name);
          else if (latest) { latest.base = edit.value; if (name !== '$selection') latest.selectionBase = target; }
        }
        failure = conflict = null; incorporate(result); success = true; break;
      }
    } catch (error) {
      if (disposed) return;
      conflict = error.current ? error : null;
      const saved = conflict?.keys.map(name => name === '$selection' ? `Hand mesh: ${key(error.current.choice?.selected) || 'None'}`
        : `${error.sent.get(name).name}: ${JSON.stringify(valueAt(error.current, error.sent.get(name).id, error.sent.get(name).name))}`).join(', ');
      failure = conflict ? `${error.message} Saved ${saved}. Retry your value or use saved.` : `Couldn't save post-processing. ${error.message}`;
    } finally {
      busy = false;
      if (!disposed) { render(); if (success) void flush(); }
    }
  }
  function retrySave() {
    if (busy || disposed) return;
    if (conflict) {
      for (const name of conflict.keys) {
        const edit = edits.get(name); if (!edit) continue;
        if (name === '$selection') edit.base = key(conflict.current.choice?.selected);
        else {
          if (!plugin(conflict.current, edit.id)?.declaration.settings.some(f => f.key === edit.name)) { failure = 'Setting is no longer declared. Use saved to review.'; buttons(); return; }
          edit.base = valueAt(conflict.current, edit.id, edit.name); edit.schema = schema(conflict.current, edit.id); edit.selectionBase = key(conflict.current.choice?.selected);
        }
      }
      snapshot = conflict.current; conflict = null;
    }
    failure = null; if (snapshot) void flush(); else void read();
  }
  const on = (element, name, listener, options = {}) => element.addEventListener(name, listener, { ...options, signal: events.signal });
  on(gear, 'click', () => menu.hidden ? showMenu() : closeMenu());
  on(gear, 'keydown', event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); showMenu(); } });
  const outside = event => { if (!gear.contains(event.target) && !menu.contains(event.target)) closeMenu(); };
  on(document, 'click', outside); on(document, 'focusin', outside);
  on(document, 'scroll', () => { if (!menu.hidden) positionFloating(menu, { anchor: gear }); }, { capture: true });
  on(document.defaultView, 'resize', () => closeMenu());
  on(form, 'keydown', event => {
    if (!menu.hidden) { menuKeyboard(event, menu, () => closeMenu(true)); return; }
    if (event.key === 'Enter' && event.target.matches('[data-mesh-field]')) { event.preventDefault(); editField(event.target, true); }
  });
  on(form, 'submit', event => event.preventDefault());
  on(select, 'change', choose);
  on(fields, 'input', event => editField(event.target)); on(fields, 'change', event => editField(event.target, true));
  // Shared native stepUp/Down rejects step=any. Supply a local bounded continuous increment instead.
  on(fields, 'click', event => {
    const button = event.target.closest('[data-number-step]'), input = button?.closest('.xrb-number-control')?.querySelector('input');
    if (!input || input.disabled || input.step !== 'any') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const min = Number(input.min), max = Number(input.max), delta = (max - min) / 100 || 1;
    input.value = Math.min(max, Math.max(min, (Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : min) + (button.dataset.numberStep === 'up' ? delta : -delta)));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { capture: true });
  on(reset, 'click', () => {
    if (reset.disabled) return;
    closeMenu(true);
    for (const f of plugin().declaration.settings) {
      const idKey = editKey(selected, f.key), previous = edits.get(idKey);
      edits.set(idKey, { id: selected, name: f.key, base: previous?.base ?? valueAt(snapshot, selected, f.key), value: f.default,
        schema: previous?.schema ?? schema(snapshot, selected), selectionBase: previous?.selectionBase ?? key(snapshot.choice?.selected), committed: true, version: ++version });
    }
    render(); if (!conflict) { failure = null; void flush(); }
  });
  on(retryButton, 'click', retrySave);
  on(discard, 'click', () => {
    if (!conflict || busy) return;
    const current = conflict.current;
    for (const name of conflict.keys) edits.delete(name);
    failure = conflict = null; incorporate(current); void flush();
  });
  on(document.defaultView, 'beforeunload', event => { if (edits.size || busy) { event.preventDefault(); event.returnValue = ''; } });
  const timer = pollMs ? setInterval(() => { void read(); }, pollMs) : null;
  void read();
  return { refresh, reload: () => { void read(true); }, dispose() {
    if (disposed) return;
    disposed = true; epoch++; if (timer) clearInterval(timer); closeMenu(); events.abort(); stepperDispose(); root.replaceChildren();
  } };
}
