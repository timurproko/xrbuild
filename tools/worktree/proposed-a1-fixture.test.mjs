import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROPOSED_A1, verifyFixtureBytes, readPinnedFixture, fixtureDirectory, plainFixturePath } from './proposed-a1-fixture.mjs';
import { preparePinnedRuntimeFixture } from './prepare-proposed-a1-fixture.mjs';

const sandbox = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-dependency-pin-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; };

test('proposed dependency revision/hash entries are pinned, frozen and contain no automatic release/adoption assertion', () => {
  assert.equal(PROPOSED_A1.revision, 'e6e52727e4e9a00be3c6ab715d3a9e6d42925ef8');
  assert.equal(Object.keys(PROPOSED_A1.files).length, 8);
  assert.throws(() => { PROPOSED_A1.files.LICENSE.sha256 = '0'.repeat(64); }, TypeError);
  assert.throws(() => verifyFixtureBytes('LICENSE', Buffer.from('changed bytes')), /Pinned A1 fixture differs/);
  assert.throws(() => verifyFixtureBytes('../unreviewed.ts', Buffer.from('code')), /Pinned A1 fixture differs/);
});

test('missing fixture is explicit and offline; corrupted cache is not silently replaced or downgraded to missing', t => {
  const root = sandbox(t);
  assert.throws(() => readPinnedFixture(root), error => error.code === 'XRB_FIXTURE_MISSING');
  const directory = fixtureDirectory(root); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'LICENSE'); fs.writeFileSync(file, 'retain corrupt cache for inspection');
  assert.throws(() => readPinnedFixture(root), /Pinned A1 fixture differs/);
  let requests = 0;
  assert.throws(() => preparePinnedRuntimeFixture({ root, request: () => requests++ }), /Pinned A1 fixture differs/);
  assert.equal(requests, 0); assert.equal(fs.readFileSync(file, 'utf8'), 'retain corrupt cache for inspection');
});

test('explicit preparation rejects responses outside the pinned source digest without writing them', t => {
  const root = sandbox(t); let requests = 0;
  assert.throws(() => preparePinnedRuntimeFixture({ root, request: endpoint => {
    requests++;
    if (endpoint === `repos/${PROPOSED_A1.repository}`) return { full_name: PROPOSED_A1.repository, private: false };
    assert.ok(endpoint.endsWith(`?ref=${PROPOSED_A1.revision}`));
    return { encoding: 'base64', sha: '0'.repeat(40), content: Buffer.from('unreviewed').toString('base64') };
  } }), /unverifiable/);
  assert.equal(requests, 2); assert.equal(fs.existsSync(path.join(fixtureDirectory(root), 'LICENSE')), false);
  assert.throws(() => preparePinnedRuntimeFixture({ root, request: () => ({ full_name: PROPOSED_A1.repository, private: true }) }), /Public pinned test dependency identity/);
});

test('dependency cache cannot escape through a junction or hardlinked file', t => {
  const root = sandbox(t), outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.mkdirSync(path.join(root, '.artifacts'));
  fs.symlinkSync(outside, path.join(root, '.artifacts/a1-interface'), 'junction');
  assert.throws(() => readPinnedFixture(root), /plain and unlinked/);
  const file = path.join(outside, 'original'); fs.writeFileSync(file, 'synthetic data'); fs.linkSync(file, path.join(outside, 'alias'));
  assert.throws(() => plainFixturePath(path.join(outside, 'alias')), /plain and unlinked/);
});
