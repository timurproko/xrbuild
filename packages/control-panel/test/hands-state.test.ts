import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readHandsState, saveHandsState, selectedHandProvider, resolveHandInput, prepareHandInput } from '../src/hands-state.ts';
import type { HandRegistry, HandProvider } from '../src/hand-providers.ts';
const real: HandProvider = { owner: 'workspace:example', id: 'tracker', label: 'Example', transport: 'native', runtimeName: 'tracker', purpose: 'tracked', available: true, reason: 'Not started', aliases: [] };
const registry = (providers = [real]): HandRegistry => ({ providers, revision: 'fixture', problems: [] });
async function fixture(fn: (core: string, workspace: string) => Promise<void>) {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? os.tmpdir(), 'hands-state-'));
  try { await fn(path.join(root, 'core'), path.join(root, 'workspace')); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('Hands reads are passive; exactly one real provider is the initial default, never synthetic/replay', async () => fixture(async (core, workspace) => {
  const state = await readHandsState(core, workspace);
  assert.equal(state.exists, false);
  await assert.rejects(fs.stat(workspace), /ENOENT/);
  assert.deepEqual(selectedHandProvider(state, registry(), 'native').key, { owner: real.owner, id: real.id });
  for (const providers of [[], [real, { ...real, id: 'other' }], [{ ...real, purpose: 'synthetic' as const }], [{ ...real, purpose: 'replay' as const }]]) {
    assert.equal(selectedHandProvider(state, registry(providers), 'native').key, null);
    assert.throws(() => resolveHandInput(['hand'], state, registry(providers), 'native'), /requires a provider choice/);
  }
  const resolved = resolveHandInput(['mouse', 'old-source', 'another'], state, registry(), 'native');
  assert.deepEqual(resolved.inputs, ['mouse', 'tracker']);
  assert.deepEqual(resolveHandInput(['keyboard'], state, registry(), 'native').policy, 'off');
}));

test('explicit preparation pins unique default; changing availability never replaces a choice', async () => fixture(async (core, workspace) => {
  await prepareHandInput(core, workspace, registry(), ['hand'], 'native');
  const state = await readHandsState(core, workspace);
  assert.equal(state.exists, true);
  const other = { ...real, id: 'other', runtimeName: 'other' };
  assert.throws(() => resolveHandInput(['hand'], state, registry([other]), 'native'), /is missing/);
  assert.throws(() => resolveHandInput(['hand'], state, registry([{ ...real, available: false, reason: 'failed' }, other]), 'native'), /failed/);
  assert.throws(() => resolveHandInput(['hand'], state, registry(), 'webxr'), /incompatible/);
  assert.equal((await readHandsState(core, workspace)).revision, state.revision);
}));

test('Hands writes preserve unknown data, require revisions and reject unsafe/foreign/malformed state', async () => fixture(async (core, workspace) => {
  const absent = await readHandsState(core, workspace);
  await saveHandsState(core, workspace, null, absent.revision);
  const file = path.join(workspace, 'config/hands/profile.json');
  const raw = JSON.parse(await fs.readFile(file, 'utf8')); raw.future = { retained: true };
  await fs.writeFile(file, JSON.stringify(raw));
  const state = await readHandsState(core, workspace);
  await saveHandsState(core, workspace, { owner: real.owner, id: real.id }, state.revision);
  assert.deepEqual((await readHandsState(core, workspace)).raw.future, { retained: true });
  await assert.rejects(saveHandsState(core, workspace, null, state.revision), /changed/);
  await fs.writeFile(`${file}.lock`, 'fixture');
  await assert.rejects(saveHandsState(core, workspace, null, (await readHandsState(core, workspace)).revision), /lock exists/);
  await fs.unlink(`${file}.lock`);
  for (const bytes of ['{broken', 'x'.repeat(17000), JSON.stringify({ ...raw, scope: 'foreign' })]) {
    await fs.writeFile(file, bytes);
    await assert.rejects(readHandsState(core, workspace));
    assert.equal(await fs.readFile(file, 'utf8'), bytes);
  }
  await fs.writeFile(file, JSON.stringify(raw));
  await fs.link(file, `${file}.other`);
  await assert.rejects(readHandsState(core, workspace), /link/);
}));
