import {enhanceSelects, enhanceHelpText, installDropdowns, installNumberSteppers, installTabs, installTooltips, installIcons, openFloating, setRevealed} from '/design-system.js';
import {menuKeyboard} from '/navigation.js';
import {rebuildProgressDialog} from '/rebuild-dialog.js';
const documents = new WeakMap();
export function initializeComponentDocument(doc = document) {
  if (documents.has(doc)) return;
  documents.set(doc, true);
  enhanceSelects(doc);installDropdowns(doc);installNumberSteppers(doc);installTabs(doc);installTooltips(doc);installIcons(doc);enhanceHelpText(doc);
}

/** The same component examples mount inline in Main or in the standalone isolated document. */
export function mountComponentCatalog(root) {
  const doc = root.ownerDocument, win = doc.defaultView, events = new AbortController(), signal = events.signal;
  initializeComponentDocument(doc);
  const query = selector => root.querySelector(selector), all = selector => root.querySelectorAll(selector);
  const on = (element, type, callback) => element.addEventListener(type, callback, {signal});
  const icons = ['folder','settings','rewind','open','play','pause','stop','search','close','code','copy','trash','camera','reset','fullscreen','exit-fullscreen','check-circle','error-circle'];
  for (const name of icons) {
    const button = doc.createElement('button');button.type = 'button';button.className = 'xrb-icon-button';button.dataset.xrbIcon = name;button.setAttribute('aria-label', name);query('#icon-samples').append(button);
  }
  for (const name of ['none','blue','green','amber','red','purple','teal','grey']) {
    const button = doc.createElement('button');button.type = 'button';button.className = 'xrb-swatch';button.dataset.swatch = name;button.setAttribute('aria-label', name);button.setAttribute('aria-pressed', String(name === 'blue'));query('#example-swatches').append(button);
  }
  for (const group of all('.xrb-segmented,.xrb-swatch-group,.xrb-choice-list')) on(group, 'click', event => {
    const button = event.target.closest('button');if (!button || button.disabled) return;
    group.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  });
  for (const button of all('.xrb-filter-chip')) on(button, 'click', () => button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true')));
  const range = query('#example-range'), rangeValue = () => range.style.setProperty('--range-progress', `${range.value}%`);
  on(range, 'input', rangeValue);rangeValue();
  const tabs = query('[role=tablist]');
  on(tabs, 'click', event => {
    const selected = event.target.closest('[role=tab]');if (!selected) return;
    tabs.querySelectorAll('[role=tab]').forEach(tab => {tab.setAttribute('aria-selected', String(tab === selected));tab.tabIndex = tab === selected ? 0 : -1;});
    const panel = query('#example-panel');panel.textContent = selected.id === 'example-tab-one' ? 'Overview panel' : 'Details panel';panel.setAttribute('aria-labelledby', selected.id);
  });
  const menu = query('#example-menu'), menuButton = query('#example-menu-button');
  const closeMenu = () => {menu.hidden = true;menuButton.setAttribute('aria-expanded', 'false');};
  on(menuButton, 'click', () => {if (!menu.hidden) return closeMenu();openFloating(menu, {anchor:menuButton});menuButton.setAttribute('aria-expanded', 'true');});
  on(menu, 'keydown', event => menuKeyboard(event, menu, () => {closeMenu();menuButton.focus();}));
  on(menu, 'click', () => {closeMenu();menuButton.focus();});
  on(doc, 'click', event => {if (!menu.contains(event.target) && !menuButton.contains(event.target)) closeMenu();});
  const dialog = query('#example-dialog');
  for (const button of all('[data-demo-dialog]')) on(button, 'click', () => {
    const kind = button.dataset.demoDialog;query('#example-dialog-title').textContent = button.textContent;
    query('#example-dialog-description').textContent = kind === 'confirm' ? 'Confirm this local example?' : kind === 'question' ? 'Enter an example value.' : 'This is a message dialog.';
    query('#example-dialog-field').hidden = kind !== 'question';dialog.showModal();
  });
  for (const button of dialog.querySelectorAll('[data-close-dialog]')) on(button, 'click', () => dialog.close());
  // Mock progress has its own shared component instance and IDs, never shell job callbacks or backend requests.
  const progress = rebuildProgressDialog({document:doc, container:root, idPrefix:'xrb-example', storage:null, onViewJob:()=>{}}), timers = new Set();
  for (const button of all('[data-demo-progress]')) on(button, 'click', () => {
    const job = {id:1,state:button.dataset.demoProgress,kind:'desktop-setup',title:'install example components',lines:['Local component example. No process is running.'],error:button.dataset.demoProgress === 'failed' ? 'Example operation could not complete.' : null};
    progress.show(job);
    if (job.state === 'running') {const timer = win.setTimeout(() => {timers.delete(timer);progress.render({...job,state:'done'});}, 1200);timers.add(timer);}
  });
  on(query('#example-reveal'), 'click', event => {const button = event.currentTarget, visible = button.getAttribute('aria-expanded') !== 'true';button.setAttribute('aria-expanded', String(visible));setRevealed(query('#example-reveal-content'), visible);});
  on(query('#example-copy'), 'click', async () => {const status = query('#example-copy-status');try {await win.navigator.clipboard.writeText(query('#example-output').textContent);status.textContent = 'Copied.';} catch {status.textContent = 'Select the output to copy it.';}});
  return {
    select(section) {root.dataset.state = section;if (section === 'all') win.scrollTo(0, 0);else query(`#${CSS.escape(section)}`)?.scrollIntoView();},
    hide() {closeMenu();dialog.close();progress.close();},
    dispose() {events.abort();for (const timer of timers) win.clearTimeout(timer);progress.dispose();},
  };
}
if (typeof document !== 'undefined' && document.querySelector('.component-catalog')) {
  // Standalone fixture retains its strict CSP and request mock. Inline Main does not override shell networking.
  window.fetch = async () => {throw new TypeError('Component examples have no API operations.');};
  const catalog = mountComponentCatalog(document.body);catalog.select(new URLSearchParams(location.search).get('state') || 'all');
  document.documentElement.dataset.fixtureReady = 'true';
}
