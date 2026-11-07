// @xr-build/sdk: three.js on 3D displays with hand input (XR Build host).
//
//   const xrb = createXrb(renderer);           // after creating your WebGLRenderer
//   scene.add(xrb.handsObject);                // optional hand skeleton
//   function animate() { xrb.render(scene, camera); requestAnimationFrame(animate); }
//
// Inside xrb-host the page is shown in 3D and hands arrive from the cameras; in a
// normal browser the same code renders one view from the nominal viewer position. In a
// headset's browser engine with WebXR, Enter (or xrb.enterXR()) starts an immersive session:
// both eyes come from the headset and hands from its hand tracking (drive frames with
// xrb.setAnimationLoop, which works in all three).
import * as THREE from 'three';
import { HostChannel } from './channel.ts';
import { resolveCursorStyle, type CursorStyle } from './cursor-style.ts';
import { installAppShell } from './app-shell.ts';
export { CURSOR_STYLES, DEFAULT_CURSOR_STYLE, resolveCursorStyle, isCursorStyle, type CursorStyle } from './cursor-style.ts';
import { HandVisual } from './hand-visual.ts';
import { HandInput, type Hand, type HandEvent, type HandInputOptions } from './hands.ts';
import { Interactor, type InteractorOptions } from './interaction/core/interactor.ts';
import { MouseCursor } from './interaction/core/cursor.ts';
import { OneEuro } from './one-euro.ts';
import { DEFAULT_DISPLAY, getHostInfo, type DisplayInfo, type HostInfo } from './host.ts';
import { iconReady, iconRender, iconServing, serveIconCapture, type IconRequest } from './icon.ts';
import { iconControls, IconStage, type IconFactory } from './icon-object.ts';
import { appLaunchContextFromLocation, appResumeProjectionFromLocation, type CameraProjection, type LaunchLocationLike } from './launch-context.ts';
import { loadReturnOverlay } from './return-overlay.ts';
import type { ReturnControl } from './return-control.ts';
import { PointerEmulation } from './pointer.ts';
import { ALL_CAPABILITIES, type HandCapabilities, type PagePerformance, type PlatformInfo, type StatusMessage, type Vec3 } from './protocol.ts';
import { toSceneHand, type SceneHand } from './scene-hands.ts';
import { nominalEyes, panelCropPlanes, StereoRenderer, type AppCamera, type EyePair, type PanelMapping } from './stereo.ts';
import { detectXrMode, eyesInPanel, headOf, rigMatrix, virtualDisplay, VirtualPanel, wantsAutoEnter, XrHands, type XrFrameLike, type XrMode, type XrOptions, type XrSessionLike, type XrSystemLike } from './webxr.ts';

export * from './protocol.ts';
export { HostChannel } from './channel.ts';
export { HandInput, KP, isValidHand, fingerCurl, DEFAULT_HAND_INPUT, type Hand, type HandEvent, type HandInputOptions } from './hands.ts';
export { toSceneHand, type SceneHand } from './scene-hands.ts';
export { HandVisual, DEFAULT_HAND_STYLE, type HandVisualStyle } from './hand-visual.ts';
export { play as playUiSound, setMuted as setUiSoundMuted, setVolume as setUiSoundVolume, Glide as UiSoundGlide, pitchOf as uiSoundPitch } from './ui-sound.ts';
export { Trackball, type TrackballAxis, type TrackballOptions } from './interaction/trackball.ts';
export { DotShell, icosphereVertices } from './interaction/dot-shell.ts';
export { GrabRotate, palmQuaternion, pinchCentre, nearestTarget, type SelectTarget } from './interaction/grab.ts';
export { smoothDamp } from './interaction/smooth-damp.ts';
export * from './interaction/core/index.ts';
export { DEFAULT_DISPLAY, getHostInfo, type DisplayInfo, type HostInfo } from './host.ts';
export { iconRender, iconReady, iconServing, serveIconCapture, type IconRequest, type IconStudioMessage } from './icon.ts';
export { fitIcon, iconControls, IconStage, loadAppIcon, updateIcon, type IconFactory } from './icon-object.ts';
export { appLaunchContext, appLaunchContextFromLocation, appLaunchUrl, appResumeProjectionFromLocation, appResumeUrl, type AppLaunchContext, type CameraProjection, type LaunchLocationLike } from './launch-context.ts';
export { loadReturnOverlay, returnTargetFromLaunch } from './return-overlay.ts';
export { OneEuro, DEFAULT_ONE_EURO } from './one-euro.ts';
export { PointerEmulation, projectToPanel, choosePointerHand } from './pointer.ts';
export { offAxisProjection, panelCropPlanes, PanelFrame, StereoRenderer, NOMINAL_EYE, type AppCamera, type PanelMapping } from './stereo.ts';
export { detectXrMode, VirtualPanel, wantsAutoEnter, XrHands, XR_JOINTS, XR_PANEL_DEFAULTS, type XrMode, type XrOptions, type XrPanelOptions } from './webxr.ts';

export interface XrbOptions {
  /** how panel metres map into the scene; default: panel in front of your camera */
  mapping?: PanelMapping;
  /** per-eye render resolution multiplier (1 = panel pixels) */
  resolutionScale?: number;
  /** turn hands into pointer events on the canvas (pinch = click/drag); default true */
  pointer?: boolean;
  /** Enable mouse interaction and the managed app's round cursor; default true, subject to launch input selection. */
  mouse?: boolean;
  /** Mouse cursor appearance; managed launch preference takes precedence. Default: system. */
  cursor?: CursorStyle;
  hands?: HandInputOptions;
  /** shared interaction core: tuning overrides (see DEFAULT_TUNING) */
  interaction?: InteractorOptions;
  /** expected delay from rendering to the panel lighting up, for hand prediction */
  displayLatencyMs?: number;
  /**
   * Icon view (page opened with `?xrb-icon`): Xrb draws the scene square on a transparent
   * background, answers the icon studio, and tells the host the frame is ready after `readyMs`.
   * Set `autoReady: false` and call iconReady() yourself when the icon frame needs loading first.
   * `create`: the app's 3D icon (the default export of its `src/icon.js`); the icon view then draws only that
   * object, fitted, through an orthographic camera, instead of the app's scene.
   */
  icon?: { autoReady?: boolean; readyMs?: number; create?: IconFactory };
  /** WebXR headset session (no host): session kind, Enter button, virtual panel size and placement */
  xr?: XrOptions;
}

