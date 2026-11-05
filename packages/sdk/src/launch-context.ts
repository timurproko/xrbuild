export type CameraProjection = 'perspective' | 'orthographic';

export interface AppLaunchContext {
  returnUrl: string;
  projection?: CameraProjection;
}

export interface LaunchLocationLike {
  href?: string;
  protocol?: string;
  host?: string;
  hostname?: string;
  pathname?: string;
  search?: string;
}

const HTTP = new Set(['http:', 'https:']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const PREVIEW_TOKEN = /^[a-zA-Z0-9-]{16,80}$/;

function copyPreviewScope(launch: URL, target: URL): void {
  launch.searchParams.delete('xrb-preview-route');
  launch.searchParams.delete('xrb-preview-token');
  launch.searchParams.delete('xrb-preview-panel');
  if (!LOOPBACK.has(launch.hostname.toLowerCase()) || !LOOPBACK.has(target.hostname.toLowerCase())) return;
  const route = target.searchParams.get('xrb-preview-route');
  if (!route?.startsWith('/preview/')) return;
  launch.searchParams.set('xrb-preview-route', route.endsWith('/') ? route : `${route}/`);
  const token = target.searchParams.get('xrb-preview-token');
  if (token && PREVIEW_TOKEN.test(token)) launch.searchParams.set('xrb-preview-token', token);
  try {
    const panel = new URL(target.searchParams.get('xrb-preview-panel') ?? '');
    if (panel.protocol === 'http:' && LOOPBACK.has(panel.hostname.toLowerCase())) launch.searchParams.set('xrb-preview-panel', panel.origin);
  } catch { /* no bounded panel origin */ }
}

function pageUrl(location?: LaunchLocationLike, search?: string): URL | null {
  try {
    if (location?.href) {
      const url = new URL(location.href);
      if (search !== undefined) url.search = search;
      return url;
    }
    const protocol = location?.protocol ?? 'http:';
    const hostname = location?.hostname;
    if (!location?.host && !hostname) return null;
    const host = location?.host ?? (hostname!.includes(':') && !hostname!.startsWith('[') ? `[${hostname}]` : hostname!);
    return new URL(`${protocol}//${host}${location?.pathname ?? '/'}${search ?? location?.search ?? ''}`);
  } catch {
    return null;
  }
}

/** Reads the bounded, versioned context attached by an XR Build launcher. */
export function appLaunchContext(href = typeof location === 'undefined' ? '' : location.href): AppLaunchContext | null {
  try {
    const page = new URL(href);
    if (page.searchParams.get('xrb-launch') !== '1') return null;
    const rawReturn = page.searchParams.get('xrb-return');
    if (!rawReturn) return null;
    const target = new URL(rawReturn, page);
    if (!HTTP.has(target.protocol)) return null;
    const value = page.searchParams.get('xrb-camera');
    const projection = value === 'perspective' || value === 'orthographic' ? value : undefined;
    return { returnUrl: target.href, ...(projection ? { projection } : {}) };
  } catch {
    return null;
  }
}

export function appLaunchContextFromLocation(search: string, location?: LaunchLocationLike): AppLaunchContext | null {
  const page = pageUrl(location, search);
  return page ? appLaunchContext(page.href) : null;
}

/** Reads projection carried by a destination returning to its launcher, without creating another return control. */
export function appResumeProjectionFromLocation(search: string, location?: LaunchLocationLike): CameraProjection | null {
  const page = pageUrl(location, search);
  if (!page || page.searchParams.get('xrb-resume') !== '1') return null;
  const value = page.searchParams.get('xrb-camera');
  return value === 'perspective' || value === 'orthographic' ? value : null;
}

/** Adds the destination's current projection to a bounded launcher return URL. */
export function appResumeUrl(returnHref: string | URL, projection: CameraProjection): string {
  const target = new URL(returnHref);
  if (!HTTP.has(target.protocol)) throw new Error('launcher return URL must use HTTP(S)');
  target.searchParams.delete('xrb-launch');
  target.searchParams.delete('xrb-return');
  target.searchParams.set('xrb-resume', '1');
  target.searchParams.set('xrb-camera', projection);
  return target.href;
}

/** Applies one provider-neutral launcher context. Legacy bounded fields remain for older managed app bundles. */
export function appLaunchUrl(launchHref: string | URL, context: AppLaunchContext): string {
  const launch = new URL(launchHref);
  const target = new URL(context.returnUrl, launch);
  if (!HTTP.has(target.protocol)) throw new Error('launcher return URL must use HTTP(S)');
  launch.searchParams.set('xrb-launch', '1');
  launch.searchParams.set('xrb-return', target.href);
  copyPreviewScope(launch, target);
  for (const key of ['xrb-preview-session', 'xrb-preview-fullscreen']) {
    launch.searchParams.delete(key);
    if (launch.searchParams.has('xrb-preview-token') && target.searchParams.has(key)) launch.searchParams.set(key, target.searchParams.get(key)!);
  }
  const cursor = target.searchParams.get('xrb-cursor');
  if (cursor === 'system' || cursor === 'ring' || cursor === 'ring-dot') launch.searchParams.set('xrb-cursor', cursor);
  const mouse = target.searchParams.get('xrb-mouse');
  if (mouse === '0' || mouse === '1') launch.searchParams.set('xrb-mouse', mouse);
  if (context.projection === 'perspective' || context.projection === 'orthographic') launch.searchParams.set('xrb-camera', context.projection);
  else launch.searchParams.delete('xrb-camera');
  return launch.href;
}
