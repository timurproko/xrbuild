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

/** The origin the native host serves its launcher from. */
const NATIVE_APP_ORIGIN = 'https://app.local';

/**
 * Security: a launch link is untrusted input, so the return address must be a launcher this page can trust:
 * its own origin, a loopback development server, or the native host. Anything else would be an open redirect.
 */
function trustedReturnOrigin(target: URL, page: URL): boolean {
  if (!HTTP.has(target.protocol)) return false;
  if (target.origin === page.origin || target.origin === NATIVE_APP_ORIGIN) return true;
  return target.protocol === 'http:' && LOOPBACK.has(target.hostname.toLowerCase());
}

function nativeRootMatches(root: URL, panelOrigin: string, allowDev: boolean): boolean {
  const source = root.searchParams.get('xrb-hand'), panel = root.searchParams.get('xrb-panel');
  if (root.href.length > 8192 || !panel || !['native', 'off'].includes(source ?? '')) return false;
  const local = new URL(panel);
  if (local.origin !== panelOrigin || local.protocol !== 'http:' || !LOOPBACK.has(local.hostname.toLowerCase()) || !local.port
    || local.username || local.password || local.pathname !== '/' || local.search || local.hash) return false;
  return root.origin === NATIVE_APP_ORIGIN || allowDev && HTTP.has(root.protocol) && LOOPBACK.has(root.hostname.toLowerCase())
    && !root.searchParams.has('xrb-launch') && !root.searchParams.has('xrb-preview-token');
}
/** Validates native Launcher metadata for a local document, not permission to start capture or mutate state.
 * Dev roots require an active native run; return-chain traversal supports previously built SDK callers.
 */
export function isNativeLauncherDocument(href: string, panelOrigin: string, nativeDevActive = false): boolean {
  try {
    let page = new URL(href);
    if (page.origin !== panelOrigin || !page.pathname.startsWith('/preview/')) return false;
    const root = page.searchParams.get('xrb-native-root');
    if (root !== null) {
      if (root.length > 8192 || !(appLaunchContext(page.href) || page.searchParams.get('xrb-resume') === '1')) return false;
      return nativeRootMatches(new URL(root), panelOrigin, nativeDevActive);
    }
    for (let depth = 0; depth < 8; depth++) {
      const context = appLaunchContext(page.href);
      if (!context) return false;
      const parent = new URL(context.returnUrl);
      if (nativeRootMatches(parent, panelOrigin, nativeDevActive)) return true;
      if (parent.origin !== panelOrigin) return false;
      page = parent;
    }
  } catch { /* Invalid or foreign launch context is not a native hand-off. */ }
  return false;
}

/** Reads the bounded, versioned context attached by an XR Build launcher. */
export function appLaunchContext(href = typeof location === 'undefined' ? '' : location.href): AppLaunchContext | null {
  try {
    const page = new URL(href);
    if (page.searchParams.get('xrb-launch') !== '1') return null;
    const rawReturn = page.searchParams.get('xrb-return');
    if (!rawReturn) return null;
    const target = new URL(rawReturn, page);
    if (!trustedReturnOrigin(target, page)) return null;
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
  launch.searchParams.delete('xrb-native-root');
  try {
    const root = new URL(target.searchParams.get('xrb-native-root') ?? target.href);
    const panel = new URL(root.searchParams.get('xrb-panel') ?? '');
    if (launch.origin === panel.origin && launch.pathname.startsWith('/preview/') && root.href.length <= 8192
      && nativeRootMatches(root, panel.origin, true)) launch.searchParams.set('xrb-native-root', root.href);
  } catch { /* Only same-panel previews receive the native execution marker. */ }
  for (const key of ['xrb-preview-session', 'xrb-preview-fullscreen']) {
    launch.searchParams.delete(key);
    if (launch.searchParams.has('xrb-preview-token') && target.searchParams.has(key)) launch.searchParams.set(key, target.searchParams.get(key)!);
  }
  const cursor = target.searchParams.get('xrb-cursor');
  if (cursor === 'system' || cursor === 'ring' || cursor === 'ring-dot') launch.searchParams.set('xrb-cursor', cursor);
  const hand = target.searchParams.get('xrb-hand');
  if (!launch.searchParams.has('xrb-hand') && (hand === 'off' || hand === 'native' || hand === 'webxr')) launch.searchParams.set('xrb-hand', hand);
  const mouse = target.searchParams.get('xrb-mouse');
  if (mouse === '0' || mouse === '1') launch.searchParams.set('xrb-mouse', mouse);
  if (context.projection === 'perspective' || context.projection === 'orthographic') launch.searchParams.set('xrb-camera', context.projection);
  else launch.searchParams.delete('xrb-camera');
  return launch.href;
}
