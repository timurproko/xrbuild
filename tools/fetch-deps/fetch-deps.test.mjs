import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { syncSources, HashMismatchError } from './fetch-deps.mjs';

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-deps-'));
  const src = path.join(dir, 'src');
  await fs.mkdir(path.join(src, 'models', 'sub'), { recursive: true });
  await fs.writeFile(path.join(src, 'a.dll'), 'binary-a');
  await fs.writeFile(path.join(src, 'models', 'm.onnx'), 'model');
  await fs.writeFile(path.join(src, 'models', 'sub', 'n.onnx'), 'model-n');
  await fs.writeFile(path.join(src, 'models', 'm.onnx.meta'), 'editor meta, ignored');
  const sources = [
    { id: 'a', kind: 'file', from: path.join(src, 'a.dll'), dest: 'x/a.dll' },
    { id: 'models', kind: 'dir', from: path.join(src, 'models'), dest: 'x/models' },
  ];
  return { dir, src, root: path.join(dir, 'third_party'), sources };
}

test('pins, installs and re-verifies a clean tree', async () => {
  const { root, sources } = await fixture();
  const lock = {};
  await syncSources(sources, { root, lock, updateLock: true });
  assert.deepEqual(Object.keys(lock).sort(), ['x/a.dll', 'x/models/m.onnx', 'x/models/sub/n.onnx']);
  assert.equal(await fs.readFile(path.join(root, 'x/models/sub/n.onnx'), 'utf8'), 'model-n');

  const summary = await syncSources(sources, { root, lock });
  assert.deepEqual(summary.a, { kept: 1 });
});

test('a tampered source fails the hash check and is not installed', async () => {
  const { src, root, sources } = await fixture();
  const lock = {};
  await syncSources(sources, { root, lock, updateLock: true });
  await fs.rm(root, { recursive: true });

  await fs.writeFile(path.join(src, 'a.dll'), 'binary-a-TAMPERED');
  await assert.rejects(syncSources(sources, { root, lock }), HashMismatchError);
  await assert.rejects(fs.access(path.join(root, 'x/a.dll')));
});

test('a tampered installed file is replaced from the good source', async () => {
  const { root, sources } = await fixture();
  const lock = {};
  await syncSources(sources, { root, lock, updateLock: true });
  await fs.writeFile(path.join(root, 'x/a.dll'), 'corrupted');
  const summary = await syncSources(sources, { root, lock });
  assert.deepEqual(summary.a, { copied: 1 });
  assert.equal(await fs.readFile(path.join(root, 'x/a.dll'), 'utf8'), 'binary-a');
});

test('an unpinned file is rejected without --update-lock', async () => {
  const { root, sources } = await fixture();
  await assert.rejects(syncSources(sources, { root, lock: {} }), /no pinned hash/);
});

test('plugin paths: XRB_<NAME> overrides the deps.json default, which may use other variables', async () => {
  const { expandVars } = await import('./fetch-deps.mjs');
  const vars = { SDK: '${GIT}/sdk', DATA: '${SDK}/data' };
  assert.equal(expandVars('${DATA}/a.dll', vars, {}), 'D:/Git/sdk/data/a.dll');
  assert.equal(expandVars('${DATA}/a.dll', vars, { XRB_GIT_ROOT: 'E:/src' }), 'E:/src/sdk/data/a.dll');
  assert.equal(expandVars('${DATA}/a.dll', vars, { XRB_SDK: 'F:/sdk' }), 'F:/sdk/data/a.dll');
  assert.throws(() => expandVars('${NOPE}/x', vars, {}), /XRB_NOPE/);
  assert.throws(() => expandVars('${A}', { A: '${B}', B: '${A}' }, {}), /loop/);
});

