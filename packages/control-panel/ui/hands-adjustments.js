import { commitHandsFields } from './hands-commits.js';
import { renderField, setFieldError, installNumberSteppers, enhanceHelpText, iconSvg, openFloating, positionFloating } from './design-system.js';
import { menuKeyboard } from './navigation.js';

export const linearToHex = rgb => '#' + rgb.map(v => Math.round(255 * (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055)).toString(16).padStart(2, '0')).join('');
export const hexToLinear = hex => [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const set = (profile, key, value) => { const parts = key.split('.'); if (parts.length === 2) profile[parts[0]][parts[1]] = structuredClone(value); else profile[key] = structuredClone(value); };
let mounts = 0;
/** Root-scoped editor. Only finished values enter the serialized revision-safe save path. */
export function mountHandAdjustments(root, { load, apply, serialize = operation => operation() }) {
  const prefix = `hands-adjustments-${++mounts}`;
  const number = (key, label, min, max, step, hint = '', swatch = '') => renderField(label,
    `<span class="hands-number-row${swatch ? ' hands-number-row--colour' : ''}"><input type="number" data-field="${key}" aria-label="${label}" min="${min}" max="${max}" step="${step}" required><input class="xrb-range" type="range" data-range="${key}" aria-label="${label} slider" min="${min}" max="${max}" step="${step}">${swatch}</span>`, { hint });
  const toggle = (key, label) => `<label class="xrb-switch"><input type="checkbox" data-field="appearance.${key}"><span>${label}</span></label>`;
  const colour = (key, label) => `<span class="xrb-inline-icons"><input type="color" data-field="appearance.${key}" aria-label="${label}" hidden><button type="button" class="xrb-swatch" data-colour="appearance.${key}" aria-label="Choose ${label.toLowerCase()}" aria-haspopup="dialog" aria-pressed="true"></button></span>`;
  const resetMenu = (section, label) => `<button type="button" class="xrb-icon-button" id="${prefix}-${section}-settings" data-reset-menu="${section}" aria-label="${label} settings" aria-haspopup="menu" aria-controls="${prefix}-${section}-menu" aria-expanded="false">${iconSvg('settings')}</button><div class="menu" id="${prefix}-${section}-menu" role="menu" aria-labelledby="${prefix}-${section}-settings" hidden><button type="button" role="menuitem" data-reset="${section}">Reset to defaults</button></div>`;
  root.innerHTML = `<form class="xrb-stack hands-adjustment-sections" aria-label="Hand adjustments">
    <section class="xrb-sidebar-section" aria-labelledby="${prefix}-position">
      <div class="row"><h2 id="${prefix}-position">Position and size</h2><span class="spacer"></span>${resetMenu('geometry', 'Position and size')}</div>
      ${number('offsetMm.x', 'X (mm)', -150, 150, 1)}${number('offsetMm.y', 'Y (mm)', -150, 150, 1)}${number('offsetMm.z', 'Z (mm)', -150, 150, 1)}
      ${number('sizeFactor', 'Size', .5, 1.5, .01, 'Changes where the hand touches.')}
    </section>
    <section class="xrb-sidebar-section" aria-labelledby="${prefix}-appearance">
      <div class="row"><h2 id="${prefix}-appearance">Appearance</h2><span class="spacer"></span>${resetMenu('appearance', 'Appearance')}</div>
      <div class="xrb-toggle-grid">${toggle('showJoints', 'Joints')}${toggle('showBones', 'Bones')}</div>
      ${number('appearance.jointDiameterMm', 'Joint diameter (mm)', 1, 40, 1, '', colour('jointColorLinear', 'Joint colour'))}
      ${number('appearance.boneDiameterMm', 'Bone diameter (mm)', 1, 30, 1, '', colour('boneColorLinear', 'Bone colour'))}
      ${number('appearance.opacity', 'Skeleton opacity', 0, 1, .001)}
      ${toggle('showPinchGrabIndicator', 'Pinch / grab indicator')}
      ${number('appearance.indicatorDiameterMm', 'Indicator diameter (mm)', 1, 60, 1, '', colour('indicatorColorLinear', 'Indicator colour'))}
      ${number('appearance.indicatorOpacity', 'Indicator opacity', 0, 1, .01)}
    </section>
    <div class="xrb-stack" data-recovery hidden><p class="field-error" data-status role="alert"></p><div class="xrb-button-row"><button type="button" class="small" data-action="retry">Retry</button><button type="button" class="small" data-action="discard" hidden>Use saved</button></div></div>
  </form>`;
  const form = root.querySelector('form'), status = root.querySelector('[data-status]'), recovery = root.querySelector('[data-recovery]');
  const retry = root.querySelector('[data-action="retry"]'), discard = root.querySelector('[data-action="discard"]');
  const fields = [...root.querySelectorAll('[data-field]')], edits = new Map();
  let state = null, busy = false, disposed = false, failure = null, conflict = null, retryDelivery = false, version = 0, deliveryEpoch = 0, inFlight = null;
  const disposers = [installNumberSteppers(root), enhanceHelpText(root)];
  const menuEvents = new AbortController(), document = root.ownerDocument;
  let activeMenu = null;
  function closeMenu(restoreFocus = false) {
    if (!activeMenu) return;
    const { button, menu } = activeMenu;
    activeMenu = null; menu.hidden = true; button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  }
  function showMenu(button) {
    if (!state) return;
    closeMenu();
    const menu = root.querySelector(`#${button.getAttribute('aria-controls')}`);
    activeMenu = { button, menu }; button.setAttribute('aria-expanded', 'true');
    openFloating(menu, { anchor: button });
  }
  const outside = event => { if (activeMenu && !activeMenu.button.contains(event.target) && !activeMenu.menu.contains(event.target)) closeMenu(); };
  document.addEventListener('click', outside, { signal: menuEvents.signal });
  document.addEventListener('focusin', outside, { signal: menuEvents.signal });
  document.addEventListener('scroll', () => { if (activeMenu) positionFloating(activeMenu.menu, { anchor: activeMenu.button }); }, { capture: true, signal: menuEvents.signal });
  document.defaultView.addEventListener('resize', () => closeMenu(), { signal: menuEvents.signal });
  disposers.push(() => { closeMenu(); menuEvents.abort(); });
  const read = (data, key) => key.startsWith('appearance.') ? data.profile.appearance[key.slice(11)] ?? data.appearanceDefaults[key.slice(11)] : key.startsWith('offsetMm.') ? data.profile.offsetMm[key.slice(9)] : data.profile[key];
  function buttons() {
    root.dataset.dirty = String(edits.size > 0);
    root.dataset.saving = String(busy);
    const text = failure ?? (retryDelivery ? "Couldn't apply to the running app. Retry or rebuild/relaunch." : '');
    status.textContent = text; recovery.hidden = !text;
    retry.disabled = busy; discard.disabled = busy; discard.hidden = !conflict;
  }
  function render() {
    for (const field of fields) {
      field.disabled = !state;
      if (!state || edits.has(field.dataset.field)) continue;
      const value = read(state, field.dataset.field);
      if (field.type === 'checkbox') field.checked = value;
      else field.value = field.type === 'color' ? linearToHex(value) : String(value);
      setFieldError(field);
    }
    for (const swatch of root.querySelectorAll('[data-colour]')) {
      swatch.disabled = !state;
      if (state) swatch.style.backgroundColor = linearToHex(edits.get(swatch.dataset.colour)?.value ?? read(state, swatch.dataset.colour));
    }
    for (const range of root.querySelectorAll('[data-range]')) {
      range.disabled = !state;
      if (state) range.value = edits.get(range.dataset.range)?.value ?? read(state, range.dataset.range);
    }
    for (const reset of root.querySelectorAll('[data-reset],[data-reset-menu]')) reset.disabled = !state;
    buttons();
  }
  function refresh(next, { discard: discardEdits = false } = {}) {
    if (disposed || busy) return;
    deliveryEpoch++;
    if (discardEdits) { edits.clear(); failure = conflict = null; }
    const changed = next.revision !== state?.revision;
    state = next; retryDelivery = next.deliveryState === 'failed';
    if (changed || discardEdits) render(); else buttons();
  }
  function edit(field) {
    if (!state) return;
    const key = field.dataset.field ?? field.dataset.range;
    let value = field.type === 'checkbox' ? field.checked : field.type === 'color' ? hexToLinear(field.value) : field.valueAsNumber;
    const previous = edits.get(key), sent = inFlight?.get(key);
    const base = sent && sent.version === previous?.version ? sent.value : previous?.base ?? sent?.value ?? read(state, key);
    // Opening, cancelling or returning a colour preview to its initial swatch preserves exact linear values.
    if (field.type === 'color' && field.value.toLowerCase() === linearToHex(base).toLowerCase()) value = structuredClone(base);
    if (field.type === 'range') root.querySelector(`[data-field="${key}"]`).value = field.value;
    else if (field.type === 'number' && field.validity.valid) root.querySelector(`[data-range="${key}"]`).value = value;
    if (previous && equal(value, previous.value)) return key;
    if (!sent && equal(value, base) && equal(read(state, key), base)) {
      edits.delete(key); setFieldError(field);
      if (field.type === 'color') root.querySelector(`[data-colour="${key}"]`).style.backgroundColor = field.value;
      buttons(); return key;
    }
    edits.set(key, { value, base, committed: false, version: ++version });
    if (field.type === 'color') root.querySelector(`[data-colour="${key}"]`).style.backgroundColor = field.value;
    setFieldError(field); buttons(); return key;
  }
  function commit(field) {
    const key = edit(field), change = edits.get(key);
    if (!change) return;
    const canonical = fields.find(f => f.dataset.field === key);
    if (!canonical.checkValidity()) { setFieldError(canonical, canonical.validationMessage); return; }
    change.committed = true;
    if (!conflict) { failure = null; void flush(); }
  }
  async function flush(deliveryOnly = false) {
    if (!state || busy || disposed || conflict) return;
    const sent = new Map([...edits].filter(([, edit]) => edit.committed));
    if (!sent.size && !deliveryOnly) return;
    const base = structuredClone(state), changes = {};
    for (const [key, edit] of sent) { set(base.profile, key, edit.base); changes[key] = edit.value; }
    busy = true; inFlight = sent; deliveryEpoch++; buttons();
    let success = false;
    try {
      const result = await serialize(() => commitHandsFields({ base, changes, load, read,
        save: (current, patch) => {
          if (disposed) throw new Error('Page closed.');
          const profile = structuredClone(current.profile);
          for (const [key, value] of Object.entries(patch)) set(profile, key, value);
          return apply({ profile, revision: current.revision, registryRevision: current.registryRevision });
        } }));
      if (disposed) return;
      state = result; failure = conflict = null; retryDelivery = result.deliveryState === 'failed';
      for (const [key, edit] of sent) if (edits.get(key)?.version === edit.version) edits.delete(key);
      success = true;
    } catch (error) {
      if (disposed) return;
      conflict = error.current ? error : null;
      if (conflict) {
        const values = error.fields.map(key => `${fields.find(f => f.dataset.field === key)?.getAttribute('aria-label') ?? key}: ${JSON.stringify(read(error.current, key))}`).join(', ');
        failure = `Changed elsewhere. Saved ${values}. Retry your value or use saved.`;
      } else failure = `Couldn't save adjustments. ${error.message.replace(/;?\s*reload before (saving|applying)/ig, '')}`;
      const field = fields.find(f => error.message.includes(f.dataset.field)); if (field) setFieldError(field, error.message);
    } finally {
      busy = false; inFlight = null; deliveryEpoch++;
      if (!disposed) { render(); if (success && [...edits.values()].some(edit => edit.committed)) void flush(); }
    }
  }
  const input = event => { const field = event.target.closest('[data-field],[data-range]'); if (field && root.contains(field)) edit(field); };
  const change = event => { const field = event.target.closest('[data-field],[data-range]'); if (field && root.contains(field)) commit(field); };
  const keydown = event => {
    const button = event.target.closest('[data-reset-menu]');
    if (button && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); showMenu(button); return; }
    if (activeMenu && (activeMenu.menu.contains(event.target) || event.key === 'Escape')) {
      menuKeyboard(event, activeMenu.menu, () => closeMenu(true));
      return;
    }
    if (event.key === 'Enter' && event.target.matches('[data-field]')) { event.preventDefault(); commit(event.target); }
  };
  const submit = event => event.preventDefault();
  const click = event => {
    const menuButton = event.target.closest('[data-reset-menu]');
    if (menuButton) {
      if (activeMenu?.button === menuButton) closeMenu(); else showMenu(menuButton);
      return;
    }
    const swatch = event.target.closest('[data-colour]');
    if (swatch && state) { event.preventDefault(); root.querySelector(`[data-field="${swatch.dataset.colour}"]`).click(); }
    const reset = event.target.closest('[data-reset]');
    if (reset && state) {
      closeMenu(true);
      for (const field of fields) {
        const key = field.dataset.field, appearance = key.startsWith('appearance.');
        if (appearance !== (reset.dataset.reset === 'appearance')) continue;
        const value = appearance ? state.appearanceDefaults[key.slice(11)] : key === 'sizeFactor' ? 1 : 0;
        const previous = edits.get(key), sent = inFlight?.get(key);
        const base = sent && sent.version === previous?.version ? sent.value : previous?.base ?? sent?.value ?? read(state, key);
        edits.set(key, { value, base, committed: true, version: ++version });
        if (field.type === 'checkbox') field.checked = value; else field.value = field.type === 'color' ? linearToHex(value) : String(value);
        setFieldError(field);
      }
      render(); if (!conflict) { failure = null; void flush(); }
    }
    if (event.target === retry && !busy) {
      if (conflict) {
        // The displayed saved values were explicitly reviewed. A newer unseen change still conflicts.
        for (const key of conflict.fields) if (edits.has(key)) edits.get(key).base = read(conflict.current, key);
        conflict = null;
      }
      failure = null; void flush(retryDelivery);
    }
    if (event.target === discard && conflict && !busy) {
      const current = conflict.current;
      for (const key of conflict.fields) edits.delete(key);
      failure = conflict = null; refresh(current); render(); void flush();
    }
  };
  const beforeunload = event => { if (edits.size || busy) { event.preventDefault(); event.returnValue = ''; } };
  addEventListener('beforeunload', beforeunload);
  form.addEventListener('input', input); form.addEventListener('change', change); form.addEventListener('keydown', keydown); form.addEventListener('submit', submit); root.addEventListener('click', click);
  render();
  return { refresh, markStale() { void load().then(refresh).catch(error => { failure = error.message; buttons(); }); }, reviewToken: () => undefined,
    get dirty() { return edits.size > 0; }, get revision() { return state?.revision; }, get deliveryEpoch() { return deliveryEpoch; },
    updateDelivery(_text, deliveryState, revision, epoch) {
      if (epoch === deliveryEpoch && revision === state?.revision && !edits.size && !busy) { retryDelivery = deliveryState === 'failed'; buttons(); }
    },
    dispose() { disposed = true; removeEventListener('beforeunload', beforeunload); form.removeEventListener('input', input); form.removeEventListener('change', change); form.removeEventListener('keydown', keydown); form.removeEventListener('submit', submit); root.removeEventListener('click', click); disposers.reverse().forEach(fn => fn()); root.replaceChildren(); } };
}