/** Recommended WebGLRenderer options: no MSAA in side-by-side mode (the biggest GPU cost on a 3D display). */
export function rendererOptions(): THREE.WebGLRendererParameters {
  const host = getHostInfo();
  return { antialias: !host?.stereo, powerPreference: 'high-performance' };
}

/** The page's view: 3D (two eyes side by side, woven by the display) or 2D (one view, a plain picture). */
export interface XrbView {
  stereo: boolean;
  /** the host can switch at run time (its display has a switchable session); false in a browser, on a mono display and in a headset */
  switchable: boolean;
}

const navigatorXr = (): XrSystemLike | null => (globalThis as { navigator?: { xr?: XrSystemLike } }).navigator?.xr ?? null;

function resumedPageCover(): HTMLElement | null {
  const page = (globalThis as { location?: Location }).location;
  if (typeof document === 'undefined' || !page || !appResumeProjectionFromLocation(page.search, page)) return null;
  const cover = document.createElement('div');
  Object.assign(cover.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none',
    background: '#11161d', opacity: '1', transition: 'opacity 180ms ease-in',
  });
  document.documentElement.append(cover);
  return cover;
}

export class Xrb {
  readonly host: HostInfo | null;
  readonly display: DisplayInfo;
  readonly channel: HostChannel | null;
  readonly hands: HandInput;
  readonly view: StereoRenderer;
  readonly pointer: PointerEmulation | null;
  /** shared interaction core: register poke / pinch / grab / volume targets, updated before each render */
  readonly interaction: Interactor;
  /** add to your scene to see tracked hands */
  readonly handsObject = new HandVisual();
  /** Managed apps mount this automatically. Legacy createXrb apps can add it to their scene. */
  readonly cursorObject: MouseCursor;
  readonly cursorStyle: CursorStyle;
  readonly mouseEnabled: boolean;
  private readonly restoreCursor: () => void;
  private readonly disposeShell: () => void;
  /** hands of the current frame (panel frame, metres) */
  currentHands: Hand[] = [];
  /** the same hands in scene space: keypoints, fingertip, pinch point and palm frame (same order) */
  sceneHands: SceneHand[] = [];
  /** eyes of the current frame (panel frame, metres) */
  currentEyes: EyePair = nominalEyes();
  /** frames per second measured by the page */
  fps = 0;
  private _stereo: boolean;
  private _projection: CameraProjection = 'perspective';
  private projectionReceived = false;
  private readonly viewListeners = new Set<(view: XrbView) => void>();
  private readonly projectionListeners = new Set<(projection: CameraProjection) => void>();
  /** CPU time of the last xrb.render call (both eyes), ms */
  renderMs = 0;
  /** eye smoothing: steady at rest, quick when the head moves (6 filters: L xyz, R xyz) */
  private readonly eyeFilters = Array.from({ length: 6 }, () => new OneEuro({ minCutoff: 1.0, beta: 6.0, dCutoff: 1.0 }));
  // Performance goes to the host (and from there to the control panel); the app draws none.
  private readonly deliveryMs: number[] = [];
  private readonly frameIntervals: number[] = [];
  private lastFrameAt = 0;
  private returnControl: ReturnControl | null = null;
  private unbindMouse: (() => void) | null = null;
  private resumeCover: HTMLElement | null;
  private disposed = false;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly displayLatencyMs: number;
  private appCamera: AppCamera | null = null;
  private frames = 0;
  private fpsSince = 0;
  private lastHeartbeat = 0;
  /** the page renders its icon (`?xrb-icon`), else null */
  readonly icon: IconRequest | null = iconRender();
  private readonly iconOptions: { autoReady: boolean; readyMs: number };
  private iconStartedAt = 0;
  private iconSignalled = false;
  /** the 3D icon's stage (icon view with `icon.create`); null until created */
  private iconStage: IconStage | null = null;
  private iconStagePending = false;
  /** the immersive session this browser offers (known shortly after start), null without one or under a host */
  xrMode: XrMode | null = null;
  private readonly xrOptions: XrOptions;
  private readonly xrPanel: VirtualPanel;
  private readonly xrHands = new XrHands();
  /** parent of the XR camera: reference space -> scene, so the virtual panel lands where the mapping puts the panel */
  private readonly xrRig = new THREE.Object3D();
  private readonly xrCamera = new THREE.PerspectiveCamera();
  private xrButton: HTMLButtonElement | null = null;
  private xrFrames = 0;

