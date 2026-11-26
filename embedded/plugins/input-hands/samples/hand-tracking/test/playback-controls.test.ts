import test from 'node:test';
import assert from 'node:assert/strict';
import { mountHandsTools } from '../browser.mjs';
import { recordingCsv } from '../src/live/recording/csv.ts';

class Element extends EventTarget {
  value = ''; files: File[] = []; textContent = ''; hidden = false; children: unknown[] = [];
  replaceChildren(...items: unknown[]) { this.children = items; }
  append(...items: unknown[]) { this.children.push(...items); }
  getContext() { return {}; }
  click() { this.dispatchEvent(new Event('click')); }
}
test('live playback-rate changes preserve elapsed CSV position in both directions and then use the new slope', async () => {
  const names = ['document', 'fetch', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'Option'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const fields = new Map<string, Element>();
  const field = (selector: string) => { if (!fields.has(selector)) fields.set(selector, new Element()); return fields.get(selector)!; };
  field('[data-speed]').value = '1';
  let clock = 0, nextId = 0; const frames = new Map<number, FrameRequestCallback>();
  const put = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  let controller: ReturnType<typeof mountHandsTools> | undefined;
  try {
    put('document', { createElement: () => new Element() }); put('Option', Element);
    put('fetch', async () => ({ ok: true, json: async () => ({ recordings: [] }) }));
    put('performance', { now: () => clock });
    put('requestAnimationFrame', (callback: FrameRequestCallback) => { const id = ++nextId; frames.set(id, callback); return id; });
    put('cancelAnimationFrame', (id: number) => frames.delete(id));
    const root = { innerHTML: '', querySelector: field, replaceChildren() {} };
    controller = mountHandsTools({ root, view: { active: false, showLegacyFrame() {}, clearLegacy() {} } });
    const csv = recordingCsv(Array.from({ length: 101 }, (_, i) => ({ timeMs: i * 100, space: 'camera-metric' as const, hands: [{ id: 7, handedness: null, joints: Array(21).fill(null) }] })), '2026-11-26T00:00:00Z');
    field('[data-file]').files = [new File([csv], 'ten-seconds.csv')]; field('[data-file]').dispatchEvent(new Event('change'));
    const flush = () => new Promise<void>(resolve => setImmediate(resolve));
    for (let i = 0; i < 20 && !field('[data-frame]').textContent.includes('0.00 s'); i++) await flush();
    assert.match(field('[data-frame]').textContent, /0\.00 s/);
    const speed = (value: number) => { field('[data-speed]').value = String(value); field('[data-speed]').dispatchEvent(new Event('change')); };
    const tick = async (now: number) => { clock = now; const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(now); await flush(); };
    speed(2); field('[data-play]').click(); await tick(1100);
    assert.match(field('[data-frame]').textContent, /2\.20 s/);
    speed(.5); await tick(1500);
    assert.match(field('[data-frame]').textContent, /2\.40 s/, 'slowing must not stall while a reinterpreted clock catches up');
    speed(2); await tick(1700);
    assert.match(field('[data-frame]').textContent, /2\.80 s/, 'speeding up must not multiply all earlier elapsed time and skip ahead');
    field('[data-play]').click(); speed(.5); await tick(2500);
    assert.match(field('[data-frame]').textContent, /2\.80 s/, 'changing speed while paused does not move the recording');
  } finally {
    controller?.dispose();
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
