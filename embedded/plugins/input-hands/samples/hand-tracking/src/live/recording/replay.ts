import type { Clip } from './format.ts';
/** Recording-relative clock, no interpolation and no coupling to capture/page clock origins. */
export class Playback {
  index = 0; positionMs = 0; playing = false; speed = 1;
  private anchorPage = 0; private anchorPosition = 0;
  readonly times: readonly number[];
  constructor(times: readonly number[]) {
    if (!times.length || times[0] !== 0 || times.some((v,i) => !Number.isFinite(v) || v < 0 || (i > 0 && v <= times[i-1]))) throw new Error('Invalid playback timeline');
    this.times = Object.freeze([...times]);
  }
  get durationMs(): number { return this.times[this.times.length-1]; }
  private locate(position: number): void {
    this.positionMs = Math.max(0,Math.min(this.durationMs,position));
    let low = 0, high = this.times.length;
    while (low + 1 < high) { const mid = (low+high) >>> 1; if (this.times[mid] <= this.positionMs) low = mid; else high = mid; }
    this.index = low;
  }
  play(now: number): void { if (this.positionMs >= this.durationMs) this.locate(0); this.anchorPage = now; this.anchorPosition = this.positionMs; this.playing = this.durationMs > 0; }
  tick(now: number): void {
    if (!this.playing) return;
    this.locate(this.anchorPosition + Math.max(0,now-this.anchorPage) * this.speed);
    if (this.positionMs >= this.durationMs) this.playing = false;
  }
  pause(now: number): void { this.tick(now); this.playing = false; }
  seek(position: number, now: number): void { if (!Number.isFinite(position)) throw new Error('Invalid seek'); this.locate(position); this.anchorPosition = this.positionMs; this.anchorPage = now; }
  step(delta: number): void { this.playing = false; this.index = Math.max(0,Math.min(this.times.length-1,this.index+Math.sign(delta))); this.positionMs = this.times[this.index]; }
  setSpeed(speed: number, now: number): void { if (![0.25,0.5,1,2,4].includes(speed)) throw new Error('Invalid playback speed'); this.tick(now); this.speed = speed; this.anchorPosition = this.positionMs; this.anchorPage = now; }
}
/** One decode in flight, one latest desired frame; stale results are closed, never displayed. */
export class ReplayImages {
  private generation = 0;
  private busy = false;
  private desired = -1;
  private displayed = -1;
  private clip: Clip | null = null;
  private readonly decode: (blob: Blob) => Promise<ImageBitmap>;
  private readonly show: (index: number, bitmap: ImageBitmap) => void;
  private readonly error: (error: unknown) => void;
  constructor(decode: (blob: Blob) => Promise<ImageBitmap>, show: (index: number, bitmap: ImageBitmap) => void, error: (error: unknown) => void) { this.decode = decode; this.show = show; this.error = error; }
  setClip(clip: Clip | null): void { ++this.generation; this.clip = clip; this.desired = this.displayed = -1; }
  request(index: number): void { this.desired = index; this.drain(); }
  invalidate(): void { this.displayed = -1; }
  snapshot() { return { inFlight: this.busy ? 1 : 0, displayed: this.displayed }; }
  private drain(): void {
    const clip = this.clip, index = this.desired, generation = this.generation;
    if (this.busy || !clip || index < 0 || index >= clip.frames.length || index === this.displayed) return;
    this.busy = true;
    void this.decode(clip.frames[index].png).then(bitmap => {
      try { if (generation === this.generation && index === this.desired) { this.show(index,bitmap); this.displayed = index; } }
      finally { bitmap.close(); }
    }).catch(error => { if (generation === this.generation) { this.displayed = index; this.error(error); } })
      .finally(() => { this.busy = false; this.drain(); });
  }
}
