// Slider and stepped slider. Three ways to hold the handle:
//  - touch-drag: push the fingertip onto the handle and slide; lift the finger to let go (poke target on the handle);
//  - pinch: pinch near the handle, move, release the pinch (pinch target at the handle);
//  - the track: a poke (or mouse press) on the track jumps the handle there and drags on.
// A stepped slider snaps to its steps with a tick per step, pitched by position (higher toward the end);
// the handle eases onto each step. A smooth slider ticks softly every 5 % of travel (like the dial's
// detents) and clicks at each end.
import * as THREE from 'three';
import { PinchTarget, PokeTarget, type TargetEvent } from '@xr-build/sdk';
import { Control, sourceOf } from './control.ts';
import { pitchOf, play } from './sound.ts';
import { COLORS, approach, disc, material, roundedBox } from './theme.ts';

export interface SliderOptions {
  title: string;
  length?: number;
  /** number of positions (>= 2) for a stepped slider; omit for a continuous one */
  steps?: number;
  value?: number;
}

const TRACK_H = 0.012, TRACK_D = 0.005;
const FILL_H = TRACK_H * 0.55;
const HANDLE_W = 0.022, HANDLE_H = 0.032, HANDLE_D = 0.014;
const HANDLE_Z = 0.004;
const HANDLE_TOP = HANDLE_Z + HANDLE_D;
const TOUCH_TRAVEL = 0.006;

export type SliderMode = 'touch' | 'pinch' | 'mouse';

export class Slider extends Control {
  /** 0..1 (stepped: step / (steps - 1)) */
  value: number;
  readonly steps: number | null;
  readonly length: number;
  private readonly handle = new THREE.Group();
  private readonly handleMaterial = material(COLORS.cap, { roughness: 0.4 });
  private readonly fill: THREE.Mesh;
  /** length the fill geometry was built for (rebuilt, not stretched: stretching flattens its round ends) */
  private fillBuiltW = 0;
  private readonly pinch: PinchTarget;
  private readonly touch: PokeTarget;
  private readonly track: PokeTarget;
  private grab: { mode: SliderMode; offset: number } | null = null;
  private shownX: number;
  private hover = 0;
  private press = 0;

