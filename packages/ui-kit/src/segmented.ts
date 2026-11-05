// Segmented control (radio group): a row of pokeable segments, exactly one selected.
// Selection stays lit; caps latch by default or spring back with latchSelected: false.
import * as THREE from 'three';
import { PokeTarget } from '@xr-build/sdk';
import { Control, placeCursor, sourceOf, touchCursor } from './control.ts';
import { Label } from './label.ts';
import { play } from './sound.ts';
import { COLORS, approach, material, roundedBox } from './theme.ts';

const SEG_W = 0.034, SEG_H = 0.024, GAP = 0.003, DEPTH = 0.007, REST = 0.006, TRAVEL = 0.006;
const LATCHED = 0.003;  // the selected segment sits this far in

interface Segment {
  cap: THREE.Group;
  material: THREE.MeshStandardMaterial;
  label: Label;
  poke: PokeTarget;
  cursor: ReturnType<typeof touchCursor>;
  x: number;
  shown: number;
  hover: number;
}

export class Segmented extends Control {
  index: number;
  readonly options: string[];
  private readonly segments: Segment[];
  private readonly reselectIndex?: number;
  private readonly latchSelected: boolean;

  constructor(title: string, options: string[], index = 0, behavior: { reselectIndex?: number; latchSelected?: boolean } = {}) {
    const width = options.length * SEG_W + (options.length - 1) * GAP;
    super(title, -SEG_H / 2 - 0.016);
    this.options = options;
    if (behavior.reselectIndex !== undefined && (!Number.isInteger(behavior.reselectIndex) || behavior.reselectIndex < 0 || behavior.reselectIndex >= options.length))
      throw new RangeError('reselectIndex must name a segment');
    this.reselectIndex = behavior.reselectIndex;
    this.latchSelected = behavior.latchSelected !== false;
    this.index = index;
    this.add(new THREE.Mesh(roundedBox(width + 0.008, SEG_H + 0.008, 0.004, 0.006), material(COLORS.well)));
    this.segments = options.map((text, i) => {
      const x = -width / 2 + SEG_W / 2 + i * (SEG_W + GAP);
      const m = material(COLORS.capDark, { roughness: 0.4 });
      const cap = new THREE.Group();
      const label = new Label(text, { size: 0.008, color: COLORS.text });
      label.position.z = DEPTH + 0.0003;
      cap.add(new THREE.Mesh(roundedBox(SEG_W, SEG_H, DEPTH, 0.004), m), label);
      cap.position.set(x, 0, REST);
      const cursor = touchCursor();
      this.add(cap, cursor);
      // Each segment is its own poke target; the core picks the one nearest the fingertip (centre tie-break).
      const poke = this.target(new PokeTarget(this, {
        inside: (px, py) => Math.abs(px - x) < SEG_W / 2 + GAP / 2 && Math.abs(py) < SEG_H / 2,
        centre: new THREE.Vector2(x, 0), top: REST + DEPTH, travel: TRAVEL,
      }));
      poke.on((e) => { if (e.type === 'start') this.select(i, sourceOf(e.source)); });
      return { cap, material: m, label, poke, cursor, x, shown: 0, hover: 0 };
    });
    this.showStatus();
  }

  select(i: number, source: 'hand' | 'mouse' | 'code' = 'code'): void {
    if (source !== 'code' && !this.enabled) return;
    if (!Number.isInteger(i) || i < 0 || i >= this.options.length) return;
    if (source !== 'code' && i === this.index && this.reselectIndex !== undefined) i = this.reselectIndex;
    if (i === this.index) return;
    this.index = i;
    if (source !== 'code') play('press');
    this.showStatus();
    this.emit('change', { index: i, value: this.options[i], source });
  }

  private showStatus(): void {
    this.status.set(`Selected: ${this.options[this.index]}`);
  }

  update(dt: number): void {
    this.segments.forEach((s, i) => {
      const st = s.poke.state;
      const pushed = Math.max(this.enabled ? st.depth : 0, this.latchSelected && i === this.index ? LATCHED : 0);
      s.shown = pushed > s.shown ? pushed : approach(s.shown, pushed, dt);
      s.cap.position.z = REST - s.shown;
      s.hover = approach(s.hover, this.enabled ? Math.max(st.proximity, st.mouseOver ? 0.6 : 0) : 0, dt);
      const selected = i === this.index;
      s.material.color.set(COLORS.capDark).lerp(new THREE.Color(COLORS.accent), selected ? 0.85 : s.hover * 0.3);
      s.material.emissive.set(COLORS.accent).multiplyScalar(selected ? 0.15 : s.hover * 0.08);
      placeCursor(s.cursor, s.poke, REST + DEPTH - s.shown, this.enabled);
    });
    this.fade(dt);
  }
}
