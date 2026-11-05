// App icon rendered by the app itself. The page is opened with `?xrb-icon=<size>`: the app then
// shows only what should be its icon (e.g. the main 3D object, centred, no HTML UI, transparent
// background) in a square view. That one PNG becomes the package thumbnail and the window/taskbar icon.
//
// Contract: every app answers the icon view. Apps built on createXrb() get it without code
// (Xrb draws the scene square and transparent, serves the studio and signals ready); an app can
// still frame it itself by calling serveIconCapture()/iconReady() (the last server wins).
//
// Two ways to take it:
// - unattended: `xrb-host --render-icon=<out.png>`; the app calls iconReady() once the icon
//   frame is drawn, and the host saves the view;
// - interactive: the control panel's icon studio embeds the page with `&interactive` in an
//   iframe; the developer turns the view, and Take asks the app for a PNG of the current frame
//   (serveIconCapture).

const READY_MARKER = '[xrb-icon] ready';

export interface IconRequest {
  /** square view size in pixels */
  size: number;
  /** the view stays navigable (icon studio): keep controls active */
  interactive: boolean;
}

/** The icon request when the page was opened to render its icon, else null. */
export function iconRender(search = typeof location === 'undefined' ? '' : location.search): IconRequest | null {
  const params = new URLSearchParams(search);
  const v = params.get('xrb-icon');
  if (v === null) return null;
  const size = Number.parseInt(v, 10);
  return { size: Number.isFinite(size) && size > 0 ? size : 512, interactive: params.has('interactive') };
}

/**
 * Tells the host the icon frame is on screen. Call it after the frame that should become the
 * icon was rendered (textures loaded); the host waits a few frames more and saves the view.
 */
export function iconReady(): void {
  console.info(READY_MARKER);
}

/** Messages between the icon studio (parent window) and the app (iframe). */
export type IconStudioMessage =
  | { type: 'xrb-icon:hello'; size: number; canPause: boolean; canReset?: boolean }
  | { type: 'xrb-icon:capture'; id: number }
  | { type: 'xrb-icon:pause'; paused: boolean }
  | { type: 'xrb-icon:reset' }
  | { type: 'xrb-icon:png'; id: number; png: Blob }
  | { type: 'xrb-icon:error'; id: number; message: string };

/** The window pieces serveIconCapture uses; injectable for tests. */
export interface IconStudioEnv {
  parent: { postMessage(message: unknown, targetOrigin: string): void } | null;
  addEventListener(type: 'message', fn: (e: { data: unknown; source: unknown; origin: string }) => void): void;
  removeEventListener(type: 'message', fn: (e: { data: unknown; source: unknown; origin: string }) => void): void;
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  /** performance.now-compatible clock; injectable for pause-timeline tests */
  now?: () => number;
  location?: { search: string };
}

/**
 * Pause for the studio, for any app: while paused, animation-frame callbacks are held back (the
 * render loop, auto-rotation, tweens all stop) and run again on resume. Capture still draws its
 * own frame, so a paused moment can be taken.
 */
function pauser(env: IconStudioEnv) {
  const original = env.requestAnimationFrame?.bind(env);
  if (!original) return null;
  const now = env.now ?? (() => performance.now());
  let paused = false;
  let pausedAt = 0;
  let pausedMs = 0;
  let held: FrameRequestCallback[] = [];
  // Deliver a virtual animation timestamp with all paused time removed. Apps that derive their
  // transforms from the RAF timestamp then continue from the frozen frame instead of jumping.
  const request = (cb: FrameRequestCallback) => original((time) => {
    // A callback requested before Pause may still be queued by the browser. Do not let that
    // pending frame advance the app during the pause.
    if (paused) held.push(cb);
    else cb(time - pausedMs);
  });
  env.requestAnimationFrame = (cb: FrameRequestCallback) => {
    if (!paused) return request(cb);
    held.push(cb);
    return 0;
  };
  return {
    set(p: boolean) {
      if (p === paused) return;
      paused = p;
      if (paused) {
        pausedAt = now();
      } else {
        pausedMs += Math.max(0, now() - pausedAt);
        const run = held;
        held = [];
        for (const cb of run) request(cb);
      }
    },
    restore() {
      if (paused) pausedMs += Math.max(0, now() - pausedAt);
      paused = false;
      env.requestAnimationFrame = original;
      for (const cb of held) request(cb);
      held = [];
    },
  };
}

let active: (() => void) | null = null;

/** True while some code answers the icon studio on this page. */
export function iconServing(): boolean {
  return active !== null;
}

/**
 * Answers the icon studio: announces itself to the parent window, and on each capture request
 * draws one frame with `renderFrame` and replies with the canvas as PNG. The PNG is read in the
 * same task as the draw, so the WebGL drawing buffer is still valid. Only messages from the
 * parent window are answered. Returns a function that stops serving.
 */
export function serveIconCapture(
  canvas: { toBlob(cb: (b: Blob | null) => void, type?: string): void },
  renderFrame: () => void,
  size: number,
  env: IconStudioEnv = window as unknown as IconStudioEnv,
  /**
   * `reset`: restores the starting view (turn and zoom); the studio then offers Reset.
   * `pausable: false`: the view holds still by itself (a 3D icon), so the studio offers no Pause.
   */
  options: { reset?: () => void; pausable?: boolean } = {},
): () => void {
  const parent = env.parent;
  if (!parent || parent === (env as unknown)) return () => {};  // not embedded
  active?.();  // one server per page: the latest (the app's own) wins
  // The studio's iframe uses the light scheme; a different one here would make the browser
  // paint the iframe opaque and hide the icon's transparency.
  if (typeof document !== 'undefined') document.documentElement.style.colorScheme = 'light';
  const pause = options.pausable === false ? null : pauser(env);
  // Freeze after the first drawn icon frame, before the app queues its next animation frame.
  if (new URLSearchParams(env.location?.search ?? '').has('paused')) pause?.set(true);
  const onMessage = (e: { data: unknown; source: unknown; origin: string }) => {
    if (e.source !== parent) return;
    const m = e.data as Partial<IconStudioMessage> | null;
    if (m?.type === 'xrb-icon:reset') {
      options.reset?.();
      return;
    }
    if (m?.type === 'xrb-icon:pause') {
      pause?.set(!!(m as { paused?: boolean }).paused);
      return;
    }
    if (!m || m.type !== 'xrb-icon:capture' || typeof m.id !== 'number') return;
    const id = m.id;
    const reply = (msg: IconStudioMessage) => parent.postMessage(msg, e.origin || '*');
    try {
      renderFrame();
      canvas.toBlob((png) => {
        if (png) reply({ type: 'xrb-icon:png', id, png });
        else reply({ type: 'xrb-icon:error', id, message: 'the canvas could not be read as PNG' });
      }, 'image/png');
    } catch (err) {
      reply({ type: 'xrb-icon:error', id, message: String((err as Error)?.message ?? err) });
    }
  };
  env.addEventListener('message', onMessage);
  parent.postMessage({ type: 'xrb-icon:hello', size, canPause: !!pause, canReset: !!options.reset } satisfies IconStudioMessage, '*');
  const stop = () => {
    env.removeEventListener('message', onMessage);
    pause?.restore();
    if (active === stop) active = null;
  };
  active = stop;
  return stop;
}
