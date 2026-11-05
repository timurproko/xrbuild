// Dial (rotary knob): pinch at the knob and move the pinch around it, like turning a knob by
// its edge. The mouse drags straight instead: up or right turns it up, down or left turns it down. 270 degrees of travel, clockwise = up, a detent tick
// every 1/20 and stops at the ends.
import * as THREE from 'three';
import { PinchTarget } from '@xr-build/sdk';
import { Control } from './control.ts';
import { pitchOf, play } from './sound.ts';
import { COLORS, approach, disc, material, roundedBox, roundedDisc } from './theme.ts';

const R = 0.022, KNOB_D = 0.014, KNOB_Z = 0.003;
const SWEEP = THREE.MathUtils.degToRad(270);
const START = THREE.MathUtils.degToRad(225);  // angle of value 0 (lower left); value 1 at -45 deg
const DETENTS = 20;
const TICKS = 28;
const MOUSE_RANGE = 0.1;  // metres of straight mouse drag for the whole 0..1 range

export class Dial extends Control {
  value = 0;
  private readonly knob = new THREE.Group();
  private readonly knobMaterial = material(COLORS.cap, { roughness: 0.35 });
  private readonly ticks: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly pinch: PinchTarget;
  private angle: number | null = null;
  /** mouse drag: last pointer position (local metres) */
  private mouseAt: THREE.Vector2 | null = null;
  private shown = 0;
  private hover = 0;
  private press = 0;

  constructor(title: string) {
    super(title, -R - 0.024);
    // Same look as the button: a bevelled dark well with a light bevelled cap and a dark marker.
    this.add(new THREE.Mesh(roundedDisc(R + 0.012, 0.004), material(COLORS.well)));
    // Value ring: tick dots that light up to the current value.
    for (let i = 0; i < TICKS; i++) {
      const a = START - (i / (TICKS - 1)) * SWEEP;
      const dot = new THREE.Mesh(disc(0.0013, 0.0008, 12), material(COLORS.track));
      dot.position.set(Math.cos(a) * (R + 0.0065), Math.sin(a) * (R + 0.0065), 0.004);  // on the well's face
      this.ticks.push(dot);
      this.add(dot);
    }
    const body = new THREE.Mesh(roundedDisc(R, KNOB_D), this.knobMaterial);
    // Marker: a pill with round ends, one panel pixel (0.16 mm) wider than the round button's icon stroke.
    const NOTCH_W = 0.00205;
    const notch = new THREE.Mesh(roundedBox(NOTCH_W, R * 0.5, 0.0008, NOTCH_W / 2), material('#30363f', { roughness: 0.6 }));
    notch.position.set(0, R * 0.6, KNOB_D - 0.0001);
    this.knob.add(body, notch);
    this.knob.position.z = KNOB_Z;
    this.add(this.knob);
    // A pinch within 5 cm of the knob's centre (the shared pinch radius) takes it.
    this.pinch = this.target(new PinchTarget(this, { position: new THREE.Vector3(0, 0, KNOB_Z + KNOB_D) }));
    this.pinch.on((e) => {
      if (e.source === 'mouse') {
        // Straight drag: the larger of the horizontal and vertical movement, 10 cm for the full range.
        if (e.type === 'start') { this.mouseAt = new THREE.Vector2(e.local.x, e.local.y); play('grab'); this.emit('grab', { mode: 'mouse' }); }
        else if (e.type === 'move' && this.mouseAt) {
          const dx = e.local.x - this.mouseAt.x, dy = e.local.y - this.mouseAt.y;
          this.mouseAt.set(e.local.x, e.local.y);
          this.setValue(this.value + (Math.abs(dx) > Math.abs(dy) ? dx : dy) / MOUSE_RANGE, 'mouse');
        } else if (e.type === 'end') { this.mouseAt = null; this.emit('release'); }
        return;
      }
      const a = Math.atan2(e.local.y, e.local.x);
      if (e.type === 'start') {
        this.angle = a;
        play('grab');
        this.emit('grab', { mode: e.source === 'mouse' ? 'mouse' : 'pinch' });
      } else if (e.type === 'move' && this.angle !== null) {
        // Near the centre the angle is noise: only turn when the pinch is out at the rim.
        if (Math.hypot(e.local.x, e.local.y) > R * 0.3) this.turn(a - this.angle, e.source === 'mouse' ? 'mouse' : 'pinch');
        this.angle = a;
      } else if (e.type === 'end') {
        this.angle = null;
        this.emit('release');
      }
    });
    this.showStatus();
  }

  private showStatus(): void {
    this.status.set(`Value: ${Math.round(this.value * 100)}`);
  }

  /** Turns by a change in pointer angle (radians, counter-clockwise positive). */
  private turn(da: number, source: string): void {
    // Unwrap across the -pi/pi seam.
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.setValue(this.value - da / SWEEP, source);
  }

  private setValue(value: number, source: string): void {
    const v = THREE.MathUtils.clamp(value, 0, 1);
    if (v === this.value) return;
    const before = Math.round(this.value * DETENTS);
    this.value = v;
    const after = Math.round(v * DETENTS);
    if (after !== before) play(v === 0 || v === 1 ? 'step' : 'detent', pitchOf(v));
    this.showStatus();
    this.emit('change', { value: v, source });
  }

  update(dt: number): void {
    const s = this.pinch.state;
    this.shown = approach(this.shown, this.value, dt, 30);
    this.knob.rotation.z = START - Math.PI / 2 - this.shown * SWEEP;
    this.press = approach(this.press, s.held ? 1 : 0, dt);
    this.hover = approach(this.hover, this.enabled ? Math.max(s.proximity * 0.6, s.mouseOver ? 0.6 : 0) : 0, dt);
    this.knob.position.z = KNOB_Z + this.press * 0.002;
    this.knobMaterial.color.set(COLORS.cap).lerp(new THREE.Color(COLORS.accent), this.press * 0.55 + this.hover * 0.25);
    this.knobMaterial.emissive.set(COLORS.accent).multiplyScalar(this.press * 0.25 + this.hover * 0.08);
    const lit = this.value * (TICKS - 1);
    this.ticks.forEach((t, i) => t.material.color.set(i <= lit + 1e-6 ? COLORS.accent : COLORS.track));
    this.fade(dt);
  }

  protected cancel(): void {
    this.angle = null;
    this.mouseAt = null;
  }
}
