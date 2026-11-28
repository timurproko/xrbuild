// Icons from Lucide (the web's Feather successor, ISC): an icon is a list of SVG elements in a
// 24 x 24 box, drawn as strokes. Rendered into a canvas texture on a plane, like Label, with a
// stroke weight of our choosing (Lucide's own is 2; the kit draws bolder on a 3D display).
import * as THREE from 'three';
import type { IconNode } from 'lucide';
import { VisualResources } from './resources.ts';
import { defaultTheme, onCapColor, registerVisualStyle, resolveUiKitTheme, styleMesh, type ThemeOptions, type UiKitThemeSelection } from './visual-theme.ts';

export type { IconNode } from 'lucide';

export interface IconOptions extends ThemeOptions {
  /** icon size in metres (the 24-unit box) */
  size?: number;
  color?: string;
  /** stroke width in icon units (Lucide default 2) */
  stroke?: number;
}

const PX = 256;  // canvas pixels per icon box: crisp strokes on the panel without mip blur

export class Icon extends THREE.Object3D {
  private readonly canvas = document.createElement('canvas');
  private readonly texture = new THREE.CanvasTexture(this.canvas);
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly o: Required<Omit<IconOptions, 'theme'>>;
  private theme = defaultTheme;
  private icon: IconNode;
  private color: string;
  get themeId(): string { return this.theme.id; }
  private readonly resources = new VisualResources();

  private readonly options: IconOptions;
  constructor(icon: IconNode, options: IconOptions = {}) {
    super();
    this.options = options;
    const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));  // an undefined option must not override a default
    this.o = { size: 0.022, color: '#30363f', stroke: 2.1, ...given };
    this.icon = icon; this.color = this.o.color;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    // No mipmaps: a mip-blurred stroke reads lighter than the solid geometry of the dial's marker.
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.mesh = styleMesh(new THREE.Mesh(new THREE.PlaneGeometry(this.o.size, this.o.size), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false })), 'icon', { shape: 'plane', args: [this.o.size, this.o.size] });
    registerVisualStyle(this, { prepare: theme => ({ commit: () => {
      this.theme = theme; this.o.stroke = this.options.stroke ?? theme.icon.stroke;
      // Without an explicit colour an icon sits on a control body and takes the theme's ink for it.
      if (this.options.color === undefined) this.o.color = onCapColor(theme);
      this.set(this.icon, this.options.color === undefined ? this.o.color : this.color);
    }, discard() {} }) });
    this.mesh.raycast = () => {};
    this.add(this.mesh);
    this.set(icon);
    this.resources.capture(this);
    if (options.theme) this.setTheme(options.theme);
  }

  setTheme(theme: UiKitThemeSelection): void { if (resolveUiKitTheme(theme) !== this.theme) this.resources.setTheme(theme); }

  dispose(): void { this.resources.dispose(); this.removeFromParent(); }

  set(icon: IconNode, color = this.o.color): void {
    this.icon = icon; this.color = color;
    const c = this.canvas;
    c.width = c.height = PX;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, PX, PX);
    ctx.save();
    ctx.scale(PX / 24, PX / 24);
    ctx.strokeStyle = color;
    ctx.lineWidth = this.o.stroke;
    ctx.lineCap = this.theme.icon.lineCap;
    ctx.lineJoin = this.theme.icon.lineJoin;
    for (const [tag, a] of icon) {
      const n = (k: string) => Number(a[k] ?? 0);
      ctx.beginPath();
      if (tag === 'path') ctx.stroke(new Path2D(String(a.d)));
      else if (tag === 'circle') { ctx.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2); ctx.stroke(); }
      else if (tag === 'ellipse') { ctx.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2); ctx.stroke(); }
      else if (tag === 'line') { ctx.moveTo(n('x1'), n('y1')); ctx.lineTo(n('x2'), n('y2')); ctx.stroke(); }
      else if (tag === 'rect') { ctx.roundRect(n('x'), n('y'), n('width'), n('height'), n('rx')); ctx.stroke(); }
      else if (tag === 'polyline' || tag === 'polygon') {
        const pts = String(a.points).trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 1 < pts.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i], pts[i + 1]);
        if (tag === 'polygon') ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
    this.texture.needsUpdate = true;
  }
}
