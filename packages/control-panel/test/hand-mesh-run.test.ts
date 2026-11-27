import assert from 'node:assert/strict';
import { test as baseTest, type TestContext } from 'node:test';
const test = (name: string, fn: (t: TestContext) => unknown) => baseTest(name, { skip: !process.env.XRB_TEST_MESH_SUPERVISOR }, fn);
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HandMeshRun } from '../src/hand-mesh-run.ts';
import { handMeshDeclaration } from '../src/hand-mesh-contract.ts';
import { decodeMeshResult, type MeshFrame } from '../../sdk/src/hand-mesh-protocol.ts';
const fixture = fileURLToPath(new URL('./fixtures/hand-mesh-sidecar.mjs', import.meta.url));
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const frame = (sequence = 0, epoch = 'consumer'): MeshFrame => ({ type: 'frame', epoch, sequence, revision: 0, sentMs: performance.now(), sampleMs: performance.now() + 8,
  hands: [0, 1].map(id => ({ id, handedness: id ? 'left' : 'right', keypoints: Array.from({ length: 21 }, (_, i) => [i / 1000, .1, 0]) })) });
const plugin = (mode = 'normal', delay = 0, vertices = 2859) => ({ owner: 'workspace:fixture', id: 'mesh', label: 'Fixture', available: true, reason: 'Installed', program: process.execPath,
  declaration: handMeshDeclaration({ version: 1, id: 'mesh', label: 'Fixture', program: 'runtime.exe', args: [fixture], settingsVersion: 1, settings: [
    { key: 'mode', label: 'Mode', type: 'select', default: mode, options: ['normal', 'crash', 'wrong-epoch', 'malformed'].map(value => ({ value, label: value })) },
    { key: 'delay', label: 'Delay', type: 'number', min: 0, max: 500, default: delay },
    { key: 'vertices', label: 'Vertices', type: 'number', min: 3, max: 2859, default: vertices },
  ] }) });
async function start(t: any, mode = 'normal', delay = 0, timings: { startupMs?: number; connectMs?: number } = {}) {
  const run = new HandMeshRun(() => ['https://app.local'], () => {}, { ...timings, supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }); t.after(() => run.stop());
  const descriptor = await run.start(plugin(mode, delay), {});
  const request = (route: string, body = frame(), token = descriptor.token, origin = 'https://app.local') => fetch(descriptor.url + route, { method: 'POST', headers: { origin, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  for (let i = 0; i < 200 && run.status === 'Starting'; i++) await wait(10);
  assert.match(run.status, /Ready/);
  return { run, request, descriptor };
}
test('actual sidecar carries two mid-detail hands, rejects foreign access and cleans up', async t => {
  const f = await start(t);
  assert.equal((await f.request('/connect', frame(), '0'.repeat(64))).status, 403);
  assert.equal((await f.request('/connect', frame(), f.descriptor.token, 'https://foreign.test')).status, 403);
  assert.equal((await f.request('/connect')).status, 204);
  let result;
  for (let i = 1; i < 10; i++) {
    const response = await f.request('/frame', frame(i));
    if (response.status === 200) { result = decodeMeshResult(new Uint8Array(await response.arrayBuffer())); break; }
  }
  assert.ok(result); assert.equal(result.meshes.length, 2);
  for (const mesh of result.meshes) { assert.equal(mesh.positions.length, 2859 * 3); assert.equal(mesh.indices.length, 5692 * 3); }
  assert.equal((await f.request('/connect', frame(0, 'replacement'))).status, 204);
  assert.equal((await f.request('/frame', frame(20))).status, 409);
  assert.equal((await f.request('/connect', frame())).status, 409);
  await f.run.stop(); await assert.rejects(fetch(f.descriptor.url));
});
test('slow sidecar never blocks a request indefinitely and pending work is newest-only', async t => {
  const f = await start(t, 'normal', 120); await f.request('/connect');
  const a = f.request('/frame', frame(1)); await wait(5);
  const b = f.request('/frame', frame(2)); await wait(5);
  const c = f.request('/frame', frame(3));
  assert.equal((await b).status, 204); // Superseded pending response is released immediately.
  assert.equal((await a).status, 204); assert.equal((await c).status, 204);
  assert.match(f.run.status, /late/);
});
test('missing runtime and an old client degrade without making startup wait', async t => {
  const missing = new HandMeshRun(() => ['https://app.local'], () => {}, { supervisor: process.env.XRB_TEST_MESH_SUPERVISOR }); t.after(() => missing.stop());
  const descriptor = await missing.start({ ...plugin(), program: fixture + '.not-installed' }, {});
  assert.ok(descriptor.token);
  for (let i = 0; i < 100 && !missing.status.startsWith('Skeleton fallback'); i++) await wait(10);
  assert.match(missing.status, /Skeleton fallback/); await missing.stop();
  const old = await start(t, 'normal', 0, { connectMs: 50 });
  old.run.appStarted(); await wait(80);
  assert.match(old.run.status, /rebuild\/relaunch/);
});
test('unattached startup remains bounded even without an owning app-start signal', async t => {
  const f = await start(t, 'normal', 0, { startupMs: 1500 });
  for (let i = 0; i < 200 && !f.run.status.startsWith('Skeleton fallback'); i++) await wait(10);
  assert.match(f.run.status, /app startup timeout/);
  await assert.rejects(f.request('/connect'));
});
test('owner process death closes the private pipe and the real child exits', async t => {
  const parent = path.resolve(process.env.XRB_TEST_ROOT ?? '.artifacts'); await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'mesh-owner-')); let childPid = 0;
  const script = path.join(root, 'owner.mjs');
  await fs.writeFile(script, `import {HandMeshRun} from ${JSON.stringify(new URL('../src/hand-mesh-run.ts', import.meta.url).href)};
    const run = new HandMeshRun(()=>['https://app.local'],()=>{}, {supervisor:${JSON.stringify(process.env.XRB_TEST_MESH_SUPERVISOR)}}); await run.start(${JSON.stringify(plugin('normal', 0, 3))}, {});
    while (!run.stage?.owned?.pid) await new Promise(resolve=>setTimeout(resolve,10));
    console.log(run.stage.owned.pid);`);
  const owner = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(async () => { owner.kill(); if (childPid) { try { process.kill(childPid); } catch {} } await fs.rm(root, { recursive: true, force: true }); });
  childPid = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('owner startup timeout')), 5000);
    owner.stdout.once('data', bytes => { clearTimeout(timer); resolve(Number(bytes.toString().trim())); });
    owner.once('error', reject);
  });
  assert.ok(childPid > 0); owner.kill();
  let alive = true;
  for (let i = 0; i < 200; i++) { try { process.kill(childPid, 0); } catch { alive = false; break; } await wait(10); }
  assert.equal(alive, false); childPid = 0;
});
for (const mode of ['crash', 'wrong-epoch', 'malformed']) test(`${mode} sidecar fails mesh only`, async t => {
  const f = await start(t, mode); await f.request('/connect');
  const response = await f.request('/frame', frame(1)).catch(() => null);
  if (response) assert.notEqual(response.status, 200);
  for (let i = 0; i < 100 && !f.run.status.startsWith('Skeleton fallback'); i++) await wait(10);
  assert.match(f.run.status, /Skeleton fallback/); await f.run.stop();
});
