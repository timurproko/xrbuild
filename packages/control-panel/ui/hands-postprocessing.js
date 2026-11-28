import { renderField, setFieldError, installNumberSteppers, iconSvg } from './design-system.js';
import { isPanelUnavailable } from './navigation.js';
import { openMeshSetup } from './hands-mesh-setup.js';
import { handsLog } from './hands-log.js';
import { toast, closeToast } from './toast.js';
import { pendingSwitch } from './pending-switch.js';
const key = p => p ? `${p.owner}/${p.id}` : '';
const identity = value => value ? { owner: value.slice(0, value.lastIndexOf('/')), id: value.slice(value.lastIndexOf('/') + 1) } : null;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
async function request(method, body, suffix = '') {
  const res = await fetch(`/api/hands/postprocessing${suffix}`, { method, cache: 'no-store', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const error = new Error(data.error ?? 'Post-processing request failed'); error.status = res.status; throw error; }
  return data;
}
/** Independent root and revision-safe editor. Preview, persistence and runtime evidence are separate. */
export function mountHandsPostprocessing(root, { load = () => request('GET'), save = body => request('PUT', body), retry = body => request('POST', body, '/retry'), pollMs = 1000, onLayer = () => {} } = {}) {
  root.hidden = true;
  root.innerHTML = `<form class="xrb-stack hands-postprocessing" aria-label="Hand post-processing">
    <select data-mesh-selector aria-label="Hand mesh" hidden></select>
    <div class="dropdown" data-mesh-layers data-default="Add layer" data-options="" data-labels="{}"><input type="hidden" data-mesh-layer-value value=""><button type="button" class="dropdown-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Add post-processing layer">Add layer</button></div>
    <section class="hands-mesh-layer xrb-stack" data-mesh-layer hidden><div class="row hands-mesh-layer-header"><strong data-mesh-layer-title></strong><span class="spacer"></span><button type="button" class="xrb-setup-install" data-mesh-install hidden><span>Install</span></button><span class="state ok" data-mesh-ready hidden>Ready</span><button type="button" class="xrb-setup-install" data-mesh-delivery-retry hidden><span>Retry</span></button><label class="xrb-switch hands-mesh-layer-switch"><input type="checkbox" data-mesh-layer-enabled aria-label="Layer on"></label><button type="button" class="xrb-icon-button" data-mesh-layer-remove aria-label="Remove layer" data-no-tooltip>${iconSvg('close')}</button></div>
    <div class="xrb-stack" data-mesh-fields></div>
    <div class="xrb-field-label">Mesh color<span class="hands-number-row"><input type="number" id="hands-mesh-brightness" aria-label="Mesh brightness" min="0" max="2" step="0.01"><input class="xrb-range" type="range" id="hands-mesh-brightness-range" aria-label="Mesh brightness slider" min="0" max="2" step="0.01"><span class="xrb-inline-icons"><button type="button" id="hands-mesh-color" class="xrb-swatch" aria-label="Choose mesh color" aria-haspopup="dialog"></button></span></span></div>
    <p class="xrb-help" data-mesh-readiness hidden></p></section>
    <p data-mesh-runtime role="status" hidden></p>
    <div data-mesh-recovery hidden><p class="field-error" data-mesh-message role="alert"></p><div class="xrb-button-row"><button type="button" class="small" data-mesh-retry>Retry</button><button type="button" class="small" data-mesh-discard hidden>Use saved</button></div></div></form>`;
  const form = root.querySelector('form'), select = root.querySelector('[data-mesh-selector]'), fields = root.querySelector('[data-mesh-fields]');
  const message = root.querySelector('[data-mesh-message]'), recovery = root.querySelector('[data-mesh-recovery]');
  const retryButton = root.querySelector('[data-mesh-retry]'), discard = root.querySelector('[data-mesh-discard]');
  const layers = root.querySelector('[data-mesh-layers]'), layerValue = root.querySelector('[data-mesh-layer-value]'), layer = root.querySelector('[data-mesh-layer]');
  const ready = root.querySelector('[data-mesh-ready]'), install = root.querySelector('[data-mesh-install]'), layerOn = root.querySelector('[data-mesh-layer-enabled]');
  let shownProblem = '';
  // The layer switch moves and locks on click, the badge follows the request, and it unlocks once the saved state matches.
  const layerSwitch = pendingSwitch(layerOn, {
    onPending: () => { if (!disposed) render(); },
    onError: error => { if (!disposed && !isPanelUnavailable(error)) { failure = `Couldn't switch the layer. ${error.message}`; buttons(); } },
    commit: async next => {
      epoch++; // Answers to reads that started before the click can no longer repaint the old state.
      const current = await load(), target = key(current.choice?.selected);
      if (!target) throw new Error('No layer is selected');
      const values = current.choice?.settings?.[target]?.values ?? {};
      const result = await save({ selected: identity(target), enabled: next, values, revision: current.revision, registryRevision: current.registryRevision });
      if (!disposed) { failure = null; epoch++; incorporate({ ...current, ...result }); }
    },
  });
  const events = new AbortController(), document = root.ownerDocument, edits = new Map();
  let snapshot = null, selected = '', disposed = false, busy = false, reading = false, epoch = 0, version = 0, installing = false;
  let failure = null, conflict = null, rendered = '', stepperDispose = () => {};
  let delivery = null, observedRun = null, highestGeneration = -1, retrying = false, deliveryFailure = null;
  const retiredRuns = new Set(), deliveryRetry = root.querySelector('[data-mesh-delivery-retry]');
  const plugin = (data = snapshot, id = selected) => data?.plugins.find(p => key(p) === id);
  const schema = (data, id) => { const p = plugin(data, id); return p ? JSON.stringify([p.declaration.settingsVersion, p.declaration.settings]) : null; };
  const valueAt = (data, id, field) => {
    const p = plugin(data, id), f = p?.declaration.settings.find(f => f.key === field), stored = data?.choice?.settings?.[id];
    return stored && p && stored.version === p.declaration.settingsVersion && Object.hasOwn(stored.values, field) ? stored.values[field] : f?.default;
  };
  const editKey = (id, field) => `${id}#${field}`;
  function buttons() {
    root.dataset.dirty = String(edits.size > 0); root.dataset.saving = String(busy);
    select.disabled = !snapshot || !!snapshot.problem;
    layers.querySelector('.dropdown-btn').disabled = select.disabled || !snapshot?.plugins.length;
    message.textContent = failure ?? snapshot?.problem ?? '';
    // Problems show as a toast with Retry (and Use saved after a conflict); the inline recovery block stays hidden.
    recovery.hidden = true; retryButton.disabled = busy;
    const problem = message.textContent, key = `${problem}|${!!conflict}`;
    if (key !== shownProblem) {
      shownProblem = key;
      if (!problem) closeToast('hands-postprocessing');
      else toast({ title: plugin()?.label ?? 'Mesh', message: problem, tone: 'err', id: 'hands-postprocessing', actions: [
        { label: 'Retry', onClick: () => retryButton.click() }, ...(conflict ? [{ label: 'Use saved', onClick: () => discard.click() }] : [])] });
    }
    discard.hidden = !conflict; discard.disabled = busy;
    renderRuntime();
  }
  function render() {
    if (!snapshot || disposed) { buttons(); return; }
    root.hidden = !snapshot.plugins.length;
    const p = plugin(), signature = JSON.stringify([selected, schema(snapshot, selected)]);
    // Do not reconstruct controls on every status poll or write completion: retain focus and partial input.
    const rebuilt = signature !== rendered;
    if (rebuilt) {
      stepperDispose(); rendered = signature;
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
        option.disabled = !!p && !p.available && !p.needsSetup && key(p) !== selected; select.append(option);
      }
    }
    select.value = selected;
    // Layers: the picker lists every post-processing plugin; one hand-mesh layer runs at a time, so adding one replaces another.
    layers.dataset.options = snapshot.plugins.map(key).join('|');
    layers.dataset.labels = JSON.stringify(Object.fromEntries(snapshot.plugins.map(p => [key(p), p.label])));
    layerValue.value = selected ?? '';
    layer.hidden = !selected;
    layer.querySelector('[data-mesh-layer-title]').textContent = p?.label ?? (selected ? `${selected} (missing)` : '');
    // Like Build prerequisites: a small Install while setup is missing, Ready once the plugin can run.
    // Install shows while the runtime is missing, or while the current settings need another declared runtime (GPU).
    // While a prerequisite is missing only Install acts; the setting that asks for it stays editable, so it can be switched back.
    const prerequisite = !!(p?.setup && (p.needsSetup || p.setupNeeded));
    install.hidden = !prerequisite;
    layer.classList.toggle('is-prerequisite', prerequisite);
    onLayer(p && (layerSwitch.pending ?? snapshot.choice?.enabled !== false) ? p.label : null);
    // The switch shows the saved state; off keeps the layer and its settings but runs nothing.
    const shownOn = layerSwitch.sync(snapshot.choice?.enabled !== false,
      { disabled: busy || prerequisite || !selected || key(snapshot.choice?.selected) !== selected || !!snapshot.problem });
    layer.classList.toggle('is-off', !shownOn);
    for (const control of layer.querySelectorAll('#hands-mesh-brightness, #hands-mesh-brightness-range, #hands-mesh-color')) control.disabled = prerequisite;
    install.disabled = installing;
    for (const field of fields.querySelectorAll('[data-mesh-field]')) {
      const f = p.declaration.settings.find(f => f.key === field.dataset.meshField), edit = edits.get(editKey(selected, f.key));
      const value = edit ? edit.value : valueAt(snapshot, selected, f.key);
      if (field.type === 'checkbox') field.checked = value;
      // Chrome keeps partial numbers (for example '-') outside .value. Reassigning even '' destroys that text.
      else if (field.type !== 'number' || !edit || rebuilt) field.value = edit?.raw ?? value;
      field.disabled = !(p.available || p.needsSetup) || !!snapshot.problem || prerequisite && f.key !== p.setupNeeded?.setting;
      const range = fields.querySelector(`[data-mesh-range="${f.key}"]`);
      if (range) { if (Number.isFinite(value)) range.value = value; range.disabled = field.disabled; }
      setFieldError(field, edit?.invalid ? field.validationMessage : '');
    }
    const readiness = root.querySelector('[data-mesh-readiness]');
    const stored = snapshot.choice?.settings?.[selected];
    readiness.textContent = selected && !p?.available && !p?.needsSetup ? p?.reason ?? 'Selected plugin is missing.'
      : stored && stored.version !== p?.declaration.settingsVersion ? 'Saved settings schema changed. Review defaults with Reset to defaults.' : '';
    readiness.hidden = !readiness.textContent;
    buttons();
  }
  function acceptDelivery(data) {
    const next = data.delivery;
    if (!next) {
      if (observedRun) retiredRuns.add(observedRun);
      observedRun = null; highestGeneration = -1; delivery = null; deliveryFailure = null; return;
    }
    if (typeof next.runId !== 'string' || !next.runId || !Number.isSafeInteger(next.requestedGeneration) || next.requestedGeneration < 0) { delivery = null; return; }
    if (retiredRuns.has(next.runId)) return;
    if (next.runId !== observedRun) {
      if (observedRun) retiredRuns.add(observedRun);
      observedRun = next.runId; highestGeneration = -1;
    }
    if (!Number.isSafeInteger(next.requestedGeneration) || next.requestedGeneration < highestGeneration) return;
    if (next.requestedGeneration > highestGeneration || next.phase !== 'Failed') deliveryFailure = null;
    highestGeneration = next.requestedGeneration; delivery = next;
  }
  function renderRuntime() {
    const status = root.querySelector('[data-mesh-runtime]'), d = delivery;
    let text = '', state = 'saved';
    const pending = [...edits.values()].some(edit => edit.committed);
    const chosen = snapshot?.choice?.selected;
    const matches = d && d.runId === observedRun && d.savedRevision === snapshot?.revision
      && d.owner === (chosen?.owner ?? null) && d.id === (chosen?.id ?? null);
    const legacy = !!selected && (plugin()?.declaration.version !== 2 || !plugin()?.declaration.capabilities?.includes('live-configure-v1'));
    if (snapshot?.problem) { state = 'unknown'; }
    else if (busy || pending) { text = busy ? 'Saving…' : 'Not yet saved.'; state = 'saving'; }
    else if (retrying) { text = 'Applying…'; state = 'applying'; }
    else if (deliveryFailure) { text = deliveryFailure; state = 'failed'; }
    else if (d?.phase === 'Failed') { text = `Failed: ${d.reason || 'Post-processing could not be applied.'}`; state = 'failed'; }
    else if (d && (legacy || /rebuild|relaunch|unsupported/i.test(d.reason ?? ''))) { text = d.reason || 'Saved; rebuild/relaunch for live configuration.'; state = 'unsupported'; }
    else if (d?.phase === 'Preparing') {
      text = 'Preparing'; state = 'preparing';
      if (Number.isFinite(d.progress) && d.progress >= 0 && d.progress <= 1) text += ` · ${Math.round(d.progress * 100)}%`;
    } else if (matches && d.phase === 'Ready' && Number.isSafeInteger(d.appliedGeneration) && d.requestedGeneration > 0 && d.appliedGeneration === d.requestedGeneration) {
      text = 'Applied'; state = 'applied';
    } else if ((d && d.phase !== 'Stopped') || snapshot?.running) { text = 'Saved; application not confirmed.'; state = 'applying'; }
    // While the layer only waits for Install, the header says so; no extra status line.
    if (plugin()?.needsSetup && state !== 'saving') text = '';
    // The layer badge carries the live state; the line below only explains a failure or an unsupported change.
    const p = plugin(), badge = root.querySelector('[data-mesh-ready]');
    const percent = /(\d+)%/.exec(text)?.[1];
    // Shown from the first render, also while a layer choice saves, so Install never appears before its badge.
    const prerequisite = !!(p?.setup && (p.needsSetup || p.setupNeeded));
    // While the switch waits, the badge already names the requested state.
    const requested = layerSwitch.pending, on = requested ?? snapshot?.choice?.enabled !== false;
    const [label, tone] = prerequisite ? ['Prerequisite', 'busy'] : !p?.available ? ['', ''] : !on ? ['Off', 'neutral'] : requested === true ? ['Starting', 'busy'] : state === 'preparing' ? [percent ? `Preparing ${percent}%` : 'Preparing', 'busy']
      : state === 'applying' ? ['Starting', 'busy'] : state === 'applied' ? ['Running', 'ok'] : state === 'failed' ? ['Failed', 'err']
      : state === 'saving' ? ['Saving', 'neutral'] : ['Ready', 'ok'];
    badge.textContent = label; badge.className = `state ${tone}`; badge.hidden = !label || root.querySelector('[data-mesh-layer]').hidden;
    // Details go to the Log tab under the plugin's name; the card only shows the badge.
    const logged = state === 'preparing' ? 'Preparing' : state === 'applied' ? 'Running' : state === 'applying' ? 'Starting' : ['failed', 'unsupported'].includes(state) ? text : '';
    if (p && logged && !root.querySelector('[data-mesh-layer]').hidden) handsLog(logged, { source: p.label.split(/\s+/)[0], level: state === 'failed' ? 'err' : state === 'unsupported' ? 'warn' : '' });
    status.textContent = text; status.hidden = true; root.dataset.meshState = state;
    deliveryRetry.hidden = !d || state !== 'failed' || prerequisite; // Install, not Retry, while a runtime is missing
    deliveryRetry.disabled = busy || retrying || pending || !!snapshot?.problem;
  }
  function incorporate(data) {
    // Public refresh and request epochs both fence a retired owner; generations are ordered only within a run.
    if (data.delivery && retiredRuns.has(data.delivery.runId)) return;
    snapshot = structuredClone(data);
    if (!edits.has('$selection')) selected = key(snapshot.choice?.selected);
    acceptDelivery(snapshot); render();
  }
  function refresh(data, { discard: discardEdits = false } = {}) {
    if (disposed || busy) return;
    epoch++;
    if (discardEdits) { edits.clear(); failure = conflict = null; }
    incorporate(data);
  }
  async function read(discardEdits = false) {
    if (disposed || busy || reading || retrying || layerSwitch.pending !== null) return;
    reading = true; const token = ++epoch;
    try {
      const data = await load();
      if (!disposed && token === epoch && !busy) {
        if (discardEdits) { edits.clear(); failure = conflict = null; }
        incorporate(data);
      }
    } catch (error) {
      // A restarting panel is not a failure: the page reloads when it returns.
      if (isPanelUnavailable(error)) return;
      if (!disposed && token === epoch) { failure = error.message; delivery = null; if (!snapshot) root.hidden = false; buttons(); }
    }
    finally { reading = false; }
  }
  function editField(field, committed = false) {
    if (!snapshot || snapshot.problem || !(plugin()?.available || plugin()?.needsSetup)) return;
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
    // A settings PUT also selects its plugin. Drain completed settings before the final queued selection,
    // keeping that selection intention separate so None/another plugin cannot strand an earlier commit.
    const target = [...edits.values()].find(edit => edit.committed && edit.id)?.id ?? selected;
    const selectionReady = target === selected && ![...edits.values()].some(edit => edit.committed && edit.id && edit.id !== target);
    const sent = new Map([...edits].filter(([name, edit]) => edit.committed && (name === '$selection' ? selectionReady : edit.id === target)));
    if (!sent.size) return;
    busy = true; epoch++; deliveryFailure = null; buttons(); let success = false;
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
        if (target && !p?.available && !p?.needsSetup) throw makeConflict(current, sent, [...sent.keys()], p?.reason ?? 'Selected plugin is unavailable.');
        const stored = current.choice?.settings?.[target];
        const needsReview = p && stored && (stored.version !== p.declaration.settingsVersion || Object.keys(stored.values).some(name => !p.declaration.settings.some(f => f.key === name)));
        if (needsReview && ![...sent.values()].every(edit => edit.reviewed)) throw makeConflict(current, sent, [...sent.keys()], 'Saved settings schema changed.');
        const values = Object.fromEntries((p?.declaration.settings ?? []).map(f => [f.key, valueAt(current, target, f.key)]));
        for (const [name, edit] of sent) if (name !== '$selection') values[edit.name] = edit.value;
        // Equivalent Enter/change or a value changed back while queued needs no duplicate PUT.
        const same = savedSelection === target && (!target || stored?.version === p.declaration.settingsVersion
          && Object.keys(stored.values).length === Object.keys(values).length && Object.entries(values).every(([name, value]) => equal(stored.values[name], value)))
          && [...sent].every(([name, edit]) => name === '$selection' || equal(valueAt(current, target, edit.name), edit.value));
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
        // Intermediate writes are our own selection transitions, not foreign selection conflicts.
        for (const [name, edit] of edits) {
          if (sent.has(name)) continue;
          if (name === '$selection' && edit.base === savedSelection) edit.base = target;
          else if (name !== '$selection' && edit.selectionBase === savedSelection) edit.selectionBase = target;
        }
        failure = conflict = null; incorporate(result); success = true; break;
      }
    } catch (error) {
      if (disposed || isPanelUnavailable(error)) return;
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
        edit.reviewed = true;
        if (name === '$selection') edit.base = key(conflict.current.choice?.selected);
        else {
          if (!plugin(conflict.current, edit.id)?.declaration.settings.some(f => f.key === edit.name)) { failure = 'Setting is no longer declared. Use saved to review.'; buttons(); return; }
          edit.base = valueAt(conflict.current, edit.id, edit.name); edit.schema = schema(conflict.current, edit.id); edit.selectionBase = key(conflict.current.choice?.selected);
        }
      }
      snapshot = conflict.current; conflict = null;
    }
    failure = null; buttons();
    if (snapshot && [...edits.values()].some(edit => edit.committed)) void flush(); else void read();
  }
  async function retryDelivery() {
    if (busy || retrying || disposed || !snapshot || !delivery || deliveryRetry.disabled) return;
    const expected = { runId: delivery.runId, revision: snapshot.revision, generation: delivery.requestedGeneration };
    const token = ++epoch; retrying = true; deliveryFailure = null; buttons();
    try {
      const current = await load();
      if (disposed || token !== epoch) return;
      if (current.revision !== expected.revision || current.delivery?.runId !== expected.runId || current.delivery?.requestedGeneration !== expected.generation) {
        incorporate(current); deliveryFailure = 'Run or saved configuration changed. Review current status before Retry.'; return;
      }
      incorporate(current);
      if (current.delivery.phase !== 'Failed') return;
      const result = await retry({ runId: expected.runId, revision: expected.revision });
      if (disposed || token !== epoch) return;
      if (result.delivery?.runId !== expected.runId || result.delivery?.savedRevision !== expected.revision) {
        deliveryFailure = 'Run or saved configuration changed. Review current status before Retry.'; return;
      }
      acceptDelivery(result);
    } catch (error) { if (!disposed && token === epoch && !isPanelUnavailable(error)) deliveryFailure = `Couldn't apply post-processing. ${error.message}`; }
    finally { retrying = false; if (!disposed) buttons(); }
  }
  const on = (element, name, listener, options = {}) => element.addEventListener(name, listener, { ...options, signal: events.signal });
  on(form, 'keydown', event => {
    if (event.key === 'Enter' && event.target.matches('[data-mesh-field]')) { event.preventDefault(); editField(event.target, true); }
  });
  on(form, 'submit', event => event.preventDefault());
  on(select, 'change', choose);
  on(layerValue, 'change', () => {
    // A single choice: the picked layer replaces the running one (only one hand-mesh layer can run).
    select.value = layerValue.value || ''; choose();
  });
  on(root.querySelector('[data-mesh-layer-remove]'), 'click', () => { select.value = ''; choose(); });
  on(install, 'click', async () => {
    const p = plugin(); if (!p || installing) return;
    installing = true; buttons(); render();
    try { if (await openMeshSetup({ owner: p.owner, label: p.label })) await read(); }
    finally { installing = false; render(); }
  });
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
  on(retryButton, 'click', retrySave);
  on(deliveryRetry, 'click', () => { void retryDelivery(); });
  on(discard, 'click', () => {
    if (!conflict || busy) return;
    const current = conflict.current;
    for (const name of conflict.keys) edits.delete(name);
    failure = conflict = null; incorporate(current); void flush();
  });
  on(document.defaultView, 'beforeunload', event => { if (edits.size || busy) { event.preventDefault(); event.returnValue = ''; } });
  const timer = pollMs ? setInterval(() => { void read(); }, pollMs) : null;
  void read();
  // Shared presets: the chosen layer and its settings. Defaults keep the layer and restore its declared values.
  // Applying values is an explicit replacement of the local draft, unlike a passive poll or save completion.
  const meshSettings = (id = selected) => plugin(snapshot, id)?.declaration.settings ?? [];
  const meshValue = (id, name) => edits.get(editKey(id, name))?.value ?? valueAt(snapshot, id, name);
  function applyMeshSettings(values) {
    for (const f of meshSettings()) {
      if (!Object.hasOwn(values, f.key)) continue;
      const idKey = editKey(selected, f.key), previous = edits.get(idKey);
      edits.set(idKey, { id: selected, name: f.key, base: previous?.base ?? valueAt(snapshot, selected, f.key), value: structuredClone(values[f.key]),
        schema: previous?.schema ?? schema(snapshot, selected), selectionBase: previous?.selectionBase ?? key(snapshot.choice?.selected), committed: true, reviewed: true, version: ++version });
      const field = fields.querySelector(`[data-mesh-field="${f.key}"]`);
      if (field) { if (field.type === 'checkbox') field.checked = values[f.key]; else field.value = values[f.key]; }
    }
  }
  const presetApi = {
    presetValues: () => ({ layer: selected, settings: Object.fromEntries(meshSettings().map(f => [f.key, structuredClone(meshValue(selected, f.key))])) }),
    presetDefaults: () => ({ settings: Object.fromEntries(meshSettings().map(f => [f.key, f.default])) }),
    matchesPreset: values => (!Object.hasOwn(values, 'layer') || values.layer === selected)
      && Object.entries(values.settings ?? {}).every(([name, value]) => !meshSettings().some(f => f.key === name) || equal(value, meshValue(selected, name))),
    applyPreset(values) {
      if (!snapshot || snapshot.problem || disposed) return;
      if (Object.hasOwn(values, 'layer') && values.layer !== selected && !select.disabled) { select.value = values.layer ?? ''; choose(); }
      if (values.settings && selected && (plugin()?.available || plugin()?.needsSetup)) applyMeshSettings(values.settings);
      render(); if (!conflict) { failure = null; void flush(); }
    },
  };
  return { ...presetApi, get presetReady() { return !!snapshot && !snapshot.problem; }, refresh, reload: () => { void read(true); }, dispose() {
    if (disposed) return;
    disposed = true; epoch++; if (timer) clearInterval(timer); events.abort(); stepperDispose(); root.replaceChildren();
  } };
}
