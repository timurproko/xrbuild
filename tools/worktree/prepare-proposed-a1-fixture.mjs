// Explicit dependency preparation only; tests and normal repository operations never call this.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROPOSED_A1, sourceRoot, fixtureDirectory, plainFixturePath, verifyFixtureBytes, readPinnedFixture } from './proposed-a1-fixture.mjs';

export function preparePinnedRuntimeFixture({ root = sourceRoot, request = endpoint => JSON.parse(execFileSync('gh', ['api', '--hostname', 'github.com', endpoint], {
  encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
})) } = {}) {
  const directory = fixtureDirectory(root); let publicVerified = false;
  for (const file of Object.keys(PROPOSED_A1.files)) {
    const target = plainFixturePath(path.join(directory, file), true);
    if (fs.existsSync(target)) {
      if (fs.statSync(target).size > 1024 * 1024) throw Error('Oversized pinned fixture; retained for inspection');
      verifyFixtureBytes(file, fs.readFileSync(target)); continue;
    }
    if (!publicVerified) {
      const repository = request(`repos/${PROPOSED_A1.repository}`);
      if (repository.private !== false || repository.full_name !== PROPOSED_A1.repository) throw Error('Public pinned test dependency identity is unverifiable');
      publicVerified = true;
    }
    const data = request(`repos/${PROPOSED_A1.repository}/contents/${file}?ref=${PROPOSED_A1.revision}`);
    if (data.encoding !== 'base64' || data.sha !== PROPOSED_A1.files[file].gitBlob || typeof data.content !== 'string') throw Error('Pinned source response is unverifiable');
    const bytes = verifyFixtureBytes(file, Buffer.from(data.content, 'base64'));
    fs.mkdirSync(path.dirname(target), { recursive: true }); plainFixturePath(path.dirname(target));
    fs.writeFileSync(target, bytes, { flag: 'wx' });
  }
  readPinnedFixture(root);
  return { revision: PROPOSED_A1.revision, files: Object.keys(PROPOSED_A1.files).length, runtimeInstalled: false, liveAdoption: 'disabled' };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.slice(2).join(' ') !== '--prepare') throw Error('Explicit --prepare required; this downloads the pinned public test dependency only');
  console.log(JSON.stringify(preparePinnedRuntimeFixture()));
}
