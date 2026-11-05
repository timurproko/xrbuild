// What the native host injects before any page script runs (native/host/src/host_info.cpp).
// Absent in a normal browser: the SDK then falls back to emulation.

export interface DisplayInfo {
  /** active panel area in metres */
  widthM: number;
  heightM: number;
  /** panel tilt (radians, leaning back from vertical) */
  tiltRad: number;
  pixelsW: number;
  pixelsH: number;
}

export interface HostInfo {
  version: number;
  /** Current native presentation mode; absent on older hosts. */
  fullscreen?: boolean;
  mouseEnabled?: boolean;
  /** Page-scoped native shell bridge; the host rejects non-fullscreen close requests. */
  requestClose?(): void;
  setCursorStyle?(style: 'system' | 'ring' | 'ring-dot'): void;
  /** true: the page is 2 x eye.width wide, left eye in the left half (the view at start-up; see Xrb.stereo for the live value) */
  stereo: boolean;
  /** the display has a switchable session: the view can switch between 2D and 3D while the app runs (absent in older hosts) */
  switchable?: boolean;
  display: DisplayInfo;
  eye: { width: number; height: number };
  channel: { url: string };
  /** station runtime at start (absent in older hosts); live parameters: Xrb.platform */
  platform?: { name: string; params: Record<string, unknown> };
  /** host clock in ms: the clock of every timestamp on the channel */
  hostNow(): number;
}

/** ELF-SR2 as measured on the dev rig (GetDisplaySpec); used when no host is present. */
export const DEFAULT_DISPLAY: DisplayInfo = {
  widthM: 0.596736,
  heightM: 0.335664,
  tiltRad: Math.PI / 4,
  pixelsW: 1920,
  pixelsH: 1080,
};

export function getHostInfo(): HostInfo | null {
  const g = globalThis as { __XRB_HOST__?: HostInfo };
  return g.__XRB_HOST__ ?? null;
}
