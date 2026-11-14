// Test dependency only. No automatic network, installed-runtime loading, registration or adoption.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pin from './proposed-a1-interface.json' with { type: 'json' };
for (const entry of Object.values(pin.files)) Object.freeze(entry);
Object.freeze(pin.files);
export const PROPOSED_A1 = Object.freeze(pin);
export const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
export const fixtureDirectory = root => path.join(root, '.artifacts', 'a1-interface', pin.revision, 'source');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function verifyFixtureBytes(file, bytes) {
  const expected = pin.files[file];
  if (!expected || bytes.length > 1024 * 1024 || digest(bytes) !== expected.sha256
    || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== expected.gitBlob) throw Error(`Pinned A1 fixture differs: ${file}`);
  return bytes;
}
export function plainFixturePath(file, missing = false) {
  const absolute = path.resolve(file); let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat; try { stat = fs.lstatSync(current); } catch (error) { if (missing && error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1 || !stat.isFile() && !stat.isDirectory()) throw Error('Pinned fixture paths must be plain and unlinked');
  }
  return absolute;
}
export function readPinnedFixture(root = sourceRoot) {
  const directory = fixtureDirectory(root), files = new Map();
  for (const file of Object.keys(pin.files)) {
    let bytes;
    try { const target = plainFixturePath(path.join(directory, file)); if (fs.statSync(target).size > 1024 * 1024) throw Error('Oversized fixture'); bytes = fs.readFileSync(target); }
    catch (error) {
      if (error.code === 'ENOENT') throw Object.assign(Error('Pinned offline A1 fixture not prepared; run pnpm prepare:delivery-runtime explicitly (no test-time fetch)'), { code: 'XRB_FIXTURE_MISSING' });
      throw error;
    }
    files.set(file, verifyFixtureBytes(file, bytes));
  }
  return files;
}

/** Compile unchanged pinned TS into disposable tool state. Only dependency mocks below replace external services. */
export async function loadPinnedRuntime(root = sourceRoot) {
  const files = readPinnedFixture(root), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proposed-a1-code-'));
  try {
    const ts = await import('typescript');
    const write = (file, bytes) => { const target = path.join(directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes, { flag: 'wx' }); };
    write('package.json', '{"type":"module"}\n');
    for (const [file, bytes] of files) {
      if (!file.endsWith('.ts')) { write(file, bytes); continue; }
      const compiled = ts.transpileModule(bytes.toString('utf8'), { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
      write(file.replace(/\.ts$/, '.js'), compiled);
    }
    // Explicit dataDir is mandatory in every test. Never discover this user's installed A1 state.
    write('src/foundation/lifecycle/paths.js', 'export function resolveProductPaths(){throw Error("Offline fixture must supply isolated dataDir");}\n');
    // Mock the external OS-lock package, NOT A1 claim records, validation, acquisition, detach or settlement.
    write('node_modules/proper-lockfile/package.json', '{"type":"module","exports":"./index.js"}\n');
    write('node_modules/proper-lockfile/index.js', `const held = new Set();
export default { lockSync(path) { if (held.has(path)) throw Object.assign(Error('busy'), {code:'ELOCKED'}); held.add(path); return () => held.delete(path); } };\n`);
    const load = file => import(pathToFileURL(path.join(directory, 'src/foundation/lifecycle', file)).href);
    return { context: await load('session-repository-context.js'), completion: await load('session-worktree-completion.js'),
      liveness: await load('process-liveness.js'), revision: pin.revision,
      mockedDependencies: ['proper-lockfile (in-process mutex; no OS-lock certification)', 'product path discovery (throws; explicit isolated dataDir required)'],
      dispose: () => fs.rmSync(directory, { recursive: true, force: true }) };
  } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); throw error; }
}