  constructor(renderer: THREE.WebGLRenderer, options: XrbOptions = {}) {
    this.renderer = renderer;
    this.host = getHostInfo();
    const launch = new URLSearchParams(globalThis.location?.search ?? '');
    this.mouseEnabled = options.mouse !== false && this.host?.mouseEnabled !== false && launch.get('xrb-mouse') !== '0';
    this.cursorStyle = resolveCursorStyle(launch.get('xrb-cursor') ?? options.cursor);
    this.cursorObject = new MouseCursor({ style: this.cursorStyle });
    const canvasStyle = renderer.domElement.style, previousCursor = canvasStyle?.cursor ?? '';
    if (canvasStyle) canvasStyle.cursor = this.mouseEnabled && this.cursorStyle === 'system' ? 'auto' : 'none';
    this.restoreCursor = () => {
      if (canvasStyle) canvasStyle.cursor = previousCursor;
      this.host?.setCursorStyle?.('system'); // Native Mouse selection still gates visibility.
    };
    this.host?.setCursorStyle?.(this.mouseEnabled ? this.cursorStyle : 'ring-dot');
    this.disposeShell = this.icon ? () => {} : installAppShell({ host: this.host,
      projection: () => this.projection,
      returnToLauncher: () => { if (!this.returnControl) return false; this.returnControl.leave(); return true; },
    });
    this.resumeCover = resumedPageCover();
    this._stereo = !!this.host?.stereo;
    this.xrOptions = options.xr ?? {};
    this.xrPanel = new VirtualPanel(this.xrOptions.panel);
    this.xrRig.matrixAutoUpdate = false;
    this.xrRig.add(this.xrCamera);
    this.display = this.host?.display ?? (this.xrOptions.panel ? virtualDisplay(DEFAULT_DISPLAY, this.xrOptions.panel) : DEFAULT_DISPLAY);
    this.displayLatencyMs = options.displayLatencyMs ?? 8;
    this.channel = this.host ? new HostChannel(this.host) : null;
    this.hands = new HandInput(options.hands);
    this.interaction = new Interactor(options.interaction);
    this.channel?.onHands((m) => {
      this.hands.push(m, this.channel!.hostToPage(m.captureTimeMs));
      this.deliveryMs.push(this.host!.hostNow() - m.captureTimeMs);
      if (this.deliveryMs.length > 60) this.deliveryMs.shift();
    });
    const eye = this.host?.eye ?? { width: innerWidth, height: innerHeight };
    this.view = new StereoRenderer(renderer, this.display, this._stereo, eye, { mapping: options.mapping, resolutionScale: options.resolutionScale });
    // The host's view can change while the app runs (control panel "2D mode", or setStereo below):
    // the page is resized to match and the canvas follows here, so apps need no code for it.
    this.channel?.onView((v) => {
      this.view.setEyeSize(v.width, v.height);
      this.applyView(v.stereo);
    });
    this.channel?.onProjection((value) => {
      const projection: CameraProjection = value.orthographic ? 'orthographic' : 'perspective';
      const changed = projection !== this._projection;
      this._projection = projection;
      if (!changed && this.projectionReceived) return;
      this.projectionReceived = true;
      for (const fn of this.projectionListeners) fn(projection);
    });
    this.iconOptions = { autoReady: options.icon?.autoReady ?? true, readyMs: options.icon?.readyMs ?? 1000 };
    this.pointer = options.pointer === false || this.icon ? null : new PointerEmulation({ element: renderer.domElement });
    if (this.icon) this.startIcon(this.icon.size);
    if (this.icon && options.icon?.create) this.createIconStage(options.icon.create);
    this.setSize();
    if (!this.host && !this.icon) void this.detectXr();
    // Opened from a launcher: add one bundled close control to this runtime rather than creating another host connection.
    const returnControl = this.icon ? null : loadReturnOverlay(this.interaction);
    if (returnControl) void returnControl.then((control) => {
      if (this.disposed) control?.dispose();
      else this.returnControl = control;
    });
  }

  /** true: the page shows two eyes side by side in 3D (or a headset session runs); false: one view in 2D. Can change at run time (onView). */
  get stereo(): boolean {
    return this._stereo || this.presenting;
  }

  /** true while a WebXR headset session runs. */
  get presenting(): boolean {
    return !!this.renderer.xr?.isPresenting;
  }

  /**
   * Drives the app's frames: the browser's animation frames, or the headset's while a session runs
   * (a page's own requestAnimationFrame stops in a session). Pass null to stop.
   */
  setAnimationLoop(fn: ((timeMs: number) => void) | null): void {
    this.renderer.setAnimationLoop(fn);
  }

  /** Starts the headset session; call it from a user gesture (the Enter button does). */
  async enterXR(): Promise<void> {
    const xr = navigatorXr();
    if (!xr || !this.xrMode || this.presenting) return;
    const session = await xr.requestSession(this.xrMode, { optionalFeatures: ['hand-tracking'] });
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');
    this.xrPanel.reset();
    await this.renderer.xr.setSession(session as unknown as XRSession);
    // After the renderer's own end handler, so the page is no longer presenting when the view is reported.
    session.addEventListener('end', () => this.xrEnded());
    // The headset moved its origin (the user recentred the headset): place the panel in front of them again.
    this.renderer.xr.getReferenceSpace()?.addEventListener('reset', () => this.recenter());
    if (this.xrButton) this.xrButton.style.display = 'none';
    this.xrFrames = 0;
    setTimeout(() => {
      if (this.presenting && this.xrFrames === 0) console.warn('[xrb] the headset session shows nothing: drive frames with xrb.setAnimationLoop(fn), requestAnimationFrame stops in a session');
    }, 3000);
    this.emitView();
  }

  /** Ends the headset session. */
  async exitXR(): Promise<void> {
    await (this.renderer.xr.getSession() as unknown as XrSessionLike | null)?.end();
  }

  /** Places the virtual panel in front of the user again (next frame). */
  recenter(): void {
    this.xrPanel.reset();
  }

  private async detectXr(): Promise<void> {
    const xr = navigatorXr();
    this.xrMode = await detectXrMode(xr, this.xrOptions.mode);
    if (!this.xrMode) return;
    if (this.xrOptions.button !== false && typeof document !== 'undefined') this.addXrButton();
    // An installed immersive app starts without a page to tap: its launch is the gesture. A browser that
    // navigated here from a session grants the next one too ('sessiongranted').
    const enter = () => void this.enterXR().catch((e) => console.warn('[xrb] could not start the headset session:', e));
    xr?.addEventListener?.('sessiongranted', enter);
    const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
    if (this.xrOptions.autoEnter ?? wantsAutoEnter(search)) enter();
  }

