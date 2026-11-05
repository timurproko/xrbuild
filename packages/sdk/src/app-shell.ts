import { appResumeUrl, type CameraProjection } from './launch-context.ts';
import { returnTargetFromLaunch } from './return-overlay.ts';
import type { HostInfo } from './host.ts';

export type EscapeAction = 'return' | 'none';
export function escapeAction(returnUrl: string | null, _fullscreen: boolean): EscapeAction {
  return returnUrl ? 'return' : 'none';
}

/** Only a bounded panel-owned preview can request window closure. */
export function previewCloseContext(href: string) {
  try {
    const page = new URL(href), q = page.searchParams;
    const panel = new URL(q.get('xrb-preview-panel') ?? '');
    const route = q.get('xrb-preview-route'), token = q.get('xrb-preview-token'), session = q.get('xrb-preview-session');
    if (panel.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(panel.hostname.toLowerCase())
      || !route?.startsWith('/preview/') || !/^[a-zA-Z0-9-]{16,80}$/.test(token ?? '') || !/^[a-zA-Z0-9-]{16,80}$/.test(session ?? '')
      || q.get('xrb-preview-fullscreen') !== '1') return null;
    return { panel: panel.origin, route, token, session };
  } catch { return null; }
}

export interface AppShellOptions {
  host: HostInfo | null;
  projection(): CameraProjection;
  /** Uses the same feedback/navigation path as the visible X when it is ready. */
  returnToLauncher(): boolean;
}

/** One disposable Escape owner for native and browser SDK apps, including direct launches. */
export function installAppShell(options: AppShellOptions): () => void {
  let pending = false, disposed = false;
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const href = globalThis.location?.href ?? '';
    const target = returnTargetFromLaunch(href);
    const action = escapeAction(target, options.host?.fullscreen === true);
    if (action === 'none') return; // Leave ordinary browser fullscreen/security behavior intact.
    event.preventDefault();
    if (event.repeat || pending || disposed) return;
    pending = true;
    if (!options.returnToLauncher()) location.assign(appResumeUrl(target!, options.projection()));
  };
  globalThis.addEventListener?.('keydown', keydown);
  return () => { disposed = true; globalThis.removeEventListener?.('keydown', keydown); };
}
