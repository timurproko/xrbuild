// Shared spatial UI feedback for SDK-owned controls and the UI library.
// Short synthesized clicks and a gliding tone share one volume/mute state and output.
// A quiet keep-awake signal avoids speaker power-saving clipping the next click;
// scheduling ahead and limiting retriggers keep playback stable during busy frames.
type Sound = 'press' | 'release' | 'on' | 'off' | 'step' | 'detent' | 'grab';

// All voices sit in the bright range the dial's detent uses (1.6-3 kHz): it carries on the display's speakers.
const VOICES: Record<Sound, { freq: number; ms: number; gain: number; type: OscillatorType }> = {
  press: { freq: 2000, ms: 40, gain: 0.35, type: 'triangle' },
  release: { freq: 1500, ms: 30, gain: 0.2, type: 'triangle' },
  on: { freq: 2400, ms: 50, gain: 0.32, type: 'triangle' },
  off: { freq: 1400, ms: 50, gain: 0.3, type: 'triangle' },
  step: { freq: 1800, ms: 40, gain: 0.26, type: 'triangle' },
  detent: { freq: 1600, ms: 14, gain: 0.1, type: 'triangle' },
  grab: { freq: 1300, ms: 35, gain: 0.25, type: 'triangle' },
};

const LOOKAHEAD_S = 0.012;
const RETRIGGER_MS = 30;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = 1;
let muted = false;
const lastPlayed = new Map<Sound, number>();

function context(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' });
    } catch (e) {
      console.warn(`[sound] no audio: ${e}`);
      return null;
    }
    const c = ctx;
    // Logged so the host log shows whether audio started ('[page] [sound] ...').
    c.onstatechange = () => {
      console.log(`[sound] audio ${c.state}, ${c.sampleRate} Hz`);
      if (c.state === 'running') output(c);
    };
  }
  if (ctx.state === 'suspended') ctx.resume().catch((e) => console.warn(`[sound] resume failed: ${e}`));
  return ctx;
}
// Do not open an audio device just by importing the SDK. Unlock on the first real gesture,
// before controls handle it; native hand interaction can also initialize audio through play().
for (const type of ['pointerdown', 'keydown'] as const) globalThis.addEventListener?.(type, () => context(), { capture: true });

/** Master gain -> speakers, plus the keep-awake signal; built once the context runs. */
function output(c: AudioContext): GainNode {
  if (master) return master;
  master = c.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(c.destination);
  // Keep-awake: 2 s of white noise at -80 dBFS, looped, straight to the output (not muted with the
  // UI, so the amp stays awake through a mute too). Inaudible, but not digital silence.
  const n = c.sampleRate * 2;
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 1e-4;
  const keep = c.createBufferSource();
  keep.buffer = buf;
  keep.loop = true;
  keep.connect(c.destination);
  keep.start();
  return master;
}

function running(): AudioContext | null {
  if (muted) return null;
  const c = context();
  return c && c.state === 'running' ? c : null;
}

/** Pitch multiplier for a value 0..1: one octave from bottom to top, so a value is heard as a height. */
export function pitchOf(value: number): number {
  return 2 ** Math.min(1, Math.max(0, value));
}

/** One click. `pitch` multiplies the voice's frequency (see pitchOf). */
export function play(sound: Sound, pitch = 1): void {
  if (muted) return;
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') {
    void c.resume().then(() => { if (c.state === 'running') play(sound, pitch); }, () => {});
    return;
  }
  if (c.state !== 'running') return;
  const nowMs = performance.now();
  if (nowMs - (lastPlayed.get(sound) ?? -Infinity) < RETRIGGER_MS) return;
  lastPlayed.set(sound, nowMs);
  const v = VOICES[sound];
  const t = c.currentTime + LOOKAHEAD_S;
  const end = t + v.ms / 1000;
  const freq = v.freq * pitch;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = v.type;
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.7, end);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(v.gain, t + 0.002);  // 2 ms attack: no click from a hard start
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain).connect(output(c));
  osc.start(t);
  osc.stop(end + 0.01);
}

/**
 * A soft continuous tone for smooth controls: while held, its pitch follows the value and its
 * loudness follows how fast the value moves (capped), so a slow drag hums quietly and a still handle is silent.
 */
export class Glide {
  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private last: number | null = null;
  private readonly baseHz: number;

  constructor(baseHz = 330) {
    this.baseHz = baseHz;
  }

  start(value: number): void {
    const c = running();
    if (!c || this.osc) return;
    const t = c.currentTime + LOOKAHEAD_S;
    this.osc = c.createOscillator();
    this.osc.type = 'triangle';
    this.osc.frequency.setValueAtTime(this.baseHz * pitchOf(value), t);
    // Low-pass the triangle: a round hum, not a buzz.
    const lowpass = c.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1400;
    this.gain = c.createGain();
    this.gain.gain.setValueAtTime(0, t);
    this.osc.connect(lowpass).connect(this.gain).connect(output(c));
    this.osc.start(t);
    this.last = value;
  }

  /** Per frame while held. */
  update(value: number, dt: number): void {
    if (!this.osc || !this.gain || !ctx || dt <= 0) return;
    const speed = Math.abs(value - (this.last ?? value)) / dt;  // full range per second
    this.last = value;
    const t = ctx.currentTime;
    this.osc.frequency.setTargetAtTime(this.baseHz * pitchOf(value), t, 0.03);
    // Smooth both ways (no jumps when the speed estimate is noisy), capped well below the clicks.
    this.gain.gain.setTargetAtTime(Math.min(0.12, speed * 0.15), t, 0.06);
  }

  stop(): void {
    if (!this.osc || !this.gain || !ctx) return;
    const t = ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, 0.04);
    this.osc.stop(t + 0.3);
    this.osc = this.gain = null;
    this.last = null;
  }
}

export function setMuted(v: boolean): void {
  muted = v;
  if (master && ctx) master.gain.setTargetAtTime(v ? 0 : volume, ctx.currentTime, 0.01);
}

/** Overall UI volume 0..1 (default 1). */
export function setVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  if (master && ctx && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
}
