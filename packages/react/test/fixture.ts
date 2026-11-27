import * as THREE from 'three';
import { createXrbApp } from '../../sdk/src/index.ts';

export function fixture() {
  const calls: string[] = [];
  const canvas = Object.assign(new EventTarget(), {
    style: {} as Record<string, string>,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    setPointerCapture() {},
    remove() { calls.push('canvas.remove'); },
  });
  let loop: ((time: number) => void) | null = null;
  let session: (EventTarget & { end(): Promise<void> }) | null = null;
  let width = 800, height = 450;
  const xr = Object.assign(new EventTarget(), {
    enabled: false,
    get isPresenting() { return !!session; },
    getSession: () => session,
    async setSession(value: typeof session) { session = value; value?.addEventListener('end', () => { session = null; }); },
    setReferenceSpaceType() {},
    getReferenceSpace: () => null,
    getFrame: () => null,
    setAnimationLoop() { calls.push('xr.loop'); },
  });
  Object.defineProperty(xr, 'isPresenting', { get: () => !!session });
  const renderer = {
    domElement: canvas, xr,
    shadowMap: { enabled: false },
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping: THREE.NoToneMapping,
    clippingPlanes: [],
    getPixelRatio: () => 1,
    setPixelRatio() { calls.push('dpr'); },
    getSize: (target: THREE.Vector2) => target.set(width, height),
    setSize(w: number, h: number) { width = w; height = h; calls.push('size'); },
    setScissorTest() {}, setViewport() {}, setScissor() {},
    getClearAlpha: () => 1, setClearAlpha() {}, setClearColor() {}, clear() {},
    render() { calls.push('draw'); },
    setAnimationLoop(fn: typeof loop) { loop = fn; calls.push(fn ? 'loop.start' : 'loop.stop'); },
    dispose() { calls.push('renderer.dispose'); },
    forceContextLoss() { calls.push('context.loss'); },
    renderLists: { dispose() { calls.push('lists.dispose'); } },
  } as unknown as THREE.WebGLRenderer;
  const app = createXrbApp(renderer, { autoStart: false, xrb: { pointer: false, xr: { button: false } } });
  const container = { appendChild(element: unknown) { if (element !== canvas) throw new Error('Wrong canvas'); } } as unknown as HTMLElement;
  return { app, renderer, calls, canvas, container, tick: (time: number) => loop?.(time) };
}

export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 30));
