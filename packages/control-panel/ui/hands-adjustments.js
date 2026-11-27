import { commitHandsFields } from './hands-commits.js';
import { renderField, setFieldError, installNumberSteppers, enhanceHelpText, iconSvg, openFloating, positionFloating, refreshDropdown, openColorPopover, closeColorPopover } from './design-system.js';
import { menuKeyboard } from './navigation.js';

export const linearToHex = rgb => '#' + rgb.map(v => Math.round(255 * (v <= .0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - .055)).toString(16).padStart(2, '0')).join('');
export const hexToLinear = hex => [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const set = (profile, key, value) => { const parts = key.split('.'); if (parts.length === 2) profile[parts[0]][parts[1]] = structuredClone(value); else profile[key] = structuredClone(value); };
let mounts = 0;
/** The selected side-panel tab survives reloads and restarts in this browser only. */
export const HANDS_TAB_KEY = 'xrb.hands.tab';
const rememberedTab = () => { try { return localStorage.getItem(HANDS_TAB_KEY) ?? ''; } catch { return ''; } };
const rememberTab = section => { try { localStorage.setItem(HANDS_TAB_KEY, section); } catch { /* Storage may be blocked; the tab still works. */ } };
/** Root-scoped editor. Only finished values enter the serialized revision-safe save path. */
export function mountHandAdjustments(root, { load, apply, serialize = operation => operation(), setup = null }) {
  const prefix = `hands-adjustments-${++mounts}`;
  const number = (key, label, min, max, step, hint = '', swatch = '') => renderField(label,
    `<span class="hands-number-row${swatch ? ' hands-number-row--color' : ''}"><input type="number" data-field="${key}" aria-label="${label}" min="${min}" max="${max}" step="${step}" required><input class="xrb-range" type="range" data-range="${key}" aria-label="${label} slider" min="${min}" max="${max}" step="${step}">${swatch}</span>`, { hint, tag: 'div' });
  // What the skeleton shows is one multi-select; hidden checkboxes stay the saved fields behind it.
  const DISPLAY = { showJoints: 'Joints', showBones: 'Bones', showPinchGrabIndicator: 'Pinch/grab' };
  const displayField = () => renderField('Display', `<div class="dropdown" data-multi="true" data-display-toggles data-options="${Object.keys(DISPLAY).join('|')}" data-labels='${JSON.stringify(DISPLAY)}'><input type="hidden" data-display-value value="[]"><button type="button" class="dropdown-btn" aria-haspopup="listbox" aria-expanded="false">None</button></div>${Object.keys(DISPLAY).map(key => `<input type="checkbox" data-field="appearance.${key}" aria-label="${DISPLAY[key]}" hidden>`).join('')}`);
  const color = (key, label) => `<span class="xrb-inline-icons"><input type="color" data-field="appearance.${key}" aria-label="${label}" hidden><button type="button" class="xrb-swatch" data-color="appearance.${key}" aria-label="Choose ${label.toLowerCase()}" aria-haspopup="dialog" aria-pressed="true"></button></span>`;
  const resetMenu = (section, label) => `<button type="button" class="xrb-icon-button" id="${prefix}-${section}-settings" data-reset-menu="${section}" aria-label="${label} settings" data-no-tooltip aria-haspopup="menu" aria-controls="${prefix}-${section}-menu" aria-expanded="false">${iconSvg('settings')}</button><div class="menu" id="${prefix}-${section}-menu" role="menu" aria-labelledby="${prefix}-${section}-settings" hidden><button type="button" role="menuitem" data-reset="${section}">Reset to defaults</button></div>`;
  // Position and Visual are tabs in the card's tab bar; each tab's reset menu sits at the bar's end.
  const tab = (section, label, selected) => `<button type="button" class="xrb-tab" role="tab" id="${prefix}-tab-${section}" data-tab="${section}" aria-controls="${prefix}-panel-${section}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}">${label}</button>`;
  const tabAction = (section, label, selected) => `<span class="hands-tab-action" data-tab-action="${section}"${selected ? '' : ' hidden'}>${resetMenu(section, label)}</span>`;
  // The page may already hold the tab bar (shown before this editor loads); adopt it instead of rebuilding.
  const adopted = setup?.parentElement?.querySelector(':scope > .hands-adjustment-tabs') ?? null;
  const tabs = adopted ?? root.ownerDocument.createElement('div');
  if (!adopted) {
    tabs.className = 'xrb-tabs hands-adjustment-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Hand adjustments'); tabs.dataset.xrbTabsId = 'hands-adjustments';
    tabs.innerHTML = `${setup ? tab('setup', 'Setup', true) : ''}${tab('geometry', 'Position', !setup)}${tab('appearance', 'Visual', false)}`;
  } else for (const item of tabs.querySelectorAll('[data-tab]')) { item.id = `${prefix}-tab-${item.dataset.tab}`; item.setAttribute('aria-controls', `${prefix}-panel-${item.dataset.tab}`); }
  tabs.insertAdjacentHTML('beforeend', `${tabAction('geometry', 'Position', !setup)}${tabAction('appearance', 'Visual', false)}`);
  if (setup) { setup.id ||= `${prefix}-panel-setup`; setup.setAttribute('role', 'tabpanel'); setup.setAttribute('aria-labelledby', `${prefix}-tab-setup`); tabs.querySelector('[data-tab="setup"]').setAttribute('aria-controls', setup.id); root.hidden = true; }
  if (!adopted) (setup ?? root).before(tabs);
  // Further page panels (such as Log) live beside Setup and switch with their tab.
  const pagePanels = adopted ? [...tabs.parentElement.querySelectorAll(':scope > [data-tab-panel]')] : [];
  root.innerHTML = `<form class="xrb-stack hands-adjustment-sections" aria-label="Hand adjustments">
    <section class="xrb-sidebar-section" role="tabpanel" id="${prefix}-panel-geometry" aria-labelledby="${prefix}-tab-geometry"${setup ? ' hidden' : ''}>
      ${renderField('Show offset in view', '<span class="xrb-switch"><input type="checkbox" id="hands-offset-preview"></span>')}
      ${number('offsetMm.x', 'X (mm)', -150, 150, 1)}${number('offsetMm.y', 'Y (mm)', -150, 150, 1)}${number('offsetMm.z', 'Z (mm)', -150, 150, 1)}
      ${number('sizeFactor', 'Size', .5, 1.5, .01)}
    </section>
    <section class="xrb-sidebar-section" role="tabpanel" id="${prefix}-panel-appearance" aria-labelledby="${prefix}-tab-appearance" hidden>
      ${displayField()}
      ${number('appearance.jointDiameterMm', 'Joint diameter (mm)', 1, 40, 1, '', color('jointColorLinear', 'Joint color'))}
      ${number('appearance.boneDiameterMm', 'Bone diameter (mm)', 1, 30, 1, '', color('boneColorLinear', 'Bone color'))}
      ${number('appearance.opacity', 'Skeleton opacity', 0, 1, .001)}
      ${number('appearance.indicatorDiameterMm', 'Indicator diameter (mm)', 1, 60, 1, '', color('indicatorColorLinear', 'Indicator color'))}
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
  // Reset menus open just below their gear, right-aligned with it, so they stay inside the card.
  const menuPlacement = button => ({ anchor: button, align: 'end' });
  function showMenu(button) {
    if (!state) return;
    closeMenu();
    const menu = tabs.querySelector(`#${button.getAttribute('aria-controls')}`);
    activeMenu = { button, menu }; button.setAttribute('aria-expanded', 'true');
    openFloating(menu, menuPlacement(button));
  }
  const outside = event => { if (activeMenu && !activeMenu.button.contains(event.target) && !activeMenu.menu.contains(event.target)) closeMenu(); };
  document.addEventListener('click', outside, { signal: menuEvents.signal });
  document.addEventListener('focusin', outside, { signal: menuEvents.signal });
  document.addEventListener('scroll', () => { if (activeMenu) positionFloating(activeMenu.menu, menuPlacement(activeMenu.button)); }, { capture: true, signal: menuEvents.signal });
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
    for (const swatch of root.querySelectorAll('[data-color]')) {
      swatch.disabled = !state;
      if (state) swatch.style.backgroundColor = linearToHex(edits.get(swatch.dataset.color)?.value ?? read(state, swatch.dataset.color));
    }
    for (const range of root.querySelectorAll('[data-range]')) {
      range.disabled = !state;
      if (state) range.value = edits.get(range.dataset.range)?.value ?? read(state, range.dataset.range);
    }
    for (const reset of tabs.querySelectorAll('[data-reset],[data-reset-menu]')) reset.disabled = !state;
    const display = root.querySelector('[data-display-toggles]');
    display.querySelector('[data-display-value]').value = JSON.stringify(Object.keys(DISPLAY).filter(key => root.querySelector(`[data-field="appearance.${key}"]`).checked));
    display.querySelector('.dropdown-btn').disabled = !state; refreshDropdown(display);
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
    // Opening, cancelling or returning a color preview to its initial swatch preserves exact linear values.
    if (field.type === 'color' && field.value.toLowerCase() === linearToHex(base).toLowerCase()) value = structuredClone(base);
    if (field.type === 'range') root.querySelector(`[data-field="${key}"]`).value = field.value;
    else if (field.type === 'number' && field.validity.valid) root.querySelector(`[data-range="${key}"]`).value = value;
    if (previous && equal(value, previous.value)) return key;
    if (!sent && equal(value, base) && equal(read(state, key), base)) {
      edits.delete(key); setFieldError(field);
      if (field.type === 'color') root.querySelector(`[data-color="${key}"]`).style.backgroundColor = field.value;
      buttons(); return key;
    }
    edits.set(key, { value, base, committed: false, version: ++version });
    if (field.type === 'color') root.querySelector(`[data-color="${key}"]`).style.backgroundColor = field.value;
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
  // Sliders apply while dragging: each move commits, and the save queue keeps one request in flight, then sends the latest.
  const input = event => { const field = event.target.closest('[data-field],[data-range]'); if (field && root.contains(field)) field.matches('[data-range]') ? commit(field) : edit(field); };
  const change = event => {
    if (event.target.matches?.('[data-display-value]')) {
      // Each changed choice commits through its own field, exactly like the former switches.
      const on = new Set(JSON.parse(event.target.value || '[]'));
      for (const key of Object.keys(DISPLAY)) {
        const box = root.querySelector(`[data-field="appearance.${key}"]`);
        if (box.checked === on.has(key)) continue;
        box.checked = on.has(key); edit(box); commit(box);
      }
      return;
    }
    const field = event.target.closest('[data-field],[data-range]'); if (field && root.contains(field)) commit(field);
  };
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
  function selectTab(section, focus = false, remember = true) {
    if (remember && adopted) rememberTab(section);
    closeMenu(); closeColorPopover();
    for (const item of tabs.querySelectorAll('[data-tab]')) {
      const selected = item.dataset.tab === section;
      item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1;
      if (selected && focus) item.focus();
    }
    for (const action of tabs.querySelectorAll('[data-tab-action]')) action.hidden = action.dataset.tabAction !== section;
    for (const panel of root.querySelectorAll('[role="tabpanel"]')) panel.hidden = panel.id !== `${prefix}-panel-${section}`;
    for (const panel of pagePanels) panel.hidden = panel.dataset.tabPanel !== section;
    if (setup) { setup.hidden = section !== 'setup'; root.hidden = section !== 'geometry' && section !== 'appearance'; }
  }
  const tabKeydown = event => {
    const current = event.target.closest('[data-tab]');
    if (current && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const all = [...tabs.querySelectorAll('[data-tab]')], index = all.indexOf(current);
      const next = event.key === 'Home' ? all[0] : event.key === 'End' ? all.at(-1) : all[(index + (event.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      event.preventDefault(); selectTab(next.dataset.tab, true); return;
    }
    keydown(event);
  };
  const click = event => {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) { selectTab(tabButton.dataset.tab); return; }
    const menuButton = event.target.closest('[data-reset-menu]');
    if (menuButton) {
      if (activeMenu?.button === menuButton) closeMenu(); else showMenu(menuButton);
      return;
    }
    const swatch = event.target.closest('[data-color]');
    if (swatch && state) {
      // The shared color popover replaces the browser picker; previews edit, closing commits.
      event.preventDefault(); const field = root.querySelector(`[data-field="${swatch.dataset.color}"]`);
      openColorPopover(swatch, { value: field.value, onInput: hex => { field.value = hex; field.dispatchEvent(new Event('input', { bubbles: true })); }, onClose: () => field.dispatchEvent(new Event('change', { bubbles: true })) });
    }
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
  // Right-click a swatch to copy its color or paste one copied from another swatch (or the clipboard).
  let copiedColor = '', menuSwatch = null;
  const colorMenu = document.createElement('div');
  colorMenu.className = 'menu'; colorMenu.setAttribute('role', 'menu'); colorMenu.setAttribute('aria-label', 'Color'); colorMenu.hidden = true;
  colorMenu.innerHTML = '<button type="button" role="menuitem" data-color-action="copy">Copy color</button><button type="button" role="menuitem" data-color-action="paste">Paste color</button>';
  root.append(colorMenu);
  const hideColorMenu = () => { colorMenu.hidden = true; menuSwatch = null; };
  const contextmenu = event => {
    const swatch = event.target.closest('[data-color]');
    if (!swatch || !state || swatch.disabled) return;
    event.preventDefault(); closeMenu(); closeColorPopover(); menuSwatch = swatch;
    colorMenu.hidden = false; positionFloating(colorMenu, { x: event.clientX, y: event.clientY });
    colorMenu.querySelector('[data-color-action]').focus();
  };
  const colorAction = async event => {
    const action = event.target.closest('[data-color-action]')?.dataset.colorAction, swatch = menuSwatch;
    if (!action || !swatch) return;
    const field = root.querySelector(`[data-field="${swatch.dataset.color}"]`); hideColorMenu();
    if (action === 'copy') { copiedColor = field.value; await navigator.clipboard?.writeText(field.value).catch(() => {}); return; }
    const clip = (await navigator.clipboard?.readText().catch(() => '')) ?? '';
    const text = (/^#?[0-9a-f]{6}$/i.test(clip.trim()) ? clip.trim() : copiedColor).toLowerCase();
    if (!/^#?[0-9a-f]{6}$/.test(text)) return;
    field.value = text.startsWith('#') ? text : `#${text}`;
    field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const colorOutside = event => { if (!colorMenu.hidden && !colorMenu.contains(event.target)) hideColorMenu(); };
  const colorKey = event => { if (event.key === 'Escape') { const swatch = menuSwatch; hideColorMenu(); swatch?.focus(); } else menuKeyboard(event, colorMenu, () => hideColorMenu()); };
  root.addEventListener('contextmenu', contextmenu); colorMenu.addEventListener('click', event => void colorAction(event)); colorMenu.addEventListener('keydown', colorKey);
  document.addEventListener('pointerdown', colorOutside, { capture: true, signal: menuEvents.signal });
  const beforeunload = event => { if (edits.size || busy) { event.preventDefault(); event.returnValue = ''; } };
  addEventListener('beforeunload', beforeunload);
  // Only the Hands page (whose tab bar this editor adopted) restores the remembered tab.
  if (adopted) { const saved = rememberedTab(); if (tabs.querySelector(`[data-tab="${saved}"]`)) selectTab(saved, false, false); }
  form.addEventListener('input', input); form.addEventListener('change', change); form.addEventListener('keydown', keydown); form.addEventListener('submit', submit); root.addEventListener('click', click); tabs.addEventListener('click', click); tabs.addEventListener('keydown', tabKeydown);
  render();
  return { refresh, markStale() { void load().then(refresh).catch(error => { failure = error.message; buttons(); }); }, reviewToken: () => undefined,
    get dirty() { return edits.size > 0; }, get revision() { return state?.revision; }, get deliveryEpoch() { return deliveryEpoch; },
    updateDelivery(_text, deliveryState, revision, epoch) {
      if (epoch === deliveryEpoch && revision === state?.revision && !edits.size && !busy) { retryDelivery = deliveryState === 'failed'; buttons(); }
    },
    dispose() { disposed = true; removeEventListener('beforeunload', beforeunload); form.removeEventListener('input', input); form.removeEventListener('change', change); form.removeEventListener('keydown', keydown); form.removeEventListener('submit', submit); root.removeEventListener('click', click); root.removeEventListener('contextmenu', contextmenu); closeColorPopover(); colorMenu.remove(); tabs.removeEventListener('click', click); tabs.removeEventListener('keydown', tabKeydown); if (adopted) tabs.querySelectorAll('[data-tab-action]').forEach(node => node.remove()); else tabs.remove(); if (setup) { setup.hidden = false; setup.removeAttribute('role'); setup.removeAttribute('aria-labelledby'); root.hidden = false; } disposers.reverse().forEach(fn => fn()); root.replaceChildren(); } };
}
