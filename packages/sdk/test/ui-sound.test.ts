import assert from 'node:assert/strict';
import { test } from 'node:test';
import { play, setMuted, setVolume } from '../src/ui-sound.ts';

test('dialog-close voice uses the shared envelope, gain, mute and volume', () => {
  const original = globalThis.AudioContext;
  const frequencies: Array<[number, number]> = [];
  const gains: number[] = [];
  const stops: number[] = [];
  const masterChanges: number[] = [];
  let oscillators = 0;
  const param = () => ({ value: 0, setValueAtTime(value: number) { gains.push(value); }, exponentialRampToValueAtTime(value: number) { gains.push(value); }, setTargetAtTime(value: number) { masterChanges.push(value); } });
  const node = () => ({ gain: param(), connect() { return this; } });
  class Audio {
    state = 'running'; currentTime = 1; sampleRate = 32; destination = {};
    createGain() { return node(); }
    createBuffer() { return { getChannelData: () => new Float32Array(64) }; }
    createBufferSource() { return { connect() {}, start() {}, loop: false }; }
    createOscillator() {
      oscillators++;
      return { type: '', frequency: { setValueAtTime(value: number, time: number) { frequencies.push([value, time]); }, exponentialRampToValueAtTime() {} }, connect() { return node(); }, start() {}, stop(time: number) { stops.push(time); } };
    }
  }
  globalThis.AudioContext = Audio as unknown as typeof AudioContext;
  try {
    play('off');
    assert.deepEqual(frequencies, [[1400, 1.012]]);
    assert.ok(gains.includes(0.3), 'same close voice gain as the library dialog');
    assert.ok(Math.abs(stops[0] - 1.072) < 1e-9, '50ms voice plus stop tail');
    setMuted(true);
    play('press');
    assert.equal(oscillators, 1);
    setVolume(0.4);
    setMuted(false);
    assert.equal(masterChanges.at(-1), 0.4);
  } finally { globalThis.AudioContext = original; setMuted(false); setVolume(1); }
});
