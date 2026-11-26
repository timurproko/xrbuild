import assert from 'node:assert/strict';
import test from 'node:test';
import { mountProviderRecorder } from '../ui/hands-recorder.js';

test('recorder preserves its loss warning after export and owns asynchronous replay setup', async t => {
  const window = new EventTarget(), previous = ['addEventListener', 'confirm'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let confirmations = 0, downloads = 0, restored = 0;
  Object.assign(globalThis, { addEventListener: window.addEventListener.bind(window), confirm: () => { confirmations++; return false; } });
  t.after(() => { for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  const nodes = new Map<string, EventTarget & { hidden: boolean; disabled: boolean; textContent: string }>();
  for (const name of ['record', 'save', 'replay', 'import', 'file']) nodes.set(`[data-${name}]`, Object.assign(new EventTarget(), { hidden: false, disabled: false, textContent: '' }));
  const actions = { innerHTML: '', hidden: false, querySelector: (key: string) => nodes.get(key), replaceChildren() {}, ownerDocument: { createElement: () => ({ href: '', download: '', click() { downloads++; } }) } };
  const click = (name: string) => nodes.get(`[data-${name}]`)!.dispatchEvent(new Event('click'));
  const warn = () => { const event = new Event('beforeunload', { cancelable: true }); Object.defineProperty(event, 'returnValue', { value: '', writable: true }); window.dispatchEvent(event); return event.defaultPrevented; };
  let raw = (_: unknown) => {}, release = () => {};
  const lifecycle = new Set<(_: unknown) => void>();
  const producer = {
    recordingSource: () => ({ kind: 'xrbuild-hand-session', version: 1, source: { owner: 'workspace:test', id: 'test' }, sessionId: 'test', epoch: 'one', profile: { version: 1, offsetMm: { x: 0, y: 0, z: 0 }, sizeFactor: 1, appearance: {} }, frameSpace: 'panel-metres', processing: 'provider-published', globalAdjustmentsApplied: false, clockDomain: 'windows-qpc-ms', axes: 'x-right,y-up,z-viewer' }),
    subscribeRawFrames(fn: typeof raw) { raw = fn; return () => { raw = () => {}; }; },
    subscribeLifecycle(fn: (_: unknown) => void) { lifecycle.add(fn); return () => lifecycle.delete(fn); },
  };
  const view = { active: false, replaying: false, async setProfile(_: unknown, options: { mode: string }) { assert.equal(options.mode, 'replay'); return true; }, beginSession(options: { mode: string }) { assert.equal(options.mode, 'replay'); view.active = view.replaying = true; return true; }, clearSession() { view.active = view.replaying = false; } };
  type TestView = typeof view;
  const format = {
    validate(document: any) { assert.equal(document.kind, 'xrbuild-hand-session'); assert.equal(document.samples.length, 1); },
    async replay(document: any, { view }: { view: TestView }) {
      await new Promise<void>(resolve => { release = resolve; });
      await view.setProfile(document.profile, { mode: 'replay' }); view.beginSession({ mode: 'replay' });
      return () => view.clearSession();
    },
  };
  const recorder = mountProviderRecorder({ actions, status: { textContent: '' }, view, restoreProfile: () => { restored++; } });
  t.after(() => recorder.dispose()); recorder.connect({ producer, format });
  assert.equal(warn(), false); click('record');
  raw({ epoch: 'one', sequence: 1, captureTimeMs: 1, publishTimeMs: 2, packet: new Uint8Array([2, 2, 1]) });
  click('record'); assert.equal(warn(), true); click('save'); assert.equal(downloads, 1); assert.equal(warn(), true, 'download initiation is not durable-save confirmation');
  click('record'); assert.equal(confirmations, 1); assert.equal(nodes.get('[data-save]')!.hidden, false, 'cancelled replacement preserves the existing buffer');
  click('replay'); assert.equal(recorder.replaying, true); assert.equal(view.active, false); assert.equal(nodes.get('[data-replay]')!.disabled, true);
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(view.replaying, true); assert.equal(nodes.get('[data-replay]')!.disabled, false); click('replay');
  assert.equal(recorder.replaying, false); assert.equal(view.active, false); assert.equal(restored, 1); assert.equal(warn(), true);
  recorder.dispose(); assert.equal(lifecycle.size, 0); assert.equal(warn(), false);
});
