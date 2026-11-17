import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROPOSED_A1, verifyFixtureBytes, verifyCandidateArchive, readPinnedFixture, candidateDirectory, plainFixturePath } from './proposed-a1-fixture.mjs';
import { preparePinnedRuntimeFixture } from './prepare-proposed-a1-fixture.mjs';
const sandbox = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-candidate-pin-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; };

test('source/tree and actual candidate archive/module identities are immutable, not a released-version assertion', () => {
  assert.equal(PROPOSED_A1.revision, 'e86f628b08d56070bb61845b8f15ba122cf5cfb1');
  assert.equal(PROPOSED_A1.sourceTree, 'b9d993e69d97ce3b06308c118843f53a1dedc50d');
  assert.equal(PROPOSED_A1.package.sha256, '6796fa6d2281a413aa65ca92f635a1e76d2f3ea04a281dcbf2c2d0f762e5b254');
  assert.equal(Object.keys(PROPOSED_A1.files).length, 16);
  assert.throws(() => { PROPOSED_A1.files.LICENSE.sha256 = '0'.repeat(64); }, TypeError);
  assert.throws(() => { PROPOSED_A1.package.sha256 = '0'.repeat(64); }, TypeError);
  assert.throws(() => verifyFixtureBytes('LICENSE', Buffer.from('changed bytes')), /package file differs/);
  assert.throws(() => verifyFixtureBytes('../unreviewed.ts', Buffer.from('code')), /package file differs/);
  assert.throws(() => verifyCandidateArchive(Buffer.from('unreviewed package')), /archive identity differs/);
});

test('missing candidate is explicit/offline; corrupt archives are preserved, never downgraded to missing', t => {
  const root = sandbox(t); assert.throws(() => readPinnedFixture(root), error => error.code === 'XRB_FIXTURE_MISSING');
  const directory = candidateDirectory(root); fs.mkdirSync(directory, { recursive: true });
  const archive = path.join(directory, PROPOSED_A1.package.filename); fs.writeFileSync(archive, 'retain corrupt archive');
  assert.throws(() => readPinnedFixture(root), /archive size differs/);
  assert.equal(fs.readFileSync(archive, 'utf8'), 'retain corrupt archive');
});

test('explicit preparation verifies public source identity before installation and never resets a changed checkout', t => {
  const root = sandbox(t); let calls = [];
  assert.throws(() => preparePinnedRuntimeFixture({ root, run: (command, args) => {
    calls.push([command, args]); assert.equal(command, 'gh'); return JSON.stringify({ full_name: PROPOSED_A1.repository, private: true });
  } }), /public candidate repository/);
  assert.equal(calls.length, 1);
  fs.mkdirSync(path.join(candidateDirectory(root), 'source')); calls = [];
  assert.throws(() => preparePinnedRuntimeFixture({ root, run: (command, args) => { calls.push([command, args]); return 'wrong-source-head'; } }), /identity\/cleanliness mismatch/);
  assert.ok(calls.every(([command]) => command === 'git'));
  assert.equal(calls.some(([, args]) => args.includes('reset') || args.includes('checkout') || args.includes('publish') || args.includes('--global')), false);
});

test('candidate cache cannot escape through a junction or hardlinked file', t => {
  const root = sandbox(t), outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.mkdirSync(path.join(root, '.artifacts'));
  fs.symlinkSync(outside, path.join(root, '.artifacts/a1-candidate'), 'junction');
  assert.throws(() => readPinnedFixture(root), /plain and unlinked/);
  const file = path.join(outside, 'original'); fs.writeFileSync(file, 'synthetic'); fs.linkSync(file, path.join(outside, 'alias'));
  assert.throws(() => plainFixturePath(path.join(outside, 'alias')), /plain and unlinked/);
});
