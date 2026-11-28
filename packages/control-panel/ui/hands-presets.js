// One preset holds every Hands look-and-feel value at once: Transform, Display and the Mesh layer with its settings.
// The presets icon sits at the end of the side panel's tab bar on those tabs; its menu lists the saved presets
// (a check marks the one the current values match, none while they are custom), Add preset (only when the values
// match no preset), and Reset to defaults for all of them. Right-click a preset to rename, duplicate or delete it.
// Presets are saved in this browser.
import { iconSvg, openFloating, positionFloating } from './design-system.js';

export const PRESETS_KEY = 'xrb.hands.presets.v2';
const LEGACY_KEY = 'xrb.hands.presets';
const PRESET_TABS = new Set(['geometry', 'appearance', 'post']);
const NAME_MAX = 40;

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Saved presets as [{ name, values: { [providerId]: providerValues } }], migrating the older per-tab presets once. */
export function loadPresets(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(PRESETS_KEY) || 'null');
    if (Array.isArray(saved)) return saved.filter(preset => preset && typeof preset.name === 'string' && preset.values && typeof preset.values === 'object');
    const legacy = JSON.parse(storage.getItem(LEGACY_KEY) || 'null');
    if (!legacy) return [];
    const merged = new Map();
    for (const section of ['geometry', 'appearance']) for (const preset of legacy[section] ?? []) {
      if (!preset?.name || !preset.values) continue;
      const entry = merged.get(preset.name) ?? { name: preset.name, values: { adjust: {} } };
      Object.assign(entry.values.adjust, preset.values); merged.set(preset.name, entry);
    }
    return [...merged.values()];
  } catch { return []; }
}
export function savePresets(presets, storage = globalThis.localStorage) {
  try { storage.setItem(PRESETS_KEY, JSON.stringify(presets)); } catch { /* Storage may be blocked; presets then last for this page only. */ }
}

/**
 * providers: [{ id, get(): { presetValues(), presetDefaults(), applyPreset(values), matchesPreset(values) } | null }]
 * A provider that is not ready yet (null) is skipped: its part of a preset is neither captured nor compared.
 */
