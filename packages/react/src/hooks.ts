import { useContext, useLayoutEffect, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { AnyTarget, TargetEvent, XrbAppFrame, ComponentPointerHandlers, ComponentPointerOptions } from '../../sdk/src/index.ts';
import { XrbContext } from './runtime.tsx';

function useContextValue() {
  const value = useContext(XrbContext);
  if (!value) throw new Error('XR Build hooks require mountXrbApp');
  return value;
}

/** New: existing SDK runtime (including its real renderer, camera and xrb), never another owner. */
export function useXrb() { return useContextValue().app; }

/** New: once per SDK frame, after processed hand sampling and before picking/drawing. */
export function useXrbFrame(callback: (frame: XrbAppFrame) => void): void {
  const context = useContextValue();
  const current = useRef(callback);
  useLayoutEffect(() => { current.current = callback; });
  useFrame(() => { if (context.frame) current.current(context.frame); });
}

/** New: frame-readable getters, not a second hand pipeline or per-frame React render. */
export function useXrbHands() {
  const { xrb } = useXrb();
  const view = useRef({ get current() { return xrb.currentHands; }, get scene() { return xrb.sceneHands; } });
  return view.current;
}

/** New: SDK-picked mesh events. Refs register after commit; callback updates retain capture. */
export function useXrbPointer(ref: RefObject<THREE.Object3D | null>, handlers: ComponentPointerHandlers, options: ComponentPointerOptions = {}): void {
  const { xrb } = useXrb();
  const current = useRef(handlers);
  const registration = useRef<{ object: THREE.Object3D; camera?: THREE.Camera; off(): void } | null>(null);
  useLayoutEffect(() => {
    current.current = handlers;
    const object = ref.current;
    if (registration.current?.object === object && registration.current?.camera === options.camera) return;
    registration.current?.off();
    registration.current = null;
    if (!object) return;
    const proxy: ComponentPointerHandlers = {
      onPointerOver: (e) => current.current.onPointerOver?.(e),
      onPointerOut: (e) => current.current.onPointerOut?.(e),
      onPointerMove: (e) => current.current.onPointerMove?.(e),
      onPointerDown: (e) => current.current.onPointerDown?.(e),
      onPointerUp: (e) => current.current.onPointerUp?.(e),
      onPointerCancel: (e) => current.current.onPointerCancel?.(e),
      onClick: (e) => current.current.onClick?.(e),
      onPointerMissed: (e) => current.current.onPointerMissed?.(e),
    };
    registration.current = { object, camera: options.camera, off: xrb.componentPointer.add(object, proxy, options) };
  });
  useLayoutEffect(() => () => { registration.current?.off(); registration.current = null; }, [xrb, ref]);
}

/** New: register an SDK physical target for this effect lifetime; keep its event semantics. */
export function useXrbTarget(target: AnyTarget | (() => AnyTarget), handler: (event: TargetEvent) => void): void {
  const { xrb } = useXrb();
  const current = useRef(handler);
  useLayoutEffect(() => { current.current = handler; });
  useLayoutEffect(() => {
    const object = typeof target === 'function' ? target() : target;
    if (xrb.interaction.has(object)) throw new Error('The SDK target already has an owner');
    xrb.interaction.add(object);
    const off = object.on((event) => current.current(event));
    return () => {
      // Removal emits a final cancellation to the still-subscribed handler.
      xrb.interaction.remove(object);
      off();
    };
  }, [xrb, target]);
}