  private addXrButton(): void {
    const b = document.createElement('button');
    b.textContent = 'Enter';
    b.title = 'Show the app in the headset';
    Object.assign(b.style, {
      position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: '2147483647',
      padding: '12px 28px', border: '1px solid #ffffff55', borderRadius: '24px', background: '#000000aa',
      color: '#fff', font: '600 16px system-ui, sans-serif', cursor: 'pointer',
    });
    b.addEventListener('click', () => void this.enterXR().catch((e) => console.warn('[xrb] could not start the headset session:', e)));
    document.body.appendChild(b);
    this.xrButton = b;
  }

  private xrEnded(): void {
    this.renderer.xr.enabled = false;
    if (this.xrButton) this.xrButton.style.display = '';
    this.setSize();
    this.emitView();
  }

  private emitView(): void {
    const view: XrbView = { stereo: this.stereo, switchable: this.switchable };
    for (const fn of this.viewListeners) fn(view);
  }

  /** true when the host can switch between 2D and 3D while the app runs (its display has a switchable session). */
  get switchable(): boolean {
    return !!this.host?.switchable;
  }

  /**
   * Shows the app in 3D (side by side) or in 2D (one view). On a switchable display the host switches it
   * and resizes the page, then confirms with a view message; in a browser the canvas changes at once.
   */
  setStereo(stereo: boolean): void {
    if (this.presenting) return;  // a headset always shows both eyes
    if (this.channel && this.switchable) {
      this.channel.sendSetView(stereo);
      return;
    }
    this.applyView(stereo);
  }

  /** Called after every view change (2D <-> 3D) with the new view; returns an unsubscribe function. */
  onView(fn: (view: XrbView) => void): () => void {
    this.viewListeners.add(fn);
    return () => this.viewListeners.delete(fn);
  }

  /** The managed mono camera projection requested by the host. */
  get projection(): CameraProjection { return this._projection; }

  /** Called when the host changes managed mono camera projection. */
  onProjection(fn: (projection: CameraProjection) => void): () => void {
    this.projectionListeners.add(fn);
    if (this.channel?.projection) {
      this._projection = this.channel.projection.orthographic ? 'orthographic' : 'perspective';
      this.projectionReceived = true;
      fn(this._projection);
    }
    return () => this.projectionListeners.delete(fn);
  }

  private applyView(stereo: boolean): void {
    const changed = stereo !== this._stereo;
    this._stereo = stereo;
    this.view.setStereo(stereo);
    this.setSize();
    if (changed) this.emitView();
  }

  /** Size of one eye's view in CSS pixels: use it for your camera aspect and UI layout. */
  viewSize(): { width: number; height: number } {
    if (this.icon) return { width: this.icon.size, height: this.icon.size };
    return this.view.viewSize();
  }

