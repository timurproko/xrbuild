import {enhanceSelects, installDropdowns, setPageIdentity} from '/design-system.js';
import {mountToolNavigation, panelOrigin} from '/navigation.js';
const cases = {
  main: {
    title: 'Main', preview: '/design-system/components.html', defaultState: 'all',
    groups: [['Components', [
      ['all', 'All components'], ['typography', 'Typography'], ['actions', 'Buttons and actions'],
      ['fields', 'Fields and controls'], ['navigation', 'Navigation'], ['status', 'Statuses and feedback'],
      ['dialogs', 'Dialogs and progress'], ['layout', 'Layout and content'], ['media', 'Media and output'],
    ]]],
  },
  'install-dependencies': {
    title: 'Install dependencies', preview: '/design-system/install-dependencies.html', defaultState: 'ready',
    groups: [
      ['Checklist', [
        ['missing', 'Everything missing'], ['libraries-ready', 'Libraries ready'], ['partial', 'Some tools installed'],
        ['installing', 'Installing in another session'], ['ready', 'Ready to rebuild'], ['complete', 'All ready'],
        ['failed', 'Installation failed'], ['restart', 'Restart required'], ['blocked', 'Blocked / unsafe state'], ['connection', 'Connection interrupted'],
      ]],
      ['Progress', [
        ['progress-installing', 'Installing'], ['progress-failed', 'Failed'], ['progress-restart', 'Restart required'], ['progress-complete', 'Complete'],
      ]],
    ],
  },
};
const query = new URLSearchParams(location.search), picker = document.querySelector('#case');
const origin = panelOrigin(query.get('xrbuildPanel')) ?? location.origin;
const designLink = {id: 'design-system', label: 'Design', url: new URL('/design', origin).href};
let disposeNavigation;
// A standalone preview returns to the real panel for maintenance; never issue cross-origin mutations.
document.querySelector('#panel-menu').addEventListener('click', event => {
  const action = event.target.closest('[data-navigation]')?.dataset.navigation;
  if (origin !== location.origin && ['restart', 'rebuild'].includes(action)) event.stopImmediatePropagation();
}, {capture:true});
function mountNavigation(tools=[]) {
  disposeNavigation?.();
  disposeNavigation = mountToolNavigation(document.querySelector('#panel-menu-button'), document.querySelector('#panel-menu'), {
    origin, current: 'design-system', discover: false,
    tools: [...tools.filter(tool => tool.id !== 'design-system'), designLink],
  });
}
mountNavigation();
// Discovery is read-only; explicit shell menu actions use real shared maintenance handlers.
// Case documents keep connect-src 'none' and mock every API operation.
void fetch('/api/navigation', {cache:'no-store'}).then(async response => {
  if (!response.ok) return;
  const data = await response.json();
  if (Array.isArray(data.tools)) mountNavigation(data.tools);
}).catch(() => { /* Keep basic app navigation available if discovery is unavailable. */ });
const identity = () => setPageIdentity('Design', '🎨', getComputedStyle(document.documentElement).getPropertyValue('--xrb-glyph-filter').trim());
identity();window.addEventListener('xrb-theme-change', identity);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', identity);
picker.replaceChildren(...Object.entries(cases).map(([id, entry]) => {
  const option = document.createElement('option');option.value = id;option.textContent = entry.title;return option;
}));
picker.value = Object.hasOwn(cases, query.get('case')) ? query.get('case') : query.has('state') ? 'install-dependencies' : 'main';
let selected = query.get('state') === 'manual' ? 'libraries-ready' : query.get('state') ?? cases[picker.value].defaultState;
if (query.get('view') === 'progress' && ['installing', 'failed', 'restart', 'complete'].includes(selected)) selected = `progress-${selected}`;
function render() {
  const entry = cases[picker.value], nav = document.querySelector('#states'), frame = document.querySelector('#preview');
  document.body.dataset.case = picker.value;
  const available = entry.groups.flatMap(([, states]) => states.map(([id]) => id));
  if (!available.includes(selected)) selected = entry.defaultState;
  nav.replaceChildren();
  for (const [title, states] of entry.groups) {
    const section = document.createElement('section');section.className = 'design-scenarios';
    const heading = document.createElement('h2');heading.textContent = title;section.append(heading);
    const list = document.createElement('div');list.className = 'xrb-choice-list';section.append(list);
    for (const [id, label] of states) {
      const button = document.createElement('button');button.type = 'button';button.textContent = label;button.dataset.state = id;
      button.setAttribute('aria-pressed', String(id === selected));
      button.addEventListener('click', () => {selected = id;render();});list.append(button);
    }
    nav.append(section);
  }
  const values = new URLSearchParams({case: picker.value, state: selected});
  if (origin !== location.origin) values.set('xrbuildPanel', origin);
  history.replaceState(null, '', `${location.pathname}?${values}`);
  frame.title = `${entry.title} preview`;
  frame.src = `${entry.preview}?${values}`;
}
picker.addEventListener('change', () => {selected = cases[picker.value].defaultState;render();});
enhanceSelects(document);installDropdowns(document);render();
