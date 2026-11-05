/** Shared finite cursor policy; usable by launchers without constructing a renderer. */
export const CURSOR_STYLES = ['system', 'ring', 'ring-dot'] as const;
export type CursorStyle = typeof CURSOR_STYLES[number];
export const DEFAULT_CURSOR_STYLE: CursorStyle = 'ring-dot';
export function isCursorStyle(value: unknown): value is CursorStyle {
  return (CURSOR_STYLES as readonly unknown[]).includes(value);
}
export function resolveCursorStyle(value: unknown): CursorStyle {
  return isCursorStyle(value) ? value : DEFAULT_CURSOR_STYLE;
}
