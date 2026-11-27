// Hands page layout: a draggable split between the viewer and the side panel, and a "more" menu for tabs that do not fit.
import { iconSvg, openFloating, positionFloating } from './design-system.js';
import { menuKeyboard } from './navigation.js';

const WIDTH_KEY = 'xrb.hands.panelWidth', MIN = 280;
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const store = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

/** Restores the saved side-panel width before the first paint and makes the split draggable. */
export function mountPanelSplitter(workspace, splitter) {
  const max = () => Math.max(MIN, Math.round(workspace.clientWidth * 0.6));
  const apply = (width, save = false) => {
    const next = Math.round(Math.min(max(), Math.max(MIN, width)));
    workspace.style.setProperty('--hands-panel-w', `${next}px`);
    splitter.setAttribute('aria-valuenow', String(next));
    if (save) store(WIDTH_KEY, String(next));
    return next;
  };
  const saved = Number(read(WIDTH_KEY));
  if (Number.isFinite(saved) && saved > 0) apply(saved);
  splitter.setAttribute('aria-valuemin', String(MIN));
  const panelWidth = () => workspace.querySelector('.hands-panel').getBoundingClientRect().width;
  splitter.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); splitter.setPointerCapture(event.pointerId);
    const startX = event.clientX, startWidth = panelWidth();
    document.body.classList.add('hands-resizing');
    const move = e => apply(startWidth - (e.clientX - startX));
    const end = e => {
      splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', end); splitter.removeEventListener('pointercancel', end);
      document.body.classList.remove('hands-resizing'); apply(startWidth - (e.clientX - startX), true);
    };
    splitter.addEventListener('pointermove', move); splitter.addEventListener('pointerup', end); splitter.addEventListener('pointercancel', end);
  });
  splitter.addEventListener('keydown', event => {
    const step = event.shiftKey ? 64 : 16;
    if (event.key === 'ArrowLeft') { event.preventDefault(); apply(panelWidth() + step, true); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); apply(panelWidth() - step, true); }
  });
  splitter.addEventListener('dblclick', () => { workspace.style.removeProperty('--hands-panel-w'); try { localStorage.removeItem(WIDTH_KEY); } catch {} });
  addEventListener('resize', () => { const current = Number(splitter.getAttribute('aria-valuenow')); if (current) apply(current); });
}

/** Tabs that do not fit move into a "more" menu at the end of the bar; the selected tab always stays visible. */
export function mountTabOverflow(bar) {
  const more = document.createElement('span');
  more.className = 'hands-tab-more'; more.hidden = true;
  more.innerHTML = `<button type="button" class="xrb-icon-button" aria-label="More tabs" aria-haspopup="menu" aria-expanded="false" data-no-tooltip>${iconSvg('more')}</button>
    <div class="menu xrb-menu" role="menu" aria-label="More tabs" hidden></div>`;
  const button = more.querySelector('button'), menu = more.querySelector('[role="menu"]');
  const firstAction = bar.querySelector('.hands-tab-action');
  bar.insertBefore(more, firstAction);
  const tabs = () => [...bar.querySelectorAll(':scope > [role="tab"]')];
  const close = (focus = false) => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); if (focus) button.focus(); };
  const layout = () => {
    const all = tabs();
    for (const tab of all) tab.hidden = false;
    more.hidden = true;
    const actions = [...bar.querySelectorAll(':scope > .hands-tab-action:not([hidden])')].reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
    const style = getComputedStyle(bar), gap = parseFloat(style.columnGap) || 0;
    const room = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - actions - (actions ? gap : 0);
    const width = list => list.reduce((sum, tab) => sum + tab.getBoundingClientRect().width, 0) + gap * Math.max(0, list.length - 1);
    if (width(all) <= room) { close(); return; }
    more.hidden = false;
    const moreWidth = more.getBoundingClientRect().width + gap;
    const shown = [...all];
    // Drop tabs from the end, never the selected one, until the rest and the menu button fit.
    for (let i = all.length - 1; i >= 0 && width(shown) + moreWidth > room; i--) {
      if (all[i].getAttribute('aria-selected') === 'true') continue;
      all[i].hidden = true; shown.splice(shown.indexOf(all[i]), 1);
    }
    menu.replaceChildren(...all.filter(tab => tab.hidden).map(tab => {
      const item = document.createElement('button');
      item.type = 'button'; item.role = 'menuitem'; item.textContent = tab.textContent;
      item.addEventListener('click', () => { close(); tab.hidden = false; tab.click(); tab.focus(); });
      return item;
    }));
  };
  button.addEventListener('click', () => {
    if (!menu.hidden) { close(); return; }
    button.setAttribute('aria-expanded', 'true'); openFloating(menu, { anchor: button, align: 'end' });
  });
  menu.addEventListener('keydown', event => menuKeyboard(event, menu, () => close(true)));
  document.addEventListener('pointerdown', event => { if (!menu.hidden && !more.contains(event.target)) close(); }, true);
  document.addEventListener('scroll', () => { if (!menu.hidden) positionFloating(menu, { anchor: button, align: 'end' }); }, { capture: true });
  // Selecting a tab or showing another tab's action changes what fits.
  // Layout itself toggles tab visibility, so only selection and tab-action changes trigger it.
  new MutationObserver(records => {
    if (records.some(r => r.attributeName === 'aria-selected' || r.target.classList?.contains('hands-tab-action'))) requestAnimationFrame(layout);
  }).observe(bar, { subtree: true, attributes: true, attributeFilter: ['aria-selected', 'hidden'] });
  new ResizeObserver(() => layout()).observe(bar);
  layout();
}
