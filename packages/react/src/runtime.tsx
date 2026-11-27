import * as THREE from 'three';
import React, { createContext, useLayoutEffect } from 'react';
import { advance, createRoot, extend, unmountComponentAtNode, useFrame, type RootStore } from '@react-three/fiber';
import { createXrbApp, rendererOptions, type XrbAppFrame, type XrbAppOptions, type XrbAppRuntime } from '../../sdk/src/index.ts';

// Fibre only constructs catalogue entries actually used as JSX elements.
extend(THREE as unknown as Parameters<typeof extend>[0]);
const attached = new WeakSet<XrbAppRuntime>();
const noop = () => {};

/** Internal bridge context; never creates a second SDK runtime. */
export interface BridgeContext {
  app: XrbAppRuntime;
  frame: XrbAppFrame | null;
}
export const XrbContext = createContext<BridgeContext | null>(null);

/** New: SDK-owned renderer facade. Fiber may observe it, but cannot own output or XR. */
export function componentRenderer(renderer: THREE.WebGLRenderer): THREE.WebGLRenderer {
  const blocked = new Set(['render', 'setSize', 'setPixelRatio', 'setAnimationLoop', 'dispose', 'forceContextLoss']);
  const xr = new Proxy(renderer.xr, {
    get(target, key) {
      if (['setAnimationLoop', 'setSession', 'addEventListener', 'removeEventListener'].includes(String(key))) return noop;
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set: () => true,
  });
  const shadowMap = { ...renderer.shadowMap };
  return new Proxy(renderer, {
    get(target, key) {
      if (blocked.has(String(key))) return noop;
      if (key === 'xr') return xr;
      if (key === 'shadowMap') return shadowMap;
      if (key === 'renderLists') return { dispose: noop };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    // Fiber's colour/tone-mapping defaults must not restyle existing apps.
    set: () => true,
  });
}

class MountBoundary extends React.Component<{ children: React.ReactNode; fail(error: Error): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.fail(error); }
  render() { return this.state.failed ? null : this.props.children; }
}
function Committed({ done, children }: { done(): void; children: React.ReactNode }) {
  useLayoutEffect(done, [done]);
  return children;
}

function FrameOwner({ context, children }: { context: BridgeContext; children: React.ReactNode }) {
  // Positive priority disables Fiber's implicit gl.render. No drawing happens here.
  useFrame(noop, 1);
  return <XrbContext.Provider value={context}><group name="xrb-components">{children}</group></XrbContext.Provider>;
}

/** New: options for an opt-in component mount. A supplied app is borrowed and must be stopped. */
export interface MountXrbAppOptions extends Omit<XrbAppOptions, 'autoStart' | 'setup' | 'frame'> {
  app?: XrbAppRuntime;
  /** Defaults true. When false, the caller starts the SDK runtime after ready. */
  autoStart?: boolean;
}

/** New: one component tree and one SDK runtime, with explicit asynchronous teardown. */
export interface XrbAppMount {
  readonly app: XrbAppRuntime;
  readonly ready: Promise<void>;
  update(children: React.ReactNode): void;
  dispose(): Promise<void>;
}

/** New: mount React content THROUGH the SDK, never through a Canvas runtime. */
export function mountXrbApp(container: HTMLElement, children: React.ReactNode, options: MountXrbAppOptions = {}): XrbAppMount {
  const owned = !options.app;
  const renderer = options.app?.renderer ?? new THREE.WebGLRenderer(rendererOptions());
  const app = options.app ?? createXrbApp(renderer, { ...options, autoStart: false });
  if (app.isDisposed || app.isRunning || attached.has(app)) throw new Error('Component mounting requires an unattached, stopped SDK runtime');
  attached.add(app);
  if (owned) container.appendChild(renderer.domElement);
  const camera = app.camera as typeof app.camera & { manual?: boolean };
  const previousManual = camera.manual;
  camera.manual = true;
  const context: BridgeContext = { app, frame: null };
  const root = createRoot(renderer.domElement);
  let store: RootStore | undefined;
  let retired = false;
  let disposal: Promise<void> | undefined;
  let offFrame = noop;
  let elapsed = 0;
  let tree = children;
  let committed!: () => void, failed!: (error: Error) => void;
  const commit = new Promise<void>((resolve, reject) => { committed = resolve; failed = reject; });
  const renderTree = () => { store = root.render(<MountBoundary fail={(error) => { failed(error); void dispose(); }}><Committed done={committed}><FrameOwner context={context}>{tree}</FrameOwner></Committed></MountBoundary>); };
  const size = () => ({ ...app.xrb.viewSize(), top: 0, left: 0 });
  const ready = (async () => {
    await root.configure({
      gl: componentRenderer(renderer), scene: app.scene, camera,
      frameloop: 'never', dpr: renderer.getPixelRatio(), size: size(),
      legacy: !THREE.ColorManagement.enabled,
      // No Fiber event manager is installed: SDK bindMouse is authoritative.
    });
    if (retired) return;
    renderTree();
    await commit;
    if (retired) return;
    offFrame = app.onComponentFrame((frame) => {
      if (retired || !store) return;
      context.frame = frame;
      const state = store.getState();
      const view = size();
      if (state.size.width !== view.width || state.size.height !== view.height) state.setSize(view.width, view.height);
      // In 'never' mode Fiber uses elapsed seconds, not RAF milliseconds. Seed the
      // clock explicitly so first/restart deltas stay SDK-derived (including zero).
      state.clock.elapsedTime = elapsed;
      elapsed += frame.deltaSeconds;
      advance(elapsed, false, state, frame.xrFrame ?? undefined);
    });
    if (options.autoStart !== false) app.start();
  })();

  const dispose = (): Promise<void> => {
    if (disposal) return disposal;
    retired = true;
    app.stop();
    offFrame();
    disposal = (async () => {
      await ready.catch(noop);
      // Component effects must clean up while their SDK still exists. Fiber's
      // supplied-renderer finalizer sees only the guarded facade.
      // Fiber's generic scene finalizer enumerates and disposes scene properties.
      // Caller-owned background/environment textures are not component resources.
      const hidden: [string, boolean][] = [];
      for (const [key, value] of Object.entries(app.scene)) {
        if (value && typeof value.dispose === 'function') {
          const descriptor = Object.getOwnPropertyDescriptor(app.scene, key)!;
          if (descriptor.configurable && descriptor.enumerable) {
            hidden.push([key, true]); Object.defineProperty(app.scene, key, { enumerable: false });
          }
        }
      }
      try {
        await new Promise<void>((resolve) => unmountComponentAtNode(renderer.domElement, () => resolve()));
      } finally {
        for (const [key, enumerable] of hidden) Object.defineProperty(app.scene, key, { enumerable });
      }
      if (previousManual === undefined) delete camera.manual; else camera.manual = previousManual;
      // Fiber's scene bookkeeping belongs to this root, not to a later mount.
      delete (app.scene as THREE.Scene & { __r3f?: unknown }).__r3f;
      attached.delete(app);
      if (owned) {
        app.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      }
    })();
    return disposal;
  };
  // Failed configuration is rolled back too; keep the rejection visible to callers.
  void ready.catch(() => { void dispose(); });
  return { app, ready, update(next) {
    if (retired) throw new Error('The component mount is disposed');
    tree = next;
    if (store) renderTree();
  }, dispose };
}
