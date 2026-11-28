import { componentSceneProps, type ComponentMetadata, type ComponentValues } from './component-settings.ts';
const loopback = (url: URL) => url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !!url.port && !url.username && !url.password;

/** Only an existing managed launch supplies read authority. Standalone apps need no panel. */
export function componentSettingsEndpoint(href: string): URL | null {
  try {
    const app = new URL(href), panel = new URL(app.searchParams.get('xrb-panel') ?? '');
    if (!loopback(panel) || panel.pathname !== '/' || panel.search || panel.hash) return null;
    const project = app.searchParams.get('xrb-project');
    if (!project || project.length > 160) return null;
    const endpoint = new URL('/api/component-settings', panel);
    endpoint.searchParams.set('project', project);
    const token = app.searchParams.get('xrb-preview-token'), session = app.searchParams.get('xrb-preview-session'), route = app.searchParams.get('xrb-preview-route');
    const run = app.searchParams.get('xrb-hand-profile-run');
    if (token && session && route?.startsWith('/preview/')) {
      endpoint.searchParams.set('token', token); endpoint.searchParams.set('session', session); endpoint.searchParams.set('route', route);
    } else if (run && (app.origin === 'https://app.local' || loopback(app))) endpoint.searchParams.set('run', run);
    else return null;
    return endpoint;
  } catch { return null; }
}

function validValues(value: unknown): value is ComponentValues {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).length <= 80
    && Object.entries(value).every(([id, values]) => /^(bundled|workspace):(?:archive\/)?[a-z0-9][a-z0-9-]*$/.test(id)
      && !!values && typeof values === 'object' && !Array.isArray(values) && Object.entries(values).length <= 80
      && Object.entries(values).every(([key, v]) => /^[a-zA-Z][a-zA-Z0-9-]{0,79}$/.test(key) && !['constructor', 'prototype'].includes(key) && typeof v === 'string' && v.length <= 160));
}

/** Small read-only companion to the panel's existing launch scope/polling pattern. */
export async function connectComponentSettings(metadata: ComponentMetadata, options: { href?: string; fetch?: typeof fetch; intervalMs?: number; signal?: AbortSignal } = {}) {
  const endpoint = componentSettingsEndpoint(options.href ?? (typeof location === 'undefined' ? '' : location.href));
  const request = options.fetch ?? globalThis.fetch;
  let props = componentSceneProps(metadata, metadata.componentSettings ?? {});
  let stopped = false, reading = false, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
  const listeners = new Set<(props: Record<string, string>) => void>();
  const read = async () => {
    if (!endpoint || stopped) return;
    reading = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 2000);
    try {
      const response = await request(endpoint, { signal: controller.signal, cache: 'no-store' });
      if (response.status === 404) { stopped = true; return; }
      if (!response.ok) return;
      const text = await response.text();
      if (text.length > 16384 || stopped) return;
      const values: unknown = JSON.parse(text);
      if (!validValues(values)) return;
      const next = componentSceneProps(metadata, values);
      if (JSON.stringify(next) === JSON.stringify(props)) return;
      props = next;
      for (const listener of listeners) listener(props);
    } catch { /* retain the last valid settings while the panel is unavailable */ }
    finally { clearTimeout(timeout); controller = undefined; reading = false; }
  };
  function dispose() {
    stopped = true; clearTimeout(timer); controller?.abort(); listeners.clear();
    options.signal?.removeEventListener('abort', dispose);
  }
  options.signal?.addEventListener('abort', dispose, { once: true });
  if (options.signal?.aborted) dispose();
  await read();
  const schedule = () => {
    clearTimeout(timer);
    if (endpoint && !stopped && !reading && listeners.size) timer = setTimeout(poll, options.intervalMs ?? 1000);
  };
  const poll = async () => { await read(); schedule(); };
  return {
    get props() { return props; },
    subscribe(listener: (props: Record<string, string>) => void) {
      listeners.add(listener);
      if (listeners.size === 1) schedule();
      return () => { listeners.delete(listener); if (!listeners.size) clearTimeout(timer); };
    },
    dispose,
  };
}
