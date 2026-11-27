import { enhanceSelects, installDropdowns, installTabs, installIcons, installTooltips, installWorkspaceLayout, installOverlayScrollbars, iconSvg } from './design-system.js';

/** Shell mounts once: changing tabs never remounts or discards either settings form. */
export function mountHandsShell(view) {
  const events = new AbortController(), signal = events.signal;
  const disposers = [installWorkspaceLayout(document), installOverlayScrollbars(document), enhanceSelects(), installDropdowns(), installTabs(), installIcons(), installTooltips()];
  for (const list of document.querySelectorAll('[role="tablist"]')) {
    if (list.classList.contains('hands-adjustment-tabs')) continue; // The adjustment editor owns these tabs.
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = tab => {
      for (const item of tabs) {
        const active = item === tab;
        item.setAttribute('aria-selected', String(active)); item.tabIndex = active ? 0 : -1;
        document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
      }
    };
    list.addEventListener('click', event => { const tab = event.target.closest('[role="tab"]'); if (tabs.includes(tab)) select(tab); }, { signal });
    list.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const index = tabs.indexOf(document.activeElement); if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      select(tabs[next]); tabs[next].focus();
    }, { signal });
  }
  document.getElementById('hands-view-reset').addEventListener('click', () => view?.resetView(), { signal });
  document.getElementById('hands-view-options').addEventListener('change', event => view?.setViewOptions(JSON.parse(event.target.value)), { signal });
  const viewport = document.getElementById('hands-viewport'), button = document.getElementById('hands-fullscreen');
  const sync = () => {
    const active = document.fullscreenElement === viewport;
    button.innerHTML = iconSvg(active ? 'exit-fullscreen' : 'fullscreen');
    button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  };
  button.addEventListener('click', () => {
    const work = document.fullscreenElement === viewport ? document.exitFullscreen() : viewport.requestFullscreen();
    void work.catch(error => { const output = document.getElementById('hands-view-error'); output.textContent = error.message; output.hidden = false; });
  }, { signal });
  document.addEventListener('fullscreenchange', sync, { signal }); sync();
  return () => { events.abort(); disposers.reverse().forEach(dispose => dispose?.()); };
}
