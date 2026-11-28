import { useLayoutEffect, useRef, useImperativeHandle, type Ref, type ReactNode } from 'react';
import * as THREE from 'three';
import { useXrb, useXrbFrame } from '../../../react/src/index.ts';
import * as Kit from '../index.ts';

type Detail = Record<string, unknown>;
type Handler = (detail: Detail) => void;
type Owned = THREE.Object3D & { dispose(): void; setTheme(theme: Kit.UiKitThemeSelection): void };
export interface ComponentProps<T> extends Kit.ThemeOptions {
  ref?: Ref<T>;
  children?: ReactNode;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  visible?: boolean;
  enabled?: boolean;
  interactive?: boolean;
  compact?: boolean;
  /** Construction-time customization; use a key to construct a different instance. */
  configure?: (object: T) => void;
  onClick?: Handler;
  onRelease?: Handler;
  onChange?: Handler;
  onGrab?: Handler;
  onRotate?: Handler;
  onOpen?: Handler;
  onClose?: Handler;
}
const events = ['click', 'release', 'change', 'grab', 'rotate', 'open', 'close'] as const;
const eventProp = (name: typeof events[number]) => `on${name[0].toUpperCase()}${name.slice(1)}` as keyof ComponentProps<Owned>;

/** Adapter ownership is independent of default mesh construction and of the SDK input state machine. */
function useObject<T extends Owned>(create: () => T, props: ComponentProps<T>, update?: (object: T) => void) {
  const app = useXrb();
  const host = useRef<THREE.Group>(null);
  const object = useRef<T | null>(null);
  const latest = useRef(props);
  const updateRef = useRef(update);
  useLayoutEffect(() => { latest.current = props; updateRef.current = update; });
  useLayoutEffect(() => {
    if (app.xrb.icon) return;
    const owned = create();
    owned.setTheme(props.theme ?? 'default');
    object.current = owned;
    host.current!.add(owned);
    props.configure?.(owned);
    if (props.visible !== undefined) owned.visible = props.visible;
    if (owned instanceof Kit.Control) {
      if (props.compact) owned.title.visible = owned.status.visible = false;
      owned.setEnabled(props.enabled ?? true);
    }
    updateRef.current?.(owned);
    const off = owned instanceof Kit.Control ? events.map(name => owned.subscribe(name, detail => {
      const handler = latest.current[eventProp(name)] as Handler | undefined;
      handler?.(detail);
    })) : [];
    if (owned instanceof Kit.Control && props.interactive !== false) owned.attach(app.xrb.interaction);
    return () => {
      object.current = null;
      for (const unsubscribe of off) unsubscribe();
      owned.dispose();
    };
    // Construction-only inputs intentionally do not recreate a held control on a callback render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);
  useLayoutEffect(() => {
    const owned = object.current;
    if (!owned) return;
    if (props.visible !== undefined) owned.visible = props.visible;
    if (owned instanceof Kit.Control) {
      owned.setEnabled(props.enabled ?? true);
      if (props.interactive === false) owned.detach();
      else owned.attach(app.xrb.interaction);
      if (props.compact !== undefined) owned.title.visible = owned.status.visible = !props.compact;
    }
    updateRef.current?.(owned);
  });
  useImperativeHandle(props.ref, () => object.current!, [app]);
  useXrbFrame(({ deltaSeconds }) => {
    const owned = object.current;
    if (owned instanceof Kit.Control) owned.update(Math.min(0.1, deltaSeconds));
  });
  return host;
}
function Adapter<T extends Owned>({ create, apply, ...props }: ComponentProps<T> & {create: () => T; apply?: (object: T) => void}) {
  const host = useObject(create, props, apply);
  return <group ref={host} position={props.position} rotation={props.rotation} scale={props.scale} visible={props.visible}>{props.children}</group>;
}
export type ButtonProps = ComponentProps<Kit.Button> & Kit.ButtonOptions;
export function Button(props: ButtonProps) { return <Adapter {...props} create={() => new Kit.Button(props)} />; }
export type SwitchProps = ComponentProps<Kit.Switch> & { title: string; initialOn?: boolean };
export function Switch(props: SwitchProps) { return <Adapter {...props} create={() => new Kit.Switch(props.title, props.initialOn)} />; }
export type SegmentedProps = ComponentProps<Kit.Segmented> & { title: string; options: string[]; initialIndex?: number; latchSelected?: boolean; reselectIndex?: number };
export function Segmented(props: SegmentedProps) { return <Adapter {...props} create={() => new Kit.Segmented(props.title, props.options, props.initialIndex, props)} />; }
export type SliderProps = ComponentProps<Kit.Slider> & Kit.SliderOptions;
export function Slider(props: SliderProps) { return <Adapter {...props} create={() => new Kit.Slider(props)} />; }
export type DialProps = ComponentProps<Kit.Dial> & { title: string };
export function Dial(props: DialProps) { return <Adapter {...props} create={() => new Kit.Dial(props.title)} />; }
export type TrackballProps = ComponentProps<Kit.Trackball> & { title: string; radius: number; axis?: Kit.Trackball['axis'] };
export function Trackball(props: TrackballProps) { return <Adapter {...props} create={() => new Kit.Trackball(props.title, props.radius)} apply={object => { if (props.axis !== undefined) object.axis = props.axis; }} />; }
export type DialogProps = ComponentProps<Kit.Dialog> & Kit.DialogOptions & { open?: boolean; closeButtonVisible?: boolean };
export function Dialog(props: DialogProps) { return <Adapter {...props} create={() => new Kit.Dialog(props)} apply={object => {
  if (props.open !== undefined) props.open ? object.open() : object.close();
  if (props.closeButtonVisible !== undefined) { object.closeButton.visible = props.closeButtonVisible; if (!props.closeButtonVisible) object.closeButton.setEnabled(false); }
}} />; }
export type LabelProps = ComponentProps<Kit.Label> & Kit.LabelOptions & { text: string };
export function Label(props: LabelProps) { return <Adapter {...props} create={() => new Kit.Label(props.text, props)} apply={object => object.set(props.text, props.color)} />; }
export type IconProps = ComponentProps<Kit.Icon> & Kit.IconOptions & { icon: Kit.IconNode };
export function Icon(props: IconProps) { return <Adapter {...props} create={() => new Kit.Icon(props.icon, props)} apply={object => object.set(props.icon, props.color)} />; }
export type GlassEdgeProps = ComponentProps<Kit.GlassEdge> & Kit.GlassEdgeOptions;
export function GlassEdge(props: GlassEdgeProps) { return <Adapter {...props} create={() => new Kit.GlassEdge(props)} />; }

export type BoardOptions = Kit.BoardOptions;
export type BoardProps = ComponentProps<Kit.Board> & BoardOptions;
export function Board(props: BoardProps) { return <Adapter {...props} create={() => new Kit.Board(props)} />; }
