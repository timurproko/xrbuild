import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensurePythonEnv, pythonDeclaration, pythonEnvPlan, pythonRoot, UV } from '../src/python-env.ts';
import { meshSetupPlan, installMeshSetup } from '../src/hand-mesh-setup.ts';

const wheel = { name: 'numeric', version: '1.0.0', sha256: 'a'.repeat(64), bytes: 1000, publisher: 'Example (PyPI)', licence: 'BSD-3-Clause' };
const declaration = { version: '3.12.12', wheels: [wheel] };

test('a python declaration is an exact version and hash-locked wheels, nothing else', () => {
  assert.deepEqual(pythonDeclaration(declaration), declaration);
  for (const bad of [null, [], {}, { ...declaration, version: '3.12' }, { ...declaration, version: '>=3.12' }, { ...declaration, wheels: [] },
    { ...declaration, extra: 1 }, { ...declaration, wheels: [{ ...wheel, sha256: 'abc' }] }, { ...declaration, wheels: [{ ...wheel, url: 'https://example.invalid' }] },
    { ...declaration, wheels: [wheel, { ...wheel, name: 'NUMERIC' }] }, { ...declaration, wheels: [{ ...wheel, bytes: 0 }] }])
    assert.throws(() => pythonDeclaration(bad), /Invalid python declaration/, JSON.stringify(bad));
});

test('the pinned uv installs the exact Python and only the locked wheels into a private, reused environment', async () => {
  const userRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xrb-python-'));
  try {
    const d = pythonDeclaration(declaration), plan = await pythonEnvPlan('workspace:surface', d, userRoot);
    assert.equal(plan.ready, false);
    assert.deepEqual(plan.items.map(i => i.name), ['uv', 'CPython', 'numeric'], 'the consent plan lists every download');
    // A uv already in the private folder is reused; the machine's own uv or Python never is.
    const uv = path.join(pythonRoot(userRoot), `uv-${UV.version}`, 'uv.exe');
    await fs.mkdir(path.dirname(uv), { recursive: true }); await fs.writeFile(uv, 'fake-not-executed');
    const calls: { program: string; args: string[]; env: Record<string, string> }[] = [];
    const run = async (program: string, args: string[], { env }: { env: Record<string, string> }) => {
      calls.push({ program, args, env });
      if (args[0] === 'venv') { await fs.mkdir(path.join(args[1], 'Scripts'), { recursive: true }); await fs.writeFile(path.join(args[1], 'Scripts', 'python.exe'), 'fake'); }
      if (args[0] === 'pip') assert.match(await fs.readFile(args.at(-1)!, 'utf8'), /^numeric==1\.0\.0 --hash=sha256:a{64}\n$/);
    };
    const python = await ensurePythonEnv('workspace:surface', d, { userRoot, run, fetchImpl: (() => { throw new Error('no download expected'); }) as typeof fetch });
    assert.ok(python.startsWith(path.join(pythonRoot(userRoot), 'envs')), 'environments live under the user folder');
    assert.deepEqual(calls.map(c => c.args.slice(0, 2)), [['python', 'install'], ['venv', calls[1].args[1]], ['pip', 'install']]);
    assert.ok(calls.every(c => c.program === uv));
    assert.ok(calls[2].args.includes('--require-hashes') && calls[2].args.includes('--no-deps') && calls[2].args.includes(':all:'));
    for (const key of ['UV_NO_CONFIG', 'UV_PYTHON_INSTALL_DIR', 'UV_CACHE_DIR']) assert.ok(calls[0].env[key], key);
    assert.equal(calls[0].env.UV_PYTHON_PREFERENCE, 'only-managed', 'never a Python found on the machine');
    assert.equal(calls[0].env.UV_PYTHON_INSTALL_REGISTRY, '0'); assert.equal(calls[0].env.UV_PYTHON_INSTALL_BIN, '0');
    assert.equal((await pythonEnvPlan('workspace:surface', d, userRoot)).ready, true);
    assert.equal(await ensurePythonEnv('workspace:surface', d, { userRoot, run: async () => { throw new Error('a ready environment is reused'); } }), python);
    const changed = pythonDeclaration({ ...declaration, wheels: [{ ...wheel, sha256: 'b'.repeat(64) }] });
    assert.equal((await pythonEnvPlan('workspace:surface', changed, userRoot)).ready, false, 'a changed lock gets its own environment');
  } finally { await fs.rm(userRoot, { recursive: true, force: true }); }
});

test('a setup that asks for Python lists it in the same plan and consent, and receives its interpreter', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'xrb-python-home-')), previous = process.env.USERPROFILE;
  const workspace = path.join(home, 'workspace'), plugin = path.join(workspace, 'plugins', 'surface');
  process.env.USERPROFILE = home;
  try {
    await fs.mkdir(path.join(plugin, 'setup'), { recursive: true });
    await fs.writeFile(path.join(plugin, 'xrb-plugin.json'), JSON.stringify({ title: 'Surface', type: 'plugin', version: '1.0.0', python: declaration,
      exports: { 'mesh-runtime-setup': './setup/runtime-setup.mjs' },
      handMesh: { version: 1, id: 'surface', label: 'Surface', program: 'bin/surface.exe', settingsVersion: 1 } }));
    await fs.writeFile(path.join(plugin, 'setup', 'runtime-setup.mjs'), `export function plan() { return { consent: 'c0ffee', destination: 'd', downloadBytes: 0, installedBytes: 0, licences: ['Own'], items: [], python: true }; }
export async function status() { return { cpu: { installed: false } }; }
export async function install(options) { globalThis.pythonInstall = options; }`);
    const core = path.resolve(import.meta.dirname, '../../..');
    const plan = await meshSetupPlan(core, workspace, 'workspace:surface');
    assert.equal(plan.python, true);
    assert.match(plan.consent, /^c0ffee\+[a-f0-9]{16}$/, 'consent covers the plugin plan and its Python lock');
    assert.deepEqual(plan.items.map(i => i.name), ['uv', 'CPython', 'numeric']);
    assert.deepEqual(await fs.readdir(path.join(home, '.xrbuild')).catch(() => []), [], 'planning creates nothing');
    // A ready environment adds nothing to the plan, and its interpreter reaches install({ python }). A stand-in uv avoids any download.
    const userRoot = path.join(home, '.xrbuild'), uv = path.join(pythonRoot(userRoot), `uv-${UV.version}`, 'uv.exe');
    await fs.mkdir(path.dirname(uv), { recursive: true }); await fs.writeFile(uv, 'fake-not-executed');
    const python = await ensurePythonEnv('workspace:surface', pythonDeclaration(declaration), { userRoot, run: async (_p, args) => {
      if (args[0] === 'venv') { await fs.mkdir(path.join(args[1], 'Scripts'), { recursive: true }); await fs.writeFile(path.join(args[1], 'Scripts', 'python.exe'), 'fake'); }
    } });
    const ready2 = await meshSetupPlan(core, workspace, 'workspace:surface');
    assert.deepEqual([ready2.consent, ready2.items.length], ['c0ffee', 0]);
    await installMeshSetup(core, workspace, 'workspace:surface', ready2.consent, { line: () => {}, run: async () => {} }, undefined, ready2.kind, false, null, ready2.python);
    assert.equal((globalThis as any).pythonInstall.python, python);
    assert.equal((globalThis as any).pythonInstall.consent, 'c0ffee');
  } finally {
    if (previous === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = previous;
    delete (globalThis as any).pythonInstall;
    await fs.rm(home, { recursive: true, force: true });
  }
});