  constructor(options: SliderOptions) {
    super(options.title, -0.032);
    this.length = options.length ?? 0.15;
    this.steps = options.steps && options.steps >= 2 ? options.steps : null;
    this.value = this.snap(options.value ?? 0);
    const L = this.length;
    const trackMesh = new THREE.Mesh(roundedBox(L + TRACK_H, TRACK_H, TRACK_D, TRACK_H / 2), material(COLORS.track));
    // Fill: the accented part of the track up to the handle (continuous slider only).
    this.fill = new THREE.Mesh(new THREE.BufferGeometry(), material(COLORS.accent));
    this.fill.visible = !this.steps;
    this.add(trackMesh, this.fill);
    if (this.steps) {
      for (let i = 0; i < this.steps; i++) {
        const dot = new THREE.Mesh(disc(0.0016, 0.0008, 16), material(COLORS.muted));
        dot.position.set(-L / 2 + (i / (this.steps - 1)) * L, 0, TRACK_D);
        this.add(dot);
      }
    }
    // Handle with grip ridges, like the UIKit slider thumb.
    this.handle.add(new THREE.Mesh(roundedBox(HANDLE_W, HANDLE_H, HANDLE_D, 0.004), this.handleMaterial));
    for (const x of [-0.005, 0, 0.005]) {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.0012, HANDLE_H * 0.7, 0.0012), material(x === 0 ? COLORS.accent : '#8d96a6'));
      ridge.position.set(x, 0, HANDLE_D);
      this.handle.add(ridge);
    }
    this.handle.position.z = HANDLE_Z;
    this.add(this.handle);
    this.shownX = this.xOf(this.value);

    // Targets in the slider's frame; the handle ones follow the value.
    const hx = () => this.xOf(this.value);
    this.pinch = this.target(new PinchTarget(this, { position: new THREE.Vector3(hx(), 0, HANDLE_Z + HANDLE_D / 2) }));
    this.touch = this.target(new PokeTarget(this, {
      inside: (x, y) => Math.abs(x - hx()) < HANDLE_W / 2 && Math.abs(y) < HANDLE_H / 2,
      centre: new THREE.Vector2(hx(), 0), top: HANDLE_TOP, travel: TOUCH_TRAVEL,
    }));
    this.track = this.target(new PokeTarget(this, {
      inside: (x, y) => Math.abs(x) < L / 2 + TRACK_H / 2 && Math.abs(y) < TRACK_H / 2 && Math.abs(x - hx()) >= HANDLE_W / 2,
      top: TRACK_D, travel: 0.005,
    }));
    this.pinch.on((e) => this.onTarget(e, 'pinch', true));
    this.touch.on((e) => this.onTarget(e, 'touch', true));
    this.track.on((e) => this.onTarget(e, 'touch', false));
    this.showStatus();
  }

  private onTarget(e: TargetEvent, handMode: SliderMode, fromHandle: boolean): void {
    const mode: SliderMode = e.source === 'mouse' ? 'mouse' : handMode;
    if (e.type === 'start') {
      if (this.grab) return;  // one holder at a time (the core keeps targets exclusive per hand, not across targets)
      // On the handle: drag it from where it was taken; on the track: jump there first.
      const offset = fromHandle ? this.xOf(this.value) - e.local.x : 0;
      this.begin(mode, offset);
      if (!fromHandle) this.moveTo(e.local.x, mode);
    } else if (e.type === 'move') {
      if (this.grab) this.moveTo(e.local.x + this.grab.offset, mode);
    } else if (e.type === 'end') {
      this.release();
    }
  }

  private xOf(v: number): number { return -this.length / 2 + v * this.length; }

  private snap(v: number): number {
    v = THREE.MathUtils.clamp(v, 0, 1);
    return this.steps ? Math.round(v * (this.steps - 1)) / (this.steps - 1) : v;
  }

  get step(): number {
    return this.steps ? Math.round(this.value * (this.steps - 1)) : 0;
  }

  private showStatus(): void {
    this.status.set(this.steps ? `Step: ${this.step + 1} / ${this.steps}` : `Value: ${this.value.toFixed(2)}`);
  }

  /** Moves to the value under local x; emits change (and a tick per step). */
  private moveTo(x: number, source: SliderMode): void {
    const v = this.snap((x + this.length / 2) / this.length);
    if (v === this.value) return;
    const before = this.step;
    const old = this.value;
    this.value = v;
    // Stepped: a tick per step, higher toward the top. Smooth: a soft detent every 5 %, the ends click.
    if (this.steps && this.step !== before) play('step', pitchOf(v));
    if (!this.steps) {
      if (v === 0 || v === 1) play('step', pitchOf(v));
      else if (Math.floor(v * 20) !== Math.floor(old * 20)) play('detent', pitchOf(v));
    }
    this.showStatus();
    this.emit('change', { value: v, step: this.step, source });
  }

  update(dt: number): void {
    // The handle targets follow the value.
    const hx = this.xOf(this.value);
    this.pinch.position.x = hx;
    this.touch.centre.x = hx;
    const hoverFrom = Math.max(this.touch.state.proximity, this.pinch.state.proximity * 0.5, this.track.state.proximity * 0.5, this.mouseOver ? 0.6 : 0);
    // Visuals: the handle eases onto its (snapped) position, lifts while held.
    this.shownX = approach(this.shownX, hx, dt, this.steps ? 16 : 40);
    this.press = approach(this.press, this.grab ? 1 : 0, dt);
    this.hover = approach(this.hover, this.enabled ? hoverFrom : 0, dt);
    this.handle.position.set(this.shownX, 0, HANDLE_Z + this.press * 0.003 - (this.grab?.mode === 'touch' ? Math.min(this.touch.state.depth, TOUCH_TRAVEL) * 0.5 : 0));
    this.handleMaterial.color.set(COLORS.cap).lerp(new THREE.Color(COLORS.accent), this.press * 0.5 + this.hover * 0.2);
    this.handleMaterial.emissive.set(COLORS.accent).multiplyScalar(this.press * 0.2 + this.hover * 0.08);
    if (!this.steps) {
      // Fully round ends, from the track's left end to under the handle; rebuilt every 0.5 mm of change.
      const fh = FILL_H, left = -this.length / 2 - fh / 2;
      const w = Math.max(fh, this.shownX + fh / 2 - left);
      if (Math.abs(w - this.fillBuiltW) > 0.0005) {
        this.fill.geometry.dispose();
        this.fill.geometry = roundedBox(w, fh, TRACK_D + 0.0006, fh / 2);
        this.fillBuiltW = w;
      }
      this.fill.position.x = left + this.fillBuiltW / 2;
    }
    this.fade(dt);
  }

  private begin(mode: SliderMode, offset: number): void {
    this.grab = { mode, offset };
    play('grab');
    this.emit('grab', { mode });
  }

  private release(): void {
    if (!this.grab) return;
    const mode = this.grab.mode;
    this.grab = null;
    play('release', 0.8);
    this.emit('release', { mode });
  }

  protected cancel(): void {
    this.release();
  }
}

export { sourceOf };
