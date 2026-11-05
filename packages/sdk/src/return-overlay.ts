import type { Interactor } from './interaction/core/interactor.ts';
import { appLaunchContext } from './launch-context.ts';
import type { ReturnControl } from './return-control.ts';

/** The bounded launcher page this app should return to, or null for a direct launch. */
export function returnTargetFromLaunch(href = typeof location === 'undefined' ? '' : location.href): string | null {
  return appLaunchContext(href)?.returnUrl ?? null;
}

let started = false;

/** Loads one SDK-owned control into the app's existing interaction runtime. */
export function loadReturnOverlay(interaction: Interactor, href?: string): Promise<ReturnControl | null> | null {
  const target = returnTargetFromLaunch(href);
  if (!target || started || typeof document === 'undefined') return null;
  started = true;
  return import('./return-control.ts').then(({ ReturnControl }) => new ReturnControl(target, interaction)).catch(() => null);
}