  /** Sizes stereo output to provider eyes; mono output covers its viewport without stretching. Call on resize. */
  setSize(): void {
    if (this.icon) {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this.icon.size, this.icon.size);
      return;
    }
    if (this.presenting) return;  // the headset sizes its own views
    if (this.host && this.stereo) {
      this.view.setEyeSize(this.host.eye.width, this.host.eye.height);
    } else {
      const viewportWidth = globalThis.innerWidth ?? this.host?.eye.width ?? this.display.pixelsW;
      const viewportHeight = globalThis.innerHeight ?? this.host?.eye.height ?? this.display.pixelsH;
      const size = coverViewSize(viewportWidth, viewportHeight, this.display.widthM / this.display.heightM);
      this.view.setEyeSize(size.width, size.height);
      const style = this.renderer.domElement?.style;
      if (style) {
        style.position = 'fixed';
        style.left = '50%';
        style.top = '50%';
        style.transform = 'translate(-50%, -50%)';
        style.maxWidth = 'none';
        style.maxHeight = 'none';
      }
    }
    this.view.applyCanvasSize();
  }

  /** Input provider status from the host: `starting`, `running`, `needs-setup`, `device-missing`, `failed` (null in a browser). */
  get handStatus(): StatusMessage | null {
    return this.channel?.status ?? null;
  }

  /**
   * What the input provider tracks natively (from its newest hand frame). Gestures work either way: without
   * pinch or grab the SDK computes them from the keypoints. All true until the first frame and in a browser.
   */
  get handCapabilities(): HandCapabilities {
    return this.channel?.hands?.capabilities ?? ALL_CAPABILITIES;
  }

  /**
   * The station runtime the app runs under and its configure parameters (e.g. per-installation
   * settings). `name` is "" standalone and in a browser; `params` updates when the station configures
   * the app (onPlatform).
   */
  get platform(): PlatformInfo {
    const p = this.channel?.platform;
    if (p) return { name: p.name, params: p.params };
    return { name: this.host?.platform?.name ?? '', params: this.host?.platform?.params ?? {} };
  }

  /** Called when the station sends (new) parameters; returns an unsubscribe function. */
  onPlatform(fn: (platform: PlatformInfo) => void): () => void {
    return this.channel?.onPlatform((p) => fn({ name: p.name, params: p.params })) ?? (() => {});
  }

  on(fn: (e: HandEvent) => void): () => void {
    return this.hands.on(fn);
  }

  /** Keypoints of every current hand in world coordinates (same order as `currentHands`). */
  handsInScene(): THREE.Vector3[][] {
    return this.currentHands.map((h) => h.keypoints.map((p) => this.view.panel.pointToWorld(p, new THREE.Vector3())));
  }

  /** Scene units per physical metre on the panel, for sizing interaction radii. */
  get metre(): number {
    return this.view.panel.scale;
  }

  /**
   * Drives the interaction targets with the mouse too (plain browser or a 3D display): hover on
   * mouse-over, press / take on button down, drag while held, release on button up. Returns an unbind function.
   */
  bindMouse(): () => void {
    if (!this.mouseEnabled) return () => {};
    if (this.unbindMouse) return this.unbindMouse;
    // Perspective/stereo views map the pointer to the physical glass and viewer. Orthographic mono
    // views draw through the app camera directly, so their pick ray must come from that camera too.
    // ManagedCamera changes projection in place, so use its standard camera flag rather than instanceof.
    const unbind = this.interaction.bindMouse(this.renderer.domElement, (u, v) => {
      if (!this.stereo && isOrthographicCamera(this.appCamera)) return pointerRayFromCamera(this.appCamera, u, v);
      const d = this.display;
      const rightEye = this.stereo && u >= 0.5;
      const panelU = this.stereo ? Math.min(1, rightEye ? (u - 0.5) * 2 : u * 2) : u;
      const glass = this.view.panel.pointToWorld([(panelU - 0.5) * d.widthM, (0.5 - v) * d.heightM, 0], new THREE.Vector3());
      const l = this.currentEyes.left, r = this.currentEyes.right;
      const e: Vec3 = this.stereo ? (rightEye ? r : l) : [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2];
      const eye = this.view.panel.pointToWorld(e, new THREE.Vector3());
      return new THREE.Ray(eye, glass.sub(eye).normalize());
    }, { systemCursor: this.cursorStyle === 'system' });
    const release = () => {
      if (this.unbindMouse !== release) return;
      unbind();
      this.unbindMouse = null;
    };
    this.unbindMouse = release;
    return release;
  }

  /** Converts a panel-frame point (metres) to world coordinates for the current frame. */
  toScene(p: Vec3, out = new THREE.Vector3()): THREE.Vector3 {
    return this.view.panel.pointToWorld(p, out);
  }

  /** Renders one frame: updates eyes, hands and pointer, then draws both eyes. */
  render(scene: THREE.Scene, camera: AppCamera): void {
    this.appCamera = camera;
    if (this.icon) {
      this.renderIcon(scene, camera);
      return;
    }
    const now = performance.now();
    const xr = this.presenting;
    const e = this.channel?.eyes;
    if (xr) {
      this.readXr(now);
    } else if (e) {
      const f = this.eyeFilters;
      const L = e.left.map((v, i) => f[i].filter(v, now)) as Vec3;
      const R = e.right.map((v, i) => f[3 + i].filter(v, now)) as Vec3;
      this.currentEyes = { left: L, right: R };
    }
    // Headset joints are already predicted to the frame's display time by the headset.
    this.currentHands = this.hands.sample(xr ? now : now + this.displayLatencyMs);
    // The panel frame follows the camera, so update it before using it for hands.
    this.view.panel.update(this.view.mapping, camera);
    this.returnControl?.attach(scene, this.view.panel, this.visibleDisplay(), isOrthographicCamera(camera) ? 'orthographic' : 'perspective');
    this.sceneHands = this.currentHands.map((h) => toSceneHand(h, this.view.panel));
    this.interaction.update(this.sceneHands, this.metre);
    this.returnControl?.update(now);
    if (!this.mouseEnabled) this.cursorObject.visible = false;
    if (this.mouseEnabled && this.cursorObject.parent) {
      const l = this.currentEyes.left, r = this.currentEyes.right;
      const eye = !this.stereo && isOrthographicCamera(camera)
        ? camera.getWorldPosition(new THREE.Vector3())
        : this.view.panel.pointToWorld([(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2], new THREE.Vector3());
      this.cursorObject.update(this.interaction, this.view.panel, eye, now, this.lastFrameAt > 0 ? (now - this.lastFrameAt) / 1000 : 1 / 60);
    }
    this.handsObject.update(this.currentHands, this.view.panel);
    const l = this.currentEyes.left, r = this.currentEyes.right;
    this.pointer?.update(this.currentHands, [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2], this.display);
    const t0 = performance.now();
    if (xr) this.drawXr(scene, camera);
    else this.view.render(scene, camera, this.currentEyes);
    this.renderMs = performance.now() - t0;
    this.revealResumeCover();

    if (this.lastFrameAt > 0) {
      this.frameIntervals.push(now - this.lastFrameAt);
      if (this.frameIntervals.length > 120) this.frameIntervals.shift();
    }
    this.lastFrameAt = now;
    this.frames++;
    if (now - this.fpsSince >= 1000) {
      this.fps = (this.frames * 1000) / (now - this.fpsSince);
      this.frames = 0;
      this.fpsSince = now;
    }
    if (now - this.lastHeartbeat >= 500) {
      if (this.channel) this.channel.sendHeartbeat(this.performance());
      this.lastHeartbeat = now;
    }
  }

  private revealResumeCover(): void {
    const cover = this.resumeCover;
    if (!cover) return;
    this.resumeCover = null;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      cover.style.opacity = '0';
      setTimeout(() => cover.remove(), 200);
    }));
  }

  /** The page's current performance, as reported to the host. */
  performance(): PagePerformance {
    const eye = this.view.viewSize();
    const scale = this.view.resolutionScale;
    // Only samples from about the last second (latency arrives at the tracking rate).
    const frames = this.frameIntervals.slice(-Math.max(1, Math.round(this.fps) || 60));
    const latency = this.deliveryMs.slice(-Math.max(1, Math.round(this.channel?.hands?.trackingHz ?? 60)));
    return {
      fps: this.fps,
      frameMs: median(frames) ?? 0,
      latencyMs: median(latency),
      eyeWidth: eye.width * scale,
      eyeHeight: eye.height * scale,
    };
  }

  /** Physical part of the panel currently visible after mono cover-cropping. */
  private visibleDisplay(): DisplayInfo {
    if (this.stereo || this.presenting) return this.display;
    const size = this.view.viewSize();
    const viewportWidth = globalThis.innerWidth ?? this.host?.eye.width ?? size.width;
    const viewportHeight = globalThis.innerHeight ?? this.host?.eye.height ?? size.height;
    return {
      ...this.display,
      widthM: this.display.widthM * Math.min(1, viewportWidth / size.width),
      heightM: this.display.heightM * Math.min(1, viewportHeight / size.height),
    };
  }

  /** Headset frame: anchors the virtual panel, then reads the eyes and hands in its frame. */
  private readXr(now: number): void {
    this.xrFrames++;
    const frame = this.renderer.xr.getFrame() as unknown as XrFrameLike | null;
    const space = this.renderer.xr.getReferenceSpace();
    if (!frame || !space) return;
    const pose = frame.getViewerPose(space);
    if (pose && !this.xrPanel.anchored) {
      const head = headOf(pose);
      this.xrPanel.anchor(head.position, head.quaternion);
    }
    if (!this.xrPanel.anchored) return;
    if (pose) this.currentEyes = eyesInPanel(pose, this.xrPanel);
    this.hands.push(this.xrHands.read(frame, space, this.xrPanel, now), now);
  }

  /** Both eyes through the headset; the XR camera's parent puts the virtual panel where the mapping puts the panel. */
  private drawXr(scene: THREE.Scene, camera: AppCamera): void {
    if (camera instanceof THREE.PerspectiveCamera) this.view.syncHeadCamera(camera);
    const panel = this.view.panel;
    rigMatrix(panel.toWorld, this.xrPanel, this.xrRig.matrix);
    this.xrRig.updateMatrixWorld(true);
    // The headset's projections are in metres; the rig scales metres to scene units.
    this.xrCamera.near = camera.near / panel.scale;
    this.xrCamera.far = camera.far / panel.scale;
    const passthrough = this.xrMode === 'immersive-ar' && this.xrOptions.passthroughBackground !== false;
    const background = scene.background, clearAlpha = this.renderer.getClearAlpha();
    if (passthrough) {
      scene.background = null;
      this.renderer.setClearAlpha(0);
    }
    const previousClipping = this.renderer.clippingPlanes;
    this.renderer.clippingPlanes = panelCropPlanes(panel, this.display);
    try {
      this.renderer.render(scene, this.xrCamera);
    } finally {
      this.renderer.clippingPlanes = previousClipping;
    }
    if (passthrough) {
      scene.background = background;
      this.renderer.setClearAlpha(clearAlpha);
    }
  }

  /** Icon view: the canvas alone at the top left, transparent page. */
  private startIcon(size: number): void {
    const canvas = this.renderer.domElement;
    for (const el of [document.documentElement, document.body]) {
      el.style.background = 'transparent';
      el.style.margin = '0';
      el.style.overflow = 'hidden';
    }
    canvas.style.position = 'fixed';
    canvas.style.left = canvas.style.top = '0';
    canvas.style.zIndex = '2147483647';
    canvas.style.width = canvas.style.height = `${size}px`;
    this.renderer.setClearColor(0x000000, 0);
  }

  /** Builds the 3D icon's stage; in the icon studio, drag turns the object and right-drag or scroll zooms. */
  private createIconStage(create: IconFactory): void {
    this.iconStagePending = true;
    void Promise.resolve().then(create).then((object) => {
      const stage = new IconStage(object);
      return stage.ready.then(() => {
        this.iconStage = stage;
        // Shown at once: the icon studio may already hold the app's frames (paused preview).
        stage.draw(this.renderer);
        if (this.icon?.interactive) iconControls(this.renderer.domElement, stage, this.icon.size, () => stage.draw(this.renderer));
      });
    }, (error: unknown) => console.error('[xrb-icon] createIcon failed', error)).finally(() => { this.iconStagePending = false; });
  }

  /** One square frame of the scene without its background, fog and hands, or of the 3D icon when the app has one. */
  private renderIcon(scene: THREE.Scene, camera: AppCamera): void {
    if (this.iconStagePending) {
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      return;
    }
    const stage = this.iconStage;
    const draw = stage ? () => stage.draw(this.renderer) : () => {
      const { background, fog } = scene;
      const hands = this.handsObject.visible;
      scene.background = null;
      scene.fog = null;
      this.handsObject.visible = false;
      if (camera instanceof THREE.PerspectiveCamera && camera.aspect !== 1) {
        camera.aspect = 1;
        camera.updateProjectionMatrix();
      }
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.render(scene, camera);
      scene.background = background;
      scene.fog = fog;
      this.handsObject.visible = hands;
    };
    draw();
    const icon = this.icon!;
    if (icon.interactive) {
      // The app's own serveIconCapture (custom framing) takes precedence.
      // A 3D icon holds still (no Pause) and offers Reset; the developer turns and zooms it.
      if (!iconServing()) {
        serveIconCapture(this.renderer.domElement, draw, icon.size, undefined,
          stage ? { reset: () => { stage.reset(); draw(); }, pausable: false } : {});
      }
    } else if (this.iconOptions.autoReady && !this.iconSignalled) {
      const now = performance.now();
      if (!this.iconStartedAt) this.iconStartedAt = now;
      if (now - this.iconStartedAt >= this.iconOptions.readyMs) {
        this.iconSignalled = true;
        iconReady();
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.unbindMouse?.();
    this.restoreCursor();
    this.disposeShell();
    this.cursorObject.removeFromParent();
    this.returnControl?.dispose();
    this.resumeCover?.remove();
    this.resumeCover = null;
    this.channel?.close();
    this.xrButton?.remove();
    void this.exitXR();
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function createXrb(renderer: THREE.WebGLRenderer, options: XrbOptions = {}): Xrb {
  return new Xrb(renderer, options);
}

export interface ManagedCameraOptions {
  position?: [number, number, number];
  target?: [number, number, number];
  near?: number;
  far?: number;
  perspectiveFov?: number;
  /** Scene height in mono 2D; omitted means match the physical panel's 3D framing. */
  orthographicHeight?: number;
}

interface BroadcastChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  close(): void;
}

export const PREVIEW_PROJECTION_CHANNEL = 'xrb-preview-projection';

export function panelPreviewRoute(location = (globalThis as { location?: LaunchLocationLike }).location): string | null {
  const hostname = location?.hostname?.toLowerCase() ?? '';
  const pathname = location?.pathname ?? '';
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)) return null;
  const explicit = new URLSearchParams(location?.search ?? '').get('xrb-preview-route');
  const route = explicit?.startsWith('/preview/') ? explicit : pathname.startsWith('/preview/') ? pathname : null;
  return route ? (route.endsWith('/') ? route : `${route}/`) : null;
}