export function mountHandsPresets(tabs, providers, { storage = globalThis.localStorage } = {}) {
  const document = tabs.ownerDocument;
  const slot = document.createElement('span');
  slot.className = 'hands-tab-action hands-presets';
  slot.innerHTML = `<button type="button" class="xrb-icon-button" data-presets-button aria-label="Presets" aria-haspopup="menu" aria-expanded="false" data-tooltip="Presets">${iconSvg('presets')}</button>
    <div class="menu hands-presets-menu" role="menu" aria-label="Presets" hidden></div>
    <div class="menu hands-presets-context" role="menu" aria-label="Preset actions" hidden>
      <button type="button" role="menuitem" data-preset-action="rename">Rename</button>
      <button type="button" role="menuitem" data-preset-action="duplicate">Duplicate</button>
      <button type="button" role="menuitem" data-preset-action="delete">Delete</button>
    </div>`;
  tabs.append(slot);
  const button = slot.querySelector('[data-presets-button]'), menu = slot.querySelector('.hands-presets-menu'), context = slot.querySelector('.hands-presets-context');
  const events = new AbortController(), signal = events.signal;
  let presets = loadPresets(storage), editing = null, contextName = null;

  const ready = () => providers.map(provider => ({ id: provider.id, api: provider.get() })).filter(provider => provider.api);
  const capture = () => Object.fromEntries(ready().map(({ id, api }) => [id, api.presetValues()]));
  const matches = preset => ready().every(({ id, api }) => !preset.values[id] || api.matchesPreset(preset.values[id]));
  const current = () => presets.find(matches)?.name ?? null;
  const store = next => { presets = next; savePresets(presets, storage); };
  const uniqueName = base => { let name = base, n = 2; while (presets.some(preset => preset.name === name)) name = `${base} ${n++}`; return name; };

  function render() {
    const selected = current();
    const items = presets.map(preset => `<button type="button" role="menuitemcheckbox" aria-checked="${preset.name === selected}" data-preset-name="${escapeHtml(preset.name)}">
        <span class="hands-preset-check" aria-hidden="true">${preset.name === selected ? iconSvg('check') : ''}</span><span>${escapeHtml(preset.name)}</span></button>`).join('');
    const edit = editing ? `<div class="hands-preset-edit"><input type="text" data-preset-input maxlength="${NAME_MAX}" aria-label="Preset name" placeholder="Preset name" value="${escapeHtml(editing.value)}"></div>` : '';
    menu.innerHTML = `${items || '<p class="hands-presets-empty">No presets yet</p>'}
      <hr role="separator">
      ${editing?.mode === 'add' ? edit : `<button type="button" role="menuitem" data-preset-add ${selected || !ready().length ? 'disabled' : ''}>Add preset</button>`}
      <hr role="separator">
      <button type="button" role="menuitem" data-preset-reset ${ready().length ? '' : 'disabled'}>Reset to defaults</button>`;
    if (editing?.mode === 'rename') menu.querySelector(`[data-preset-name="${CSS.escape(editing.name)}"]`)?.replaceWith(Object.assign(document.createElement('div'), { className: 'hands-preset-edit', innerHTML: `<input type="text" data-preset-input maxlength="${NAME_MAX}" aria-label="Preset name" value="${escapeHtml(editing.value)}">` }));
    const input = menu.querySelector('[data-preset-input]');
    if (input) { input.focus(); input.select(); }
  }
  const placement = () => ({ anchor: button, align: 'end' });
  function open() { editing = null; render(); button.setAttribute('aria-expanded', 'true'); openFloating(menu, placement()); }
  function close() { menu.hidden = true; context.hidden = true; editing = null; contextName = null; button.setAttribute('aria-expanded', 'false'); }
  function commitName() {
    const input = menu.querySelector('[data-preset-input]'); if (!input || !editing) return;
    const name = input.value.trim().slice(0, NAME_MAX);
    if (!name) { editing = null; render(); positionFloating(menu, placement()); return; }
    if (editing.mode === 'add') store([...presets.filter(preset => preset.name !== name), { name, values: capture() }]);
    else if (editing.mode === 'rename' && name !== editing.name) store(presets.filter(preset => preset.name !== name).map(preset => preset.name === editing.name ? { ...preset, name } : preset));
    editing = null; render(); positionFloating(menu, placement());
  }
  function apply(name) {
    const preset = presets.find(item => item.name === name); if (!preset) return;
    for (const { id, api } of ready()) if (preset.values[id]) api.applyPreset(preset.values[id]);
    close();
  }
  function resetAll() { for (const { api } of ready()) api.applyPreset(api.presetDefaults()); close(); }

  button.addEventListener('click', () => { if (menu.hidden) open(); else close(); }, { signal });
  menu.addEventListener('click', event => {
    const item = event.target.closest('[data-preset-name]');
    if (item) { apply(item.dataset.presetName); return; }
    if (event.target.closest('[data-preset-add]:not(:disabled)')) { editing = { mode: 'add', value: uniqueName('Preset') }; render(); positionFloating(menu, placement()); return; }
    if (event.target.closest('[data-preset-reset]:not(:disabled)')) resetAll();
  }, { signal });
  menu.addEventListener('keydown', event => {
    if (!event.target.matches('[data-preset-input]')) return;
    if (event.key === 'Enter') { event.preventDefault(); commitName(); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); editing = null; render(); positionFloating(menu, placement()); }
  }, { signal });
  menu.addEventListener('focusout', event => { if (event.target.matches('[data-preset-input]') && !menu.contains(event.relatedTarget)) commitName(); }, { signal });
  menu.addEventListener('contextmenu', event => {
    const item = event.target.closest('[data-preset-name]'); if (!item) return;
    event.preventDefault(); contextName = item.dataset.presetName;
    openFloating(context, { x: event.clientX, y: event.clientY });
  }, { signal });
  context.addEventListener('click', event => {
    const action = event.target.closest('[data-preset-action]')?.dataset.presetAction; if (!action || !contextName) return;
    const name = contextName; context.hidden = true; contextName = null;
    if (action === 'rename') editing = { mode: 'rename', name, value: name };
    else if (action === 'duplicate') { const source = presets.find(preset => preset.name === name); if (source) store([...presets, { name: uniqueName(`${name} copy`), values: structuredClone(source.values) }]); }
    else if (action === 'delete') store(presets.filter(preset => preset.name !== name));
    render(); positionFloating(menu, placement());
  }, { signal });
  document.addEventListener('pointerdown', event => { if (!menu.hidden && !slot.contains(event.target)) close(); }, { capture: true, signal });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { close(); button.focus(); } }, { signal });
  document.defaultView.addEventListener('resize', close, { signal });

  // Shown on Transform, Display and Mesh; Setup and Log have nothing a preset stores.
  const sync = () => { const tab = tabs.querySelector('[role="tab"][aria-selected="true"]')?.dataset.tab; slot.hidden = !PRESET_TABS.has(tab); if (slot.hidden) close(); };
  const observer = new MutationObserver(sync);
  observer.observe(tabs, { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });
  sync();
  return { refresh: () => { if (!menu.hidden && !editing) render(); }, dispose() { observer.disconnect(); events.abort(); slot.remove(); } };
}
