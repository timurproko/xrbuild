import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HandMeshProcess } from '../src/hand-mesh-process.ts';
const supervisor = process.env.XRB_TEST_MESH_SUPERVISOR;
const childFile = fileURLToPath(new URL('./fixtures/mesh-process-child.mjs', import.meta.url));
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function dead(pid: number) {
  for (let i = 0; i < 300; i++) { try { process.kill(pid, 0); } catch { return; } await wait(10); }
  assert.fail(`Owned fixture ${pid} is still alive`);
}
for (const mode of ['tree', 'crash-tree', 'supervisor-loss']) test(`contained ${mode} drains direct child and grandchild`, { skip: !supervisor }, async t => {
  const args = ['a b', 'quote"value', 'backslash\\', ''];
  const p = await HandMeshProcess.start(supervisor, process.execPath, [childFile, mode === 'supervisor-loss' ? 'tree' : mode, ...args], path.dirname(childFile));
  t.after(() => p.stop());
  const [bytes] = await once(p.child.stdout, 'data'); const owned = JSON.parse(bytes.toString());
  assert.deepEqual(owned.args, args);
  if (mode === 'supervisor-loss') p.child.kill();
  else if (mode === 'crash-tree') p.child.stdin.write('crash');
  await p.stop(); await dead(owned.pid); await dead(owned.leaf);
});
test('supervisor forwards binary bytes unchanged and Stop is idempotent', { skip: !supervisor }, async () => {
  let created: HandMeshProcess | null = null;
  const p = await HandMeshProcess.start(supervisor, process.execPath, [childFile, 'echo'], path.dirname(childFile), () => false, owned => { created = owned; });
  assert.equal(created, p, 'ownership is bound at birth, before the awaited spawn returns');
  try {
    const bytes = Buffer.from([0, 255, 13, 10, 127, 0, 3]); const reply = once(p.child.stdout, 'data');
    p.child.stdin.write(bytes); assert.deepEqual((await reply)[0], bytes);
    await Promise.all([p.stop(), p.stop()]);
  } finally { await p.stop(); }
});
test('owner death ends an uncooperative contained grandchild tree', { skip: !supervisor }, async t => {
  const root = await fs.mkdtemp(path.join(process.env.XRB_TEST_ROOT ?? '.artifacts', 'mesh-parent-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const script = path.join(root, 'owner.mjs');
  await fs.writeFile(script, `import {HandMeshProcess} from ${JSON.stringify(new URL('../src/hand-mesh-process.ts', import.meta.url).href)};
    const p=await HandMeshProcess.start(${JSON.stringify(supervisor)},process.execPath,[${JSON.stringify(childFile)},'tree'],${JSON.stringify(root)});
    p.child.stdout.on('data',b=>process.stdout.write(b));`);
  const owner = spawn(process.execPath, [script], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { owner.kill(); });
  const [bytes] = await once(owner.stdout, 'data'); const pids = JSON.parse(bytes.toString());
  owner.kill(); await dead(pids.pid); await dead(pids.leaf);
});
test('cancelled spawn is refused before any child birth; missing containment fails closed', async () => {
  await assert.rejects(HandMeshProcess.start(undefined, process.execPath, [], process.cwd()), /containment unavailable/);
  if (supervisor) await assert.rejects(HandMeshProcess.start(supervisor, process.execPath, [], process.cwd(), () => true), /cancelled/);
});