export function cameraProjectionFromLaunch(
  search = (globalThis as { location?: LaunchLocationLike }).location?.search ?? '',
  location = (globalThis as { location?: LaunchLocationLike }).location,
): CameraProjection | null {
  const launched = appLaunchContextFromLocation(search, location)?.projection;
  if (launched) return launched;
  const resumed = appResumeProjectionFromLocation(search, location);
  if (resumed) return resumed;
  if (!panelPreviewRoute(location)) return null;
  const value = new URLSearchParams(search).get('xrb-camera');
  return value === 'perspective' || value === 'orthographic' ? value : null;
}

/** Kept for source compatibility; projection is no longer compiled into an app build. */
export function cameraProjectionFromBuild(search?: string, location?: LaunchLocationLike): CameraProjection {
  return cameraProjectionFromLaunch(search, location) ?? 'perspective';
}

function subscribePreviewProjection(fn: (projection: CameraProjection) => void): () => void {
  const route = panelPreviewRoute();
  if (!route) return () => {};
  const apply = (data: unknown) => {
    const message = data as { route?: unknown; projection?: unknown } | null;
    if (message?.route === route && (message.projection === 'perspective' || message.projection === 'orthographic')) fn(message.projection);
  };
  const runtime = globalThis as typeof globalThis & { BroadcastChannel?: new (name: string) => BroadcastChannelLike };
  const params = new URLSearchParams(runtime.location?.search ?? '');
  const token = params.get('xrb-preview-token');
  const channel = runtime.BroadcastChannel ? new runtime.BroadcastChannel(PREVIEW_PROJECTION_CHANNEL) : null;
  if (channel) channel.onmessage = (event) => apply(event.data);
  let timer: ReturnType<typeof setTimeout> | null = null, disposed = false;
  try {
    const panel = new URL(params.get('xrb-preview-panel') ?? '');
    if (token && panel.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(panel.hostname.toLowerCase())) {
      const poll = async () => {
        try {
          const endpoint = new URL('/api/preview/projection', panel);
          endpoint.searchParams.set('route', route);
          endpoint.searchParams.set('token', token);
          const response = await runtime.fetch(endpoint, { cache: 'no-store' });
          if (response.ok) apply(await response.json());
        } catch { /* the preview remains on its last projection while the panel is unavailable */ }
        if (!disposed) timer = setTimeout(poll, 250);
      };
      void poll();
    }
  } catch { /* no bounded panel projection endpoint */ }
  const onMessage = (event: MessageEvent) => {
    const message = event.data as { token?: unknown } | null;
    if (!token || message?.token !== token) return;
    try {
      const hostname = new URL(event.origin).hostname.toLowerCase();
      if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)) return;
    } catch { return; }
    apply(event.data);
  };
  runtime.addEventListener?.('message', onMessage);
  return () => {
    disposed = true;
    if (timer !== null) clearTimeout(timer);
    channel?.close();
    runtime.removeEventListener?.('message', onMessage);
  };
}

