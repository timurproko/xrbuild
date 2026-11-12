// One document-level header measurement for all shared workspace templates, including wrapped toolbars.
const mounted = new WeakMap();
export function installWorkspaceLayout(doc = document) {
  if (mounted.has(doc)) return mounted.get(doc);
  const win = doc.defaultView, header = doc.body?.querySelector(':scope > .xrb-app-bar');
  if (!header || !win?.ResizeObserver) return () => {};
  const update = () => {
    const value = `${header.getBoundingClientRect().height}px`;
    if (doc.documentElement.style.getPropertyValue('--xrb-app-bar-height') !== value) doc.documentElement.style.setProperty('--xrb-app-bar-height', value);
  };
  const observer = new win.ResizeObserver(update);observer.observe(header);update();
  const dispose = () => {observer.disconnect();doc.documentElement.style.removeProperty('--xrb-app-bar-height');mounted.delete(doc);};
  mounted.set(doc, dispose);return dispose;
}
if (typeof document !== 'undefined') {
  const start = () => installWorkspaceLayout(document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});else start();
}
