import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { Panel } from '../src/panel.ts';
import { readHandsState, writeHandsState } from '../src/hands-state.ts';
import { portableHostConfig } from '../src/package-content.ts';
import { handPolicyDocument } from '../src/hand-policy-document.ts';

test('saved optional mesh choice does not block preview/publication/offline profiles or leak run metadata', async t => {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'mesh-context-')), core = path.join(root, 'core'), workspace = path.join(root, 'user');
  await fs.mkdir(core); const panel = new Panel(core, workspace, { send() {} } as any);
  t.after(async () => { await panel.dispose(); await fs.rm(root, { recursive: true, force: true }); });
  const missing = { version: 1, selected: { owner: 'workspace:removed', id: 'surface' }, settings: {} };
  await writeHandsState(core, workspace, (await readHandsState(core, workspace)).revision, () => ({ provider: { owner: 'core', id: 'webxr' }, postprocessing: missing }));
  panel.nativeProviders = async () => ({ providers: [], rejected: [], error: null });
  assert.equal(await panel.browserHandPolicy({ name: 'Example', kind: 'app', inputs: ['hand'] }), 'webxr');
  const state = await readHandsState(core, workspace);
  const document = handPolicyDocument('<html><head></head></html>', 'webxr', state.profile);
  assert.ok(!/postprocessing|handMeshRuntime|removed|token/.test(document));
  const selection = { input: 'simulated', inputs: ['simulated'], display: 'desktop', platform: '', handProfile: state.profile,
    handMeshRuntime: { version: 1, url: 'http://127.0.0.1:10000', token: 'a'.repeat(64) } };
  const config = portableHostConfig({ plugins: [], selection, config: { ...selection, plugins: {} } });
  assert.ok(!/handMeshRuntime|10000|token/.test(JSON.stringify(config)));
  assert.deepEqual((await readHandsState(core, workspace)).raw.postprocessing, missing, 'excluded contexts never erase selection');
});