/** One camera object whose projection can change without invalidating app-held references. */
export class ManagedCamera extends THREE.PerspectiveCamera {
  left = -3;
  right = 3;
  top = 3;
  bottom = -3;
  projectionMode: CameraProjection;

  constructor(projection: CameraProjection, options: ManagedCameraOptions = {}) {
    super(options.perspectiveFov ?? 42, 1, options.near ?? 0.05, options.far ?? 100);
    this.projectionMode = projection;
    this.setProjection(projection);
  }

  setProjection(projection: CameraProjection): void {
    this.projectionMode = projection;
    const camera = this as unknown as { isPerspectiveCamera: boolean; isOrthographicCamera?: boolean };
    camera.isPerspectiveCamera = projection === 'perspective';
    camera.isOrthographicCamera = projection === 'orthographic';
    this.updateProjectionMatrix();
  }

  override updateProjectionMatrix(): void {
    if (this.projectionMode !== 'orthographic') {
      THREE.PerspectiveCamera.prototype.updateProjectionMatrix.call(this);
      return;
    }
    const dx = (this.right - this.left) / (2 * this.zoom);
    const dy = (this.top - this.bottom) / (2 * this.zoom);
    const cx = (this.right + this.left) / 2;
    const cy = (this.top + this.bottom) / 2;
    this.projectionMatrix.makeOrthographic(cx - dx, cx + dx, cy + dy, cy - dy, this.near, this.far, this.coordinateSystem);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}

export function createManagedCamera(projection: CameraProjection = cameraProjectionFromBuild(), options: ManagedCameraOptions = {}): ManagedCamera {
  const camera = new ManagedCamera(projection, options);
  const position = options.position ?? [0, 0, 6];
  camera.position.set(position[0], position[1], position[2]);
  if (options.target) camera.lookAt(options.target[0], options.target[1], options.target[2]);
  camera.updateMatrixWorld();
  return camera;
}

/** Fixed-aspect view that covers a container; excess width or height is cropped, never stretched. */
export function coverViewSize(width: number, height: number, aspect: number): { width: number; height: number } {
  const w = Math.max(1, width), h = Math.max(1, height), a = Number.isFinite(aspect) && aspect > 0 ? aspect : w / h;
  return w / h > a
    ? { width: Math.ceil(w), height: Math.ceil(w / a) }
    : { width: Math.ceil(h * a), height: Math.ceil(h) };
}

function isOrthographicCamera(camera: AppCamera | null): camera is THREE.OrthographicCamera {
  return !!camera && (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
}

export function pointerRayFromCamera(camera: AppCamera, u: number, v: number): THREE.Ray {
  camera.updateMatrixWorld();
  const x = u * 2 - 1, y = 1 - v * 2;
  const origin = new THREE.Vector3(x, y, -1).unproject(camera);
  const target = new THREE.Vector3(x, y, 1).unproject(camera);
  return new THREE.Ray(origin, target.sub(origin).normalize());
}

export function resizeManagedCamera(camera: AppCamera, width: number, height: number, orthographicHeight = 6): void {
  const aspect = width / Math.max(height, 1);
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) (camera as THREE.PerspectiveCamera).aspect = aspect;
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const orthographic = camera as THREE.OrthographicCamera;
    const halfHeight = orthographicHeight / 2, halfWidth = halfHeight * aspect;
    orthographic.left = -halfWidth;
    orthographic.right = halfWidth;
    orthographic.top = halfHeight;
    orthographic.bottom = -halfHeight;
  }
  camera.updateProjectionMatrix();
}

