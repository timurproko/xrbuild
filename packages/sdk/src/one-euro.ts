// One Euro filter (Casiez et al. 2012): low jitter when still, low lag when moving.
// Also exposes the filtered velocity, used to predict positions to display time.

export interface OneEuroParams {
  /** Hz; lower = smoother at rest */
  minCutoff: number;
  /** how quickly the cutoff rises with speed (per unit/s) */
  beta: number;
  /** Hz; cutoff for the velocity estimate */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.5, beta: 4.0, dCutoff: 1.0 };

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  value = 0;
  /** filtered derivative, units per second */
  velocity = 0;
  private lastT = -1;
  private readonly p: OneEuroParams;

  constructor(params: OneEuroParams = DEFAULT_ONE_EURO) {
    this.p = params;
  }

  /** t in milliseconds */
  filter(x: number, tMs: number): number {
    if (this.lastT < 0) {
      this.value = x;
      this.velocity = 0;
      this.lastT = tMs;
      return x;
    }
    const dt = Math.max((tMs - this.lastT) / 1000, 1e-4);
    this.lastT = tMs;
    const dx = (x - this.value) / dt;
    this.velocity += alpha(this.p.dCutoff, dt) * (dx - this.velocity);
    const cutoff = this.p.minCutoff + this.p.beta * Math.abs(this.velocity);
    this.value += alpha(cutoff, dt) * (x - this.value);
    return this.value;
  }
}
