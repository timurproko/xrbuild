// Explicit offline candidate dependency. Never fetch, install a daily runtime, or rewrite upstream source at test time.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pin from './proposed-a1-interface.json' with { type: 'json' };
for (const entry of Object.values(pin.files)) Object.freeze(entry);
Object.freeze(pin.files); Object.freeze(pin.package);
export const PROPOSED_A1 = Object.freeze(pin);
export const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
export const candidateDirectory = root => path.join(root, '.artifacts', 'a1-candidate', pin.revision);
export const fixtureDirectory = root => path.join(candidateDirectory(root), 'unpacked', 'package');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function verifyFixtureBytes(file, bytes) {
  if (!pin.files[file] || bytes.length > 1024 * 1024 || digest(bytes) !== pin.files[file].sha256) throw Error(`Pinned A1 package file differs: ${file}`);
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
export function verifyCandidateArchive(bytes) {
  if (bytes.length !== pin.package.size || digest(bytes) !== pin.package.sha256
    || `sha512-${createHash('sha512').update(bytes).digest('base64')}` !== pin.package.integrity) throw Error('Pinned candidate archive identity differs');
  return bytes;
}
export function readPinnedFixture(root = sourceRoot) {
  const directory = fixtureDirectory(root), files = new Map();
  try {
    const archive = plainFixturePath(path.join(candidateDirectory(root), pin.package.filename));
    if (fs.statSync(archive).size !== pin.package.size) throw Error('Pinned candidate archive size differs');
    verifyCandidateArchive(fs.readFileSync(archive));
    for (const file of Object.keys(pin.files)) {
      const target = plainFixturePath(path.join(directory, file));
      if (fs.statSync(target).size > 1024 * 1024) throw Error('Oversized fixture');
      files.set(file, verifyFixtureBytes(file, fs.readFileSync(target)));
    }
  } catch (error) {
    if (error.code === 'ENOENT') throw Object.assign(Error('Pinned offline A1 fixture not prepared; run pnpm prepare:delivery-runtime explicitly (candidate build; no test-time fetch)'), { code: 'XRB_FIXTURE_MISSING' });
    throw error;
  }
  const manifest = JSON.parse(files.get('package.json'));
  if (manifest.name !== pin.package.name || manifest.version !== pin.package.version) throw Error('Candidate package name/version mismatch');
  return files;
}

/** Import the actual unpacked artifact. No TS transpilation, dependency replacement or private coordination adapter. */
export async function loadPinnedRuntime(root = sourceRoot) {
  readPinnedFixture(root);
  const directory = fixtureDirectory(root), load = file => import(pathToFileURL(path.join(directory, file)).href);
  const lifecycle = file => load(`dist/foundation/lifecycle/${file}`);
  return {
    snapshot: await lifecycle('worktree-cleanup-snapshot.mjs'), boundary: await lifecycle('worktree-claim-boundary.mjs'),
    // Only the test host uses packaged session lifecycle APIs to create real isolated participants.
    context: await lifecycle('session-repository-context.js'), completion: await lifecycle('session-worktree-completion.js'),
    contextModuleUrl: pathToFileURL(path.join(directory, 'dist/foundation/lifecycle/session-repository-context.js')).href,
    livenessModuleUrl: pathToFileURL(path.join(directory, 'dist/foundation/lifecycle/process-liveness.js')).href,
    boundaryModuleUrl: pathToFileURL(path.join(directory, 'dist/foundation/lifecycle/worktree-claim-boundary.mjs')).href,
    snapshotModuleUrl: pathToFileURL(path.join(directory, 'dist/foundation/lifecycle/worktree-cleanup-snapshot.mjs')).href,
    liveness: await lifecycle('process-liveness.js'), identity: (await load('dist/product-identity.js')).PRODUCT_IDENTITY,
    revision: pin.revision, packageSha256: pin.package.sha256, mockedDependencies: [], dispose() {},
  };
}
