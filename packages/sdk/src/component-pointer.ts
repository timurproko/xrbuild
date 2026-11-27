import * as THREE from 'three';
import { pointerProvenance } from './pointer.ts';

/** New: supported SDK-picked component pointer events (not Fiber DOM events). */
export type ComponentPointerType = 'pointerover' | 'pointerout' | 'pointermove' | 'pointerdown' | 'pointerup' | 'pointercancel' | 'click';
/** New: hit data uses SDK rays; eventObject is the registered ancestor receiving the event. */
export interface ComponentPointerEvent {
  type: ComponentPointerType;
  object: THREE.Object3D;
  eventObject: THREE.Object3D;
  point: THREE.Vector3;
  ray: THREE.Ray;
  nativeEvent: Event;
  handId: number | null;
  stopPropagation(): void;
}
/** New: explicit event subset; a miss is a click without a registered mesh hit. */
export interface ComponentPointerHandlers {
  onPointerOver?: (event: ComponentPointerEvent) => void;
  onPointerOut?: (event: ComponentPointerEvent) => void;
  onPointerMove?: (event: ComponentPointerEvent) => void;
  onPointerDown?: (event: ComponentPointerEvent) => void;
  onPointerUp?: (event: ComponentPointerEvent) => void;
  onPointerCancel?: (event: ComponentPointerEvent) => void;
  onClick?: (event: ComponentPointerEvent) => void;
  onPointerMissed?: (event: Event) => void;
}
/** New: optional historical whole-canvas camera picking for compatibility migrations. */
export interface ComponentPointerOptions { camera?: THREE.Camera }
interface PointerHit extends THREE.Intersection { ray: THREE.Ray }
interface Registration { handlers: ComponentPointerHandlers; options: ComponentPointerOptions }
const names: Record<ComponentPointerType, keyof ComponentPointerHandlers> = {
  pointerover: 'onPointerOver', pointerout: 'onPointerOut', pointermove: 'onPointerMove',
  pointerdown: 'onPointerDown', pointerup: 'onPointerUp', pointercancel: 'onPointerCancel', click: 'onClick',
};
function visible(object: THREE.Object3D) {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/** SDK-owned optional mesh route, fed only by the existing bindMouse listener owner. */
export class ComponentPointer {
  private readonly handlers = new Map<THREE.Object3D, Registration>();
  private readonly raycaster = new THREE.Raycaster();
  private hover: PointerHit | null = null;
  private pressed: PointerHit | null = null;
  private cancelled = false;
  private blockedGesture = false;

  add(object: THREE.Object3D, handlers: ComponentPointerHandlers, options: ComponentPointerOptions = {}): () => void {
    if (this.handlers.has(object)) throw new Error('Component pointer object is already registered');
    const registration = { handlers, options };
    this.handlers.set(object, registration);
    return () => {
      if (this.handlers.get(object) !== registration) return;
      this.handlers.delete(object);
      if (this.hover && (this.hover.object === object || this.isChildOf(this.hover.object, object))) {
        this.hover = null; this.cancelled = true;
      }
      if (this.pressed && (this.pressed.object === object || this.isChildOf(this.pressed.object, object))) {
        this.pressed = null; this.cancelled = true;
      }
    };
  }

  private isChildOf(child: THREE.Object3D, parent: THREE.Object3D): boolean {
    for (let at = child.parent; at; at = at.parent) if (at === parent) return true;
    return false;
  }

  private pick(ray: THREE.Ray, event: Event, rect?: { left: number; top: number; width: number; height: number }): PointerHit | null {
    let best: PointerHit | null = null;
    for (const [object, { options }] of this.handlers) {
      object.updateWorldMatrix(true, true);
      if (options.camera && rect) {
        const pointer = event as MouseEvent;
        this.raycaster.setFromCamera(new THREE.Vector2((pointer.clientX - rect.left) / rect.width * 2 - 1,
          1 - (pointer.clientY - rect.top) / rect.height * 2), options.camera);
      } else this.raycaster.ray.copy(ray);
      const hit = this.raycaster.intersectObject(object, true).find((candidate) => visible(candidate.object));
      if (hit && (!best || hit.distance < best.distance)) best = { ...hit, ray: this.raycaster.ray.clone() };
    }
    return best;
  }

  private emit(type: ComponentPointerType, hit: PointerHit, _ray: THREE.Ray, nativeEvent: Event) {
    let stopped = false;
    for (let at: THREE.Object3D | null = hit.object; at && !stopped; at = at.parent) {
      const handler = this.handlers.get(at)?.handlers[names[type]] as ((event: ComponentPointerEvent) => void) | undefined;
      handler?.({ type, object: hit.object, eventObject: at, point: hit.point.clone(), ray: hit.ray.clone(), nativeEvent,
        handId: pointerProvenance(nativeEvent)?.handId ?? null, stopPropagation() { stopped = true; } });
    }
  }

  dispatch(type: ComponentPointerType | 'pointerleave', ray: THREE.Ray, event: Event, blocked: boolean, rect?: { left: number; top: number; width: number; height: number }): void {
    if (!this.handlers.size) return;
    const source = pointerProvenance(event);
    if (type === 'pointerdown') { this.cancelled = false; this.blockedGesture = blocked || !!source?.captured; }
    if (blocked || source?.captured) this.blockedGesture = true;
    if (type === 'pointercancel' || source?.cancelled) this.cancelled = true;
    const hit = type === 'pointerleave' || blocked || source?.captured ? null : this.pick(ray, event, rect);
    if (type === 'pointerdown') this.pressed = hit;
    if (type === 'pointercancel' || type === 'click') this.pressed = null;
    if (type === 'pointermove' || type === 'pointerleave') {
      if (this.hover?.object !== hit?.object) {
        if (this.hover) this.emit('pointerout', this.hover, ray, event);
        if (hit) this.emit('pointerover', hit, ray, event);
      }
      this.hover = hit;
    }
    if (type === 'pointerleave') return;
    if (blocked || source?.captured || (type === 'click' && (this.cancelled || this.blockedGesture))) return;
    if (hit) this.emit(type, hit, ray, event);
    else if (type === 'click') for (const { handlers } of this.handlers.values()) handlers.onPointerMissed?.(event);
  }

  clear(): void { this.handlers.clear(); this.hover = null; this.pressed = null; this.cancelled = true; }
}
