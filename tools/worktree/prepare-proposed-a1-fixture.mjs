#!/usr/bin/env node
// Explicit public source/package preparation only. Builds an isolated immutable dependency; never npm install -g/publish.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROPOSED_A1 as pin, candidateDirectory, fixtureDirectory, sourceRoot, plainFixturePath, readPinnedFixture, verifyCandidateArchive } from './proposed-a1-fixture.mjs';
import { contextEnvironment } from './git-environment.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function preparePinnedRuntimeFixture({ root = sourceRoot, run = (command, args, options) => execFileSync(command, args, options) } = {}) {
  const base = plainFixturePath(candidateDirectory(root), true), source = path.join(base, 'source');
  fs.mkdirSync(base, { recursive: true });
  const env = Object.fromEntries(Object.entries(contextEnvironment()).filter(([key]) => !/^(?:A1_|PI_|GH_|GITHUB_)/i.test(key)));
  const execute = (command, args, cwd = source) => run(command, args, { cwd, env, encoding: 'utf8', timeout: 900_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = args => execute('git', ['-c', 'core.hooksPath=/dev/null', ...args]);
  if (!fs.existsSync(source)) {
    const metadata = JSON.parse(execute('gh', ['api', '--hostname', 'github.com', `repos/${pin.repository}`], root));
    if (metadata.full_name !== pin.repository || metadata.private !== false) throw Error('Explicit public candidate repository unavailable');
    execute('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--quiet', '--no-checkout', `https://github.com/${pin.repository}.git`, source], base);
    git(['checkout', '--quiet', '--detach', pin.revision]);
  }
  plainFixturePath(source);
  if (git(['rev-parse', 'HEAD']) !== pin.revision || git(['rev-parse', 'HEAD^{tree}']) !== pin.sourceTree
    || git(['status', '--porcelain', '--untracked-files=no']) || git(['remote', 'get-url', 'origin']) !== `https://github.com/${pin.repository}.git`) throw Error('Candidate source identity/cleanliness mismatch; no reset or replacement');
  if (sha(fs.readFileSync(path.join(source, 'package-lock.json'))) !== pin.lockSha256) throw Error('Candidate frozen dependency lock differs');
  for (const entry of Object.values(pin.files)) {
    const bytes = fs.readFileSync(plainFixturePath(path.join(source, entry.source)));
    if (sha(bytes) !== entry.sourceSha256 || git(['rev-parse', `${pin.revision}:${entry.source}`]) !== entry.gitBlob) throw Error('Candidate source closure differs');
  }
  // npm.cmd cannot be execFile'd on Windows. Run npm's own JS CLI with ordinary Node, not a shell.
  const npmEntry = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const exactNpm = args => execute(process.execPath, [npmEntry, 'exec', '--yes', '--package', `npm@${pin.npm}`, '--', 'npm', ...args]);
  if (exactNpm(['--version']) !== pin.npm) throw Error('Exact candidate package manager unavailable');
  exactNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  const hashes = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    exactNpm(['run', 'build']);
    const metadata = JSON.parse(exactNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', base]));
    if (metadata.length !== 1 || metadata[0].filename !== pin.package.filename) throw Error('Unexpected candidate pack identity');
    const bytes = verifyCandidateArchive(fs.readFileSync(plainFixturePath(path.join(base, pin.package.filename)))); hashes.push(sha(bytes));
  }
  if (hashes[0] !== hashes[1] || git(['status', '--porcelain', '--untracked-files=no'])) throw Error('Candidate rebuild is not reproducible/clean');
  const unpacked = path.dirname(fixtureDirectory(root)); plainFixturePath(unpacked, true); fs.mkdirSync(unpacked, { recursive: true });
  if (!fs.existsSync(fixtureDirectory(root))) execute('tar', ['-xzf', path.join(base, pin.package.filename), '-C', unpacked], base);
  readPinnedFixture(root); // Existing changed outputs are rejected, never silently reconstructed/replaced.
  const result = { revision: pin.revision, sourceTree: pin.sourceTree, packageSha256: pin.package.sha256, integrity: pin.package.integrity,
    builds: hashes, node: process.version, npm: pin.npm, runtimeInstalled: false, liveAdoption: 'disabled', releasedCompatibility: 'unverified' };
  fs.writeFileSync(path.join(base, 'candidate.identity.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (!process.argv.includes('--prepare')) throw Error('Explicit --prepare required');
  console.log(JSON.stringify(preparePinnedRuntimeFixture()));
}
