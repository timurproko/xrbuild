// Cache module factories, never mutable/disposable scene objects. Failed imports get bounded fresh URLs.
const modules = new Map();
export async function loadIconModel(url, diameter, fit, importModule = href => import(/* @vite-ignore */ href), pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  let pending = modules.get(url);
  if (!pending) {
    pending = (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const href = new URL(url);
          if (attempt) href.searchParams.set('xrb-icon-retry', String(attempt));
          const module = await importModule(href.href);
          const factory = module.default ?? module.createIcon;
          if (typeof factory !== 'function') return null;
          return factory;
        } catch { if (attempt < 2) await pause(500 * (attempt + 1)); }
      }
      return null;
    })();
    modules.set(url, pending);
  }
  const factory = await pending;
  if (!factory) { if (modules.get(url) === pending) modules.delete(url); return null; }
  try { const object = await factory(); return object ? fit(object, diameter) : null; }
  catch { modules.delete(url); return null; }
}