export interface XrbAppFrame {
  timeMs: number;
  deltaSeconds: number;
  scene: THREE.Scene;
  camera: AppCamera;
  renderer: THREE.WebGLRenderer;
  xrb: Xrb;
}

export interface XrbAppOptions {
  scene?: THREE.Scene;
  projection?: CameraProjection;
  camera?: ManagedCameraOptions;
  xrb?: XrbOptions;
  setup?: (app: XrbAppRuntime) => void;
  frame?: (frame: XrbAppFrame) => void;
  autoStart?: boolean;
}

/** Shared app shell: apps inject scene/UI content while the runtime owns projection, resize and frame rendering. */
export class XrbAppRuntime {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: ManagedCamera;
  readonly xrb: Xrb;
  private readonly orthographicHeight: number | undefined;
  private frame: ((frame: XrbAppFrame) => void) | undefined;
  private lastTimeMs = 0;
  private running = false;
  private readonly offView: () => void;
  private readonly offProjection: () => void;
  private readonly offPreviewProjection: () => void;
  private readonly onResize = () => this.resize();

  constructor(renderer: THREE.WebGLRenderer, options: XrbAppOptions = {}) {
    this.renderer = renderer;
    this.scene = options.scene ?? new THREE.Scene();
    this.orthographicHeight = options.camera?.orthographicHeight;
    this.camera = createManagedCamera(options.projection ?? cameraProjectionFromBuild(), options.camera);
    this.xrb = createXrb(renderer, options.xrb);
    this.xrb.bindMouse();
    this.scene.add(this.xrb.cursorObject);
    this.offView = this.xrb.onView(this.onResize);
    this.offProjection = this.xrb.onProjection((projection) => this.setProjection(projection));
    this.offPreviewProjection = subscribePreviewProjection((projection) => this.setProjection(projection));
    this.frame = options.frame;
    this.resize();
    options.setup?.(this);
    globalThis.addEventListener?.('resize', this.onResize);
    if (options.autoStart !== false) this.start();
  }

  get projection(): CameraProjection { return this.camera.projectionMode; }

  setProjection(projection: CameraProjection): void {
    if (projection === this.camera.projectionMode) return;
    this.camera.setProjection(projection);
    this.resize();
  }

  resize(): void {
    this.xrb.setSize();
    const { width, height } = this.xrb.viewSize();
    // Perspective rendering uses the physical panel frustum, not perspectiveFov. Match its
    // glass plane in orthographic mode rather than guessing a scene-sized zoom constant.
    this.xrb.view.panel.update(this.xrb.view.mapping, this.camera);
    const heightInScene = this.orthographicHeight ?? this.xrb.display.heightM * this.xrb.metre;
    resizeManagedCamera(this.camera, width, height, heightInScene);
  }

  setFrame(frame: ((frame: XrbAppFrame) => void) | undefined): void {
    this.frame = frame;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimeMs = 0;
    this.xrb.setAnimationLoop((timeMs) => {
      const deltaSeconds = this.lastTimeMs ? Math.max(0, timeMs - this.lastTimeMs) / 1000 : 0;
      this.lastTimeMs = timeMs;
      this.frame?.({ timeMs, deltaSeconds, scene: this.scene, camera: this.camera, renderer: this.renderer, xrb: this.xrb });
      this.xrb.render(this.scene, this.camera);
    });
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.xrb.setAnimationLoop(null);
  }

  dispose(): void {
    this.stop();
    globalThis.removeEventListener?.('resize', this.onResize);
    this.offView();
    this.offProjection();
    this.offPreviewProjection();
    this.xrb.dispose();
  }
}

export function createXrbApp(renderer: THREE.WebGLRenderer, options: XrbAppOptions = {}): XrbAppRuntime {
  return new XrbAppRuntime(renderer, options);
}

