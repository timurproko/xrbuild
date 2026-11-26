import { handsEditorRevisions } from './hands-editor-revisions.js';
import { renderField, setFieldError, installNumberSteppers, enhanceHelpText } from './design-system.js';

export const linearToHex = rgb => '#' + rgb.map(v => Math.round(255 * (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055)).toString(16).padStart(2, '0')).join('');
export const hexToLinear = hex => [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
let mounts = 0;
/** All state/listeners/queries belong to root. Move root into a future side-panel slot unchanged. */
export function mountHandAdjustments(root, { load, apply }) {
  const prefix = `hands-adjustments-${++mounts}`;
  const number = (key, label, min, max, step, hint = '', range = false) => renderField(label,
    `<input type="number" data-field="${key}" aria-label="${label}" min="${min}" max="${max}" step="${step}" required>${range ? `<input class="xrb-range" type="range" data-range="${key}" aria-label="${label} slider" min="${min}" max="${max}" step="${step}">` : ''}`, { hint });
  const toggle = (key, label) => `<label class="xrb-switch"><input type="checkbox" data-field="appearance.${key}"><span>${label}</span></label>`;
  const colour = (key, label) => renderField(label, `<span class="xrb-inline-icons"><input type="color" data-field="appearance.${key}" aria-label="${label}" hidden><button type="button" class="xrb-swatch" data-colour="appearance.${key}" aria-label="Choose ${label.toLowerCase()}" aria-haspopup="dialog" aria-pressed="true"></button></span>`);
  root.innerHTML = `<form class="xrb-stack hands-adjustment-sections" aria-label="Hand adjustments">
    <section class="xrb-sidebar-section" aria-labelledby="${prefix}-position">
      <div class="row"><h2 id="${prefix}-position">Position and size</h2><span class="spacer"></span><button type="button" class="small" data-reset="geometry">Reset to defaults</button></div>
      <div class="xrb-field-grid">${number('offsetMm.x', 'X (mm)', -150, 150, 1)}${number('offsetMm.y', 'Y (mm)', -150, 150, 1)}${number('offsetMm.z', 'Z (mm)', -150, 150, 1)}</div>
      ${number('sizeFactor', 'Size', .5, 1.5, .01, 'Changes where the hand touches.', true)}
    </section>
    <section class="xrb-sidebar-section" aria-labelledby="${prefix}-appearance">
      <div class="row"><h2 id="${prefix}-appearance">Appearance</h2><span class="spacer"></span><button type="button" class="small" data-reset="appearance">Reset to defaults</button></div>
      <div class="xrb-toggle-grid">${toggle('showJoints', 'Joints')}${toggle('showBones', 'Bones')}</div>
      <div class="xrb-field-grid">${number('appearance.jointDiameterMm', 'Joint diameter (mm)', 1, 40, 1)}${colour('jointColorLinear', 'Joint colour')}${number('appearance.boneDiameterMm', 'Bone diameter (mm)', 1, 30, 1)}${colour('boneColorLinear', 'Bone colour')}</div>
      ${number('appearance.opacity', 'Skeleton opacity', 0, 1, .001)}
      ${toggle('showPinchGrabIndicator', 'Pinch / grab indicator')}
      <div class="xrb-field-grid">${number('appearance.indicatorDiameterMm', 'Indicator diameter (mm)', 1, 60, 1)}${colour('indicatorColorLinear', 'Indicator colour')}${number('appearance.indicatorOpacity', 'Indicator opacity', 0, 1, .01)}</div>
    </section>
    <div class="xrb-button-row"><button type="submit" data-action="apply" disabled>Apply</button><button type="button" data-action="reload" hidden>Reload</button></div>
    <p data-status role="status" aria-live="polite"></p>
  </form>`;
  const form = root.querySelector('form'), status = root.querySelector('[data-status]'), applyButton = root.querySelector('[data-action="apply"]'), reload = root.querySelector('[data-action="reload"]');
  const fields = [...root.querySelectorAll('[data-field]')];
  let state = null, draft = null, dirty = false, stale = false, busy = false, disposed = false, retryDelivery = false;
  const revisions = handsEditorRevisions();
  let deliveryEpoch = 0;
  const disposers = [installNumberSteppers(root), enhanceHelpText(root)];
  const read = key => key.startsWith('appearance.') ? draft.appearance[key.slice(11)] ?? state.appearanceDefaults[key.slice(11)] : key.startsWith('offsetMm.') ? draft.offsetMm[key.slice(9)] : draft[key];
  function buttons() {
    applyButton.disabled = !state || (!dirty && !retryDelivery) || stale || busy;
    applyButton.textContent = retryDelivery && !dirty ? 'Retry Apply' : 'Apply';
    reload.hidden = !stale; reload.disabled = busy; root.dataset.dirty = String(dirty);
  }
  function render() {
    for (const field of fields) {
      field.disabled = !state || busy;
      if (!draft) continue;
      const value = read(field.dataset.field);
      if (field.type === 'checkbox') field.checked = value;
      else field.value = field.type === 'color' ? linearToHex(value) : String(value);
      setFieldError(field);
    }
    for (const swatch of root.querySelectorAll('[data-colour]')) { swatch.disabled = !state || busy; if (draft) swatch.style.backgroundColor = linearToHex(read(swatch.dataset.colour)); }
    for (const range of root.querySelectorAll('[data-range]')) { range.value = draft?.[range.dataset.range] ?? 1; range.disabled = !state || busy; }
    for (const reset of root.querySelectorAll('[data-reset]')) reset.disabled = !state || busy;
    buttons();
  }
  function refresh(next, { discard = false, review = revisions.reviewToken() } = {}) {
    if (disposed) return;
    if (busy || dirty && !discard) { markStale(undefined, next.revision); return; }
    revisions.incorporate(next.revision, review); deliveryEpoch++;
    state = next; draft = structuredClone(next.profile); dirty = false; stale = revisions.stale;
    retryDelivery = next.deliveryState === 'failed';
    status.textContent = stale ? 'Hands settings changed. Reload to review them.' : next.delivery ?? ''; render();
  }
  function markStale(message = 'Hands settings changed. Reload to review them.', revision) {
    if (!revisions.changed(revision)) return;
    deliveryEpoch++; stale = true; status.textContent = message; buttons();
  }
  const change = event => {
    if (!draft || busy) return;
    const field = event.target.closest('[data-field],[data-range]'); if (!field || !root.contains(field)) return;
    const key = field.dataset.field ?? field.dataset.range;
    let value = field.type === 'checkbox' ? field.checked : field.type === 'color' ? hexToLinear(field.value) : field.valueAsNumber;
    // Never quantize an untouched linear colour through its 8-bit picker display.
    if (field.type === 'color' && field.value.toLowerCase() === linearToHex(read(key)).toLowerCase()) return;
    if (key.startsWith('appearance.')) draft.appearance[key.slice(11)] = value;
    else if (key.startsWith('offsetMm.')) draft.offsetMm[key.slice(9)] = value;
    else draft[key] = value;
    dirty = true;
    if (field.type === 'color') root.querySelector(`[data-colour="${key}"]`).style.backgroundColor = field.value;
    if (key === 'sizeFactor') {
      root.querySelector('[data-range="sizeFactor"]').value = value;
      root.querySelector('[data-field="sizeFactor"]').value = value;
    }
    status.textContent = 'Not applied'; setFieldError(field); buttons();
  };
  const click = async event => {
    const swatch = event.target.closest('[data-colour]');
    if (swatch && state && !busy) { event.preventDefault(); root.querySelector(`[data-field="${swatch.dataset.colour}"]`).click(); }
    const reset = event.target.closest('[data-reset]');
    if (reset && draft && !busy) {
      if (reset.dataset.reset === 'geometry') { draft.offsetMm = { x: 0, y: 0, z: 0 }; draft.sizeFactor = 1; }
      else draft.appearance = {};
      dirty = true; status.textContent = 'Not applied'; render();
    }
    if (event.target === reload) {
      const review = revisions.reviewToken();
      try { refresh(await load(), { discard: true, review }); } catch (error) { status.textContent = error.message; }
    }
  };
  const submit = async event => {
    event.preventDefault(); if (!state || (!dirty && !retryDelivery) || stale || busy || !form.reportValidity()) return;
    busy = true; deliveryEpoch++; status.textContent = 'Saving…'; render();
    try {
      const result = await apply({ profile: draft, revision: state.revision, registryRevision: state.registryRevision });
      if (disposed) return;
      revisions.incorporate(result.revision); deliveryEpoch++;
      state = { ...state, ...result }; draft = structuredClone(result.profile); dirty = false; stale = revisions.stale;
      retryDelivery = result.deliveryState === 'failed';
      status.textContent = stale ? 'Hands settings changed. Reload to review them.' : result.delivery;
    } catch (error) {
      if (disposed) return;
      status.textContent = error.message;
      const field = fields.find(f => error.message.includes(f.dataset.field)); if (field) setFieldError(field, error.message);
      if (/changed|reload|conflict/i.test(error.message)) stale = true;
    } finally { busy = false; if (!disposed) { // Keep server field errors until the next edit.
      for (const field of fields) field.disabled = !state;
      for (const range of root.querySelectorAll('[data-range]')) range.disabled = !state;
      for (const swatch of root.querySelectorAll('[data-colour]')) swatch.disabled = !state;
      for (const reset of root.querySelectorAll('[data-reset]')) reset.disabled = !state;
      buttons();
    } }
  };
  form.addEventListener('input', change); form.addEventListener('change', change); form.addEventListener('submit', submit); root.addEventListener('click', click);
  render();
  return { refresh, markStale, reviewToken: () => revisions.reviewToken(), get dirty() { return dirty; }, get revision() { return state?.revision; }, get deliveryEpoch() { return deliveryEpoch; }, updateDelivery(text, deliveryState, revision, epoch) { if (epoch === deliveryEpoch && revision === state?.revision && !dirty && !stale && !busy) { status.textContent = text; retryDelivery = deliveryState === 'failed'; buttons(); } },
    dispose() { disposed = true; form.removeEventListener('input', change); form.removeEventListener('change', change); form.removeEventListener('submit', submit); root.removeEventListener('click', click); disposers.reverse().forEach(fn => fn()); root.replaceChildren(); } };
}
