import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  APPROVED_HASHES, ROUTING_PARAGRAPH, findPlanningSnapshot, isProtectedOpenSpecPath,
  verifyContractInstallation, verifyOpenSpecBoundary,
} from './delivery-contract.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file));
const text = file => read(file).toString('utf8').replaceAll('\r\n', '\n');
const planningDirectory = findPlanningSnapshot(root);
const sharedCases = JSON.parse(text('docs/delivery-cases.json')).cases;
const sharedCase = id => {
  const found = sharedCases.find(item => item.id === id);
  assert.ok(found, `Missing shared input ${id}`);
  return found;
};
const sha = value => createHash('sha256').update(value).digest('hex');

// Installation coverage only. The complete behavioral bindings for all 50 cases remain task 5.5;
// none are declared passed or skipped by this file merely because they exist in the manifest.
test('C49: exact offline guidance installation and unchanged OpenSpec assets', () => {
  const fixture = sharedCase('C49');
  const result = verifyContractInstallation({ root });
  const boundary = verifyOpenSpecBoundary({ root });
  assert.equal(result.contract, 'portable-delivery-v1');
  assert.equal(result.cases.length, 50);
  assert.equal(result.adapter.repository, 'timurproko/xrbuild');
  assert.equal(boundary.protectedAssets, 12);
  assert.equal(text('AGENTS.md').split(ROUTING_PARAGRAPH).length - 1, fixture.given.rootRoutingParagraphCount);
  assert.equal(boundary.unchanged, fixture.given.openSpecAssetsUnchanged);
  // Both verifiers use local file/Git reads only. No companion repository, API or dependency installer exists here.
  assert.equal(result.contract === 'portable-delivery-v1', fixture.expect.passed);
  assert.equal(/https?:|fetch\(|ghRequest|execFileSync\('gh'/.test(text('tools/worktree/delivery-contract.mjs')), fixture.expect.companionNetworkReadRequiredForOfflineUse);
});

test('C44: a one-byte deployment change cannot be approved by a local rehash', () => {
  const fixture = sharedCase('C44');
  assert.equal(fixture.given.deployedRulebookDiffersByOneByte, true);
  const changed = Buffer.from(read('docs/delivery-rules.md'));
  changed[0] ^= 1;
  let failure;
  try {
    verifyContractInstallation({ root, read: file => file === 'docs/delivery-rules.md' ? changed : read(file) });
  } catch (error) { failure = error; }
  assert.equal(!failure, fixture.expect.passed);
  assert.match(failure.message, /Approved contract bytes differ: delivery-rules.md/);
  const rehashed = JSON.parse(text('docs/delivery-contract.json'));
  rehashed.files['delivery-rules.md'].sha256 = sha(changed);
  assert.throws(() => verifyContractInstallation({ root, read: file => {
    if (file.endsWith('/delivery-rules.md')) return changed;
    if (file.endsWith('/delivery-contract.json')) return Buffer.from(JSON.stringify(rehashed) + '\n');
    return read(file);
  } }), /not approval/);
  assert.equal(sha(changed) === APPROVED_HASHES['delivery-rules.md'], fixture.expect.selfRehashAllowed);
});

test('C45: adapter drift fails even when both mutable manifests and payloads are rehashed', () => {
  const fixture = sharedCase('C45');
  assert.equal(fixture.given.adapterPolicyChangedWithoutApproval, true);
  const adapter = JSON.parse(text('docs/delivery-adapters.json'));
  adapter.repositories.xrbuild.baseCurrency = 'strict-current-target';
  const changed = Buffer.from(JSON.stringify(adapter, null, 2) + '\n');
  const manifest = JSON.parse(text('docs/delivery-contract.json'));
  manifest.files['delivery-adapters.json'].sha256 = sha(changed);
  let failure;
  try {
    verifyContractInstallation({ root, read: file => {
      if (file.endsWith('/delivery-adapters.json')) return changed;
      if (file.endsWith('/delivery-contract.json')) return Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
      return read(file);
    } });
  } catch (error) { failure = error; }
  assert.equal(!failure, fixture.expect.passed);
  assert.match(failure.message, /not approval/);
  assert.equal(sha(changed) === APPROVED_HASHES['delivery-adapters.json'], fixture.expect.approvalInferredFromDigest);
});

test('frozen inputs reject missing cases, changed planning bytes, CRLF, BOM and duplicate/missing root routes', () => {
  const cases = JSON.parse(text('docs/delivery-cases.json'));
  cases.cases.pop();
  const mutations = [
    ['docs/delivery-cases.json', JSON.stringify(cases) + '\n'],
    [`${planningDirectory}/delivery-rules.md`, text('docs/delivery-rules.md') + '\n'],
    ['docs/delivery-rules.md', text('docs/delivery-rules.md').replaceAll('\n', '\r\n')],
    ['docs/delivery-rules.md', '\uFEFF' + text('docs/delivery-rules.md')],
    ['AGENTS.md', text('AGENTS.md') + '\n' + ROUTING_PARAGRAPH + '\n'],
    ['AGENTS.md', text('AGENTS.md').replace(ROUTING_PARAGRAPH, 'Alternative policy')],
  ];
  for (const [file, value] of mutations) {
    assert.throws(() => verifyContractInstallation({ root, read: name => name === file ? Buffer.from(value) : read(name) }),
      /contract bytes differ|routing paragraph/, file);
  }
});

test('entry points link shared policy without old progress, prose-count or authorization overrides', () => {
  const entries = ['AGENTS.md', '.claude/CLAUDE.md', '.claude/skills/change-delivery/SKILL.md',
    '.github/pull_request_template.md', 'docs/portable-planning.md', 'docs/portable-worktrees.md', 'docs/pr-delivery-governance.md', 'README.md', 'openspec/config.yaml'];
  for (const file of entries) {
    const content = text(file);
    assert.match(content, /delivery-rules\.md/, `${file} must link the shared contract`);
    assert.match(content, /delivery-adapters\.json/, `${file} must link the repository bindings`);
    assert.doesNotMatch(content, /one task group per PR|before starting the next one|after its\s+own push|Never save ticks|at least two outcome|one to ten plain|Authorization and operation scope/);
    assert.doesNotMatch(content, /(?:override|replace|regenerate) (?:the )?(?:unchanged )?(?:OpenSpec|opsx) (?:skill|command|framework)/i);
  }
  assert.match(text('.claude/CLAUDE.md'), /^@\.\.\/AGENTS\.md$/m);
  assert.match(text('AGENTS.md'), /Never clean up a worktree containing private workspace data/);
  const skill = text('.claude/skills/change-delivery/SKILL.md');
  assert.match(skill, /Private|private/);
  assert.match(skill, /legacy bulk-sweep/);
  assert.match(skill, /not a compatible exact-completion interface/);
  assert.match(skill, /fresh remote HEAD\/containment evidence/);
  assert.match(skill, /not automatic cleanup enrollment or acceptance/);
});

test('contract and approved planning snapshots use LF even with Windows autocrlf', () => {
  const attributes = text('.gitattributes');
  for (const name of Object.keys(APPROVED_HASHES)) {
    assert.ok(attributes.includes(`docs/${name} text eol=lf`));
    assert.ok(attributes.includes(`openspec/changes/**/${name} text eol=lf`));
  }
});

test('OpenSpec boundary rejects edits, deletion, rename sources and new framework assets without history/network', () => {
  const original = '.claude/skills/openspec-apply-change/SKILL.md';
  assert.throws(() => verifyOpenSpecBoundary({ root, paths: [original], read: file => file === original ? Buffer.from('changed') : read(file) }), /Protected OpenSpec asset changed/);
  assert.throws(() => verifyOpenSpecBoundary({ root, paths: [], read: file => {
    if (file === original) throw new Error('deleted or renamed source');
    return read(file);
  } }), /deleted or renamed source/);
  for (const added of ['.claude/skills/openspec-new/SKILL.md', '.agents/skills/openspec-new/SKILL.md',
    '.claude/commands/opsx/new.md', '.claude/commands/opsx-new.md', 'openspec/schemas/new/schema.yaml', 'openspec/templates/new.md']) {
    assert.equal(isProtectedOpenSpecPath(added), true);
    assert.throws(() => verifyOpenSpecBoundary({ root, paths: [added] }), /Unapproved OpenSpec asset added or renamed/);
  }
  for (const allowed of ['openspec/config.yaml', 'openspec/changes/example/proposal.md', 'openspec/specs/change-delivery/spec.md',
    '.claude/skills/change-delivery/SKILL.md', '.github/workflows/openspec-finalization.yml']) {
    assert.equal(isProtectedOpenSpecPath(allowed), false);
  }
});

test('R20 checkpoint preserves unrelated completed tasks and records inspected head before affected implementation', () => {
  const reconciliation = text(`${planningDirectory}/contract-reconciliation.md`);
  assert.match(reconciliation, /8b3b5f98b21ce7c1672dbf7c9a6c82d68b91ccdf/);
  assert.match(reconciliation, /R20 \/ C48/);
  assert.match(reconciliation, /Remaining blockers/);
  assert.match(reconciliation, /No reset or discard/);
  for (const task of ['1.2', '1.3']) assert.ok(text(`${planningDirectory}/tasks.md`).includes(`- [x] ${task} `));
});
