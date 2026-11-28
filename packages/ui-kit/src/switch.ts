// Switch (toggle): poke anywhere on it to flip it. The knob slides to the new side and the
// track lights up while on.
import * as THREE from 'three';
import { PokeTarget } from '@xr-build/sdk';
import { Control, placeCursor, sourceOf, touchCursor } from './control.ts';
import { play } from './sound.ts';
import { switchVisual } from './default-visuals.ts';
import { approach } from './theme.ts';
import type { ThemeOptions } from './visual-theme.ts';

const W = 0.064, H = 0.03;
const KNOB_R = 0.0115, KNOB_DEPTH = 0.008, KNOB_REST = 0.008;
const TRAVEL = 0.007;
const SLIDE = W / 2 - H / 2;

export class Switch extends Control {
  isOn = false;
  toggles = 0;
  private readonly knob: THREE.Group;
  private readonly trackMaterial: THREE.MeshStandardMaterial;
  private readonly knobMaterial: THREE.MeshStandardMaterial;
  private readonly poke: PokeTarget;
  private readonly cursor = touchCursor();
  private readonly top = KNOB_REST + KNOB_DEPTH;
  private x = -SLIDE;
  private shown = 0;
  private hover = 0;

  constructor(title: string, on = false, options: ThemeOptions = {}) {
    super(title, -H / 2 - 0.016);
    this.isOn = on;
    this.x = on ? SLIDE : -SLIDE;
    const visual = switchVisual(W, H, KNOB_R, KNOB_DEPTH, KNOB_REST);
    this.knob = visual.knob;
    this.trackMaterial = visual.trackMaterial;
    this.knobMaterial = visual.knobMaterial;
    this.add(visual.track, this.knob, this.cursor);
    this.poke = this.target(new PokeTarget(this, { inside: (x, y) => Math.abs(x) < W / 2 && Math.abs(y) < H / 2, top: this.top, travel: TRAVEL }));
    this.listen(this.poke, (e) => { if (e.type === 'start') this.set(!this.isOn, sourceOf(e.source)); });
    this.showStatus();
    this.visuals.capture(this);
    if (options.theme) this.setTheme(options.theme);
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

    this.hover = approach(this.hover, this.enabled ? Math.max(s.proximity, s.mouseOver ? 0.6 : 0) : 0, dt);
    this.refreshTheme();
    placeCursor(this.cursor, this.poke, this.top - this.shown, this.enabled);
    this.fade(dt);
  }

  protected refreshTheme(): void {
    const colors = this.theme.colors, t = (this.x + SLIDE) / (2 * SLIDE);
    this.trackMaterial.color.set(colors.track).lerp(new THREE.Color(colors.accent), t);
    this.knobMaterial.emissive.set(colors.accent).multiplyScalar(this.hover * 0.12);
    this.fade(0);
  }
}
