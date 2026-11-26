import { HandInput } from './hands.ts';
import type { HandsMessage } from './protocol.ts';

export type HandSourcePolicy = 'off' | 'native' | 'webxr';
export function handSourcePolicy(hosted: boolean, search = '', bundled?: unknown): HandSourcePolicy {
  const query = new URLSearchParams(search).get('xrb-hand');
  const value = bundled ?? query;
  return value === 'off' || value === 'native' || value === 'webxr' ? value : hosted ? 'native' : 'webxr';
}
/** The single canonical-frame extension point. Identity until a separately delivered Hands layer is configured.
 * Optional native gestures/palm, confidence, clocks and capability masks must remain intact.
 */
export function prepareHandFrame(frame: HandsMessage): HandsMessage { return frame; }

export class HandFrameIngress {
  generation = 0;
  private closed = false;
  private readonly input: HandInput;
  readonly policy: HandSourcePolicy;
  constructor(input: HandInput, policy: HandSourcePolicy) { this.input = input; this.policy = policy; }
  push(source: 'native' | 'webxr', frame: HandsMessage, capturePageMs: number, generation = this.generation): boolean {
    if (this.closed || source !== this.policy || generation !== this.generation) return false;
    this.input.push(prepareHandFrame(frame), capturePageMs);
    return true;
  }
  reset(now = performance.now()): void { this.generation++; this.input.reset(now); }
  close(now = performance.now()): void { this.closed = true; this.reset(now); }
}
