import * as THREE from 'three';
import { material, roundedBox } from './theme.ts';
import { VisualResources } from './resources.ts';
import { defaultTheme, registerVisualStyle, resolveUiKitTheme, styleMesh, type ThemeOptions, type UiKitThemeSelection } from './visual-theme.ts';

export interface BoardOptions extends ThemeOptions { width: number; height: number; depth?: number; radius?: number; color?: THREE.ColorRepresentation; material?: THREE.MeshStandardMaterialParameters }
export class Board extends THREE.Group {
  private readonly resources = new VisualResources();
  private theme = defaultTheme;
  get themeId(): string { return this.theme.id; }
  constructor(options: BoardOptions) {
    super();
    const d = options.depth ?? 0.006, r = options.radius ?? 0.014;
    this.add(styleMesh(new THREE.Mesh(roundedBox(options.width, options.height, d, r), material(options.color ?? '#1c222b', { roughness: 0.72, metalness: 0.03, ...options.material })), 'board', { shape: 'box', args: [options.width, options.height, d, r] }));
    registerVisualStyle(this, { prepare: theme => ({ commit: () => { this.theme = theme; }, discard() {} }) });
    this.resources.capture(this, false);
    if (options.theme) this.setTheme(options.theme);
  }
  setTheme(theme: UiKitThemeSelection): void { if (resolveUiKitTheme(theme) !== this.theme) this.resources.setTheme(theme); }
  dispose(): void { this.resources.dispose(); this.removeFromParent(); }
}
