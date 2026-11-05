// Switch (toggle): poke anywhere on it to flip it. The knob slides to the new side and the
// track lights up while on.
import * as THREE from 'three';
import { PokeTarget } from '@xr-build/sdk';
import { Control, placeCursor, sourceOf, touchCursor } from './control.ts';
import { play } from './sound.ts';
import { COLORS, approach, material, roundedBox, roundedDisc } from './theme.ts';

const W = 0.064, H = 0.03;
const KNOB_R = 0.0115, KNOB_DEPTH = 0.008, KNOB_REST = 0.008;
const TRAVEL = 0.007;
const SLIDE = W / 2 - H / 2;

export class Switch extends Control {
  isOn = false;
  toggles = 0;
  private readonly knob = new THREE.Group();
  private readonly trackMaterial = material(COLORS.track);
  private readonly knobMaterial = material(COLORS.cap, { roughness: 0.35 });
  private readonly poke: PokeTarget;
  private readonly cursor = touchCursor();
  private readonly top = KNOB_REST + KNOB_DEPTH;
  private x = -SLIDE;
  private shown = 0;
  private hover = 0;

  constructor(title: string, on = false) {
    super(title, -H / 2 - 0.016);
    this.isOn = on;
    this.x = on ? SLIDE : -SLIDE;
    const track = new THREE.Mesh(roundedBox(W, H, 0.006, H / 2), this.trackMaterial);
    this.knob.add(new THREE.Mesh(roundedDisc(KNOB_R, KNOB_DEPTH), this.knobMaterial));  // bevelled like the button cap
    this.knob.position.z = KNOB_REST;
    this.add(track, this.knob, this.cursor);
    this.poke = this.target(new PokeTarget(this, { inside: (x, y) => Math.abs(x) < W / 2 && Math.abs(y) < H / 2, top: this.top, travel: TRAVEL }));
    this.poke.on((e) => { if (e.type === 'start') this.set(!this.isOn, sourceOf(e.source)); });
    this.showStatus();
  }

  set(on: boolean, source: 'hand' | 'mouse' | 'code' = 'code'): void {
    if (on === this.isOn) return;
    this.isOn = on;
    if (source !== 'code') { this.toggles++; play(on ? 'on' : 'off'); }
    this.showStatus();
    this.emit('change', { on, source });
  }

  private showStatus(): void {
    this.status.set(`${this.isOn ? 'On' : 'Off'} (toggles: ${this.toggles})`);
  }

  update(dt: number): void {
    const s = this.poke.state;
    const depth = this.enabled ? s.depth : 0;
    this.shown = depth > this.shown ? depth : approach(this.shown, depth, dt);
    this.x = approach(this.x, this.isOn ? SLIDE : -SLIDE, dt, 14);
    this.knob.position.set(this.x, 0, KNOB_REST - this.shown);
    const t = (this.x + SLIDE) / (2 * SLIDE);  // 0 off .. 1 on, follows the knob
    this.trackMaterial.color.set(COLORS.track).lerp(new THREE.Color(COLORS.accent), t);
    this.hover = approach(this.hover, this.enabled ? Math.max(s.proximity, s.mouseOver ? 0.6 : 0) : 0, dt);
    this.knobMaterial.emissive.set(COLORS.accent).multiplyScalar(this.hover * 0.12);
    placeCursor(this.cursor, this.poke, this.top - this.shown, this.enabled);
    this.fade(dt);
  }
}