test('groups: the core alone, or the workspace plugins with a deps.json (or the named ones), each with its own lock', async () => {
  const { depGroups } = await import('./fetch-deps.mjs');
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-deps-repo-'));
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-deps-ws-'));
  const deps = (name, from) => fs.mkdir(path.join(ws, 'plugins', name), { recursive: true })
    .then(() => fs.writeFile(path.join(ws, 'plugins', name, 'deps.json'), JSON.stringify({ vars: { ROOT: '${GIT}/r' }, sources: [{ id: name, kind: 'file', from, dest: `${name}/x.dll` }] })));
  await deps('display-test', '${ROOT}/d.dll');
  await deps('input-test', '${ROOT}/i.dll');
  await fs.mkdir(path.join(ws, 'plugins', 'no-deps'), { recursive: true });
  const core = [{ id: 'core', kind: 'file', from: 'c', dest: 'c' }];

  const plain = await depGroups(repo, core, {}, {});
  assert.deepEqual(plain.map((g) => [g.name, g.root]), [['core', path.join(repo, 'third_party')]], 'plain: the core only');
  const all = await depGroups(repo, core, { workspace: ws }, {});
  assert.deepEqual(all.map((g) => g.name), ['display-test', 'input-test']);
  assert.equal(all[0].sources[0].from, 'D:/Git/r/d.dll');
  assert.equal(all[1].lockPath, path.join(ws, 'plugins', 'input-test', 'deps.lock.json'));
  assert.equal(all[1].root, path.join(ws, 'third_party'));
  assert.deepEqual((await depGroups(repo, core, { workspace: ws, plugins: ['input-test'] }, {})).map((g) => g.name), ['input-test']);
  await assert.rejects(depGroups(repo, core, { workspace: ws, plugins: ['missing'] }, {}), /no plugins\/<plugin>\/deps.json in .* for: missing/);
});

test('a workspace plugin dependency with a wrong hash fails naming the plugin, the file and both hashes; the installed copy stays', async () => {
  const { depGroups, syncGroup } = await import('./fetch-deps.mjs');
  const { src } = await fixture();
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-deps-ws-'));
  await fs.mkdir(path.join(ws, 'plugins', 'input-test'), { recursive: true });
  await fs.writeFile(path.join(ws, 'plugins', 'input-test', 'deps.json'), JSON.stringify({ vars: { SRC: src.split(path.sep).join('/') }, sources: [{ id: 'a', kind: 'file', from: '${SRC}/a.dll', dest: 'test/a.dll' }] }));
  const [group] = await depGroups('unused', [], { workspace: ws }, {});
  await syncGroup(group, { updateLock: true });
  assert.equal(await fs.readFile(path.join(ws, 'third_party', 'test', 'a.dll'), 'utf8'), 'binary-a');
  const pinned = JSON.parse(await fs.readFile(group.lockPath, 'utf8'))['test/a.dll'];

  await fs.writeFile(path.join(ws, 'third_party', 'test', 'a.dll'), 'stale but present');
  await fs.writeFile(path.join(src, 'a.dll'), 'binary-a-CHANGED');
  await assert.rejects(syncGroup(group), (e) => e instanceof HashMismatchError && e.message.startsWith('[input-test] test/a.dll: SHA-256 mismatch') && e.message.includes(pinned) && /actual {3}[0-9a-f]{64}/.test(e.message));
  assert.equal(await fs.readFile(path.join(ws, 'third_party', 'test', 'a.dll'), 'utf8'), 'stale but present', 'the existing copy is left in place');
});

test('the workspace resolves like the panel: XRB_HOME, else ~/.xrbuild', async () => {
  const { workspaceDir } = await import('./fetch-deps.mjs');
  assert.equal(workspaceDir({ XRB_HOME: 'D:/work/x', USERPROFILE: 'C:/Users/u' }), path.resolve('D:/work/x'));
  assert.equal(workspaceDir({ USERPROFILE: 'C:/Users/u' }), path.join('C:/Users/u', '.xrbuild'));
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'fetch-deps-default-'));
  try {
    await fs.mkdir(path.join(home, '.xr-build'));
    assert.equal(workspaceDir({ USERPROFILE: home }), path.join(home, '.xrbuild'), 'legacy folder is not migrated or chosen');
    assert.equal(workspaceDir({ USERPROFILE: home, XRB_HOME: path.join(home, '.xr-build') }), path.join(home, '.xr-build'));
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test('only the repository dependency command explicitly selects .xrbuild', async () => {
  const { REPO_ROOT } = await import('./fetch-deps.mjs');
  const pkg = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['fetch-deps:repo'], /--workspace=\.xrbuild/);
  assert.doesNotMatch(pkg.scripts['fetch-deps'], /--workspace/);
});
