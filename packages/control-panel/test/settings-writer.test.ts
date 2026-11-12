import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SettingsWriter } from '../ui/settings-writer.js';

const clone = <T>(value: T): T => structuredClone(value);
test('serializes rapid choices, preserves unrelated fields and advances authoritative revisions', async () => {
  let current = { manifest: { name: 'Demo', inputs: [] as string[], display: 'desktop' }, manifestRevision: '0' };
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
  let writes = 0, concurrent = 0, max = 0;
  const writer = new SettingsWriter({ read: async () => clone(current), write: async (_id: string, manifest: any, revision: any) => {
    max = Math.max(max, ++concurrent); writes++;
    if (writes === 1) { entered(); await gate; }
    assert.equal(revision.manifestRevision, current.manifestRevision);
    current = { manifest: clone(manifest), manifestRevision: String(writes) }; concurrent--; return clone(current);
  } });
  const base = clone(current.manifest);
  const first = writer.enqueue('bundled:demo', base, { ...base, inputs: ['mouse'] });
  await started;
  writer.enqueue('bundled:demo', base, { ...base, inputs: ['mouse', 'keyboard'] });
  writer.enqueue('bundled:demo', base, { ...base, display: 'panel' });
  release(); await first;
  assert.deepEqual(current.manifest.inputs, ['mouse', 'keyboard']); assert.equal(current.manifest.display, 'panel');
  assert.equal(current.manifest.name, 'Demo'); assert.equal(max, 1); assert.equal(writer.entry('bundled:demo').error, null);
});

test('rebases only classified stale revisions; same-field conflicts stay pending for explicit retry or reload', async () => {
  let current: any = { manifest: { name: 'External name', inputs: [], plugins: { tracker: { unrelated: 5 } } }, manifestRevision: '1' };
  let calls = 0;
  const writer = new SettingsWriter({ read: async () => clone(current), write: async (_id: string, manifest: any) => {
    if (++calls === 1) { current.manifest.description = 'Another editor'; throw { status: 409, data: { details: { stale: 'manifest' } } }; }
    current = { manifest, manifestRevision: String(calls) }; return clone(current);
  } });
  await writer.enqueue('demo', { name: 'Old name', inputs: [], plugins: {} }, { name: 'Old name', inputs: ['mouse'], plugins: { tracker: { quality: 2 } } });
  assert.equal(current.manifest.name, 'External name'); assert.equal(current.manifest.description, 'Another editor');
  assert.deepEqual(current.manifest.plugins.tracker, { unrelated: 5, quality: 2 });
  const before = clone(current.manifest); current.manifest.inputs = ['keyboard'];
  await writer.enqueue('demo', before, { ...before, inputs: ['replay'] });
  assert.match(writer.entry('demo').error.message, /another editor/);
  assert.deepEqual(current.manifest.inputs, ['keyboard']); assert.deepEqual(writer.overlay('demo', current.manifest).inputs, ['replay']);
  await writer.retry('demo'); assert.deepEqual(current.manifest.inputs, ['replay']);
  current.manifest.inputs = ['simulated'];
  await writer.enqueue('demo', { ...current.manifest, inputs: [] }, { ...current.manifest, inputs: ['mouse'] });
  writer.discard('demo'); assert.deepEqual(writer.overlay('demo', current.manifest).inputs, ['simulated']);
});

test('pending overlay survives refresh and completion never leaks into another selected project', async () => {
  let release!: () => void;
  const gate = new Promise<void>(r => release = r), saved: string[] = [];
  const writer = new SettingsWriter({ read: async () => ({ manifest: { inputs: [], name: 'Authoritative' } }), write: async (_id: string, manifest: any) => { await gate; return { manifest }; }, saved: (id: string) => saved.push(id) });
  const pending = writer.enqueue('original', { inputs: [] }, { inputs: ['mouse'] });
  assert.deepEqual(writer.overlay('original', { name: 'SSE refresh', inputs: [] }), { name: 'SSE refresh', inputs: ['mouse'] });
  assert.deepEqual(writer.overlay('selected-next', { inputs: [] }), { inputs: [] });
  release(); await pending; assert.deepEqual(saved, ['original']);
});

test('busy, schema, validation and consent failures are not stale-retried; projects stay isolated', async () => {
  for (const error of [{ status: 409, data: { details: { needsConfirm: 'publication-route' } } }, { status: 409 }, { status: 400 }]) {
    let writes = 0;
    const writer = new SettingsWriter({ read: async () => ({ manifest: { inputs: [] } }), write: async () => { writes++; throw error; } });
    await writer.enqueue('one', { inputs: [] }, { inputs: ['mouse'] });
    assert.equal(writes, 1); assert.equal(writer.entry('one').error, error);
    assert.deepEqual(writer.overlay('two', { inputs: [] }), { inputs: [] });
  }
});
