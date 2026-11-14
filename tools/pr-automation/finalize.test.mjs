import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { finalizeChange, openTasks, readFinalizationTasks } from './finalize.mjs';

const AUTHOR = 'test-bot[bot] <1+test-bot[bot]@users.noreply.github.com>';

function write(root, file, text) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

/** A repo with one spec and one change adding a requirement to it. */
function fixture(tasks, requirement = 'The demo SHALL have a thing.', scenario = '#### Scenario: Thing\n- **WHEN** the thing is asked for\n- **THEN** it is given\n') {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'finalize-'));
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe' });
  g('init', '--quiet', '-b', 'main');
  write(repo, 'openspec/config.yaml', 'schema: spec-driven\n');
  write(repo, 'openspec/specs/demo/spec.md', '# demo Specification\n\n## Purpose\n\nA demo capability that the finalization test archives a change into.\n\n## Requirements\n\n### Requirement: Existing\nThe demo SHALL exist.\n\n#### Scenario: Exists\n- **WHEN** it is looked at\n- **THEN** it is there\n');
  write(repo, 'openspec/changes/add-thing/proposal.md', '## Why\n\nThe demo needs a thing for the finalization test to archive.\n\n## What Changes\n\n- Add a thing.\n');
  write(repo, 'openspec/changes/add-thing/tasks.md', tasks);
  write(repo, 'openspec/changes/add-thing/specs/demo/spec.md', `## ADDED Requirements\n\n### Requirement: Thing\n${requirement}\n\n${scenario}`);
  g('add', '-A');
  g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '--quiet', '-m', 'init');
  return { repo, g };
}

test('open tasks are the unchecked lines', () => {
  assert.deepEqual(openTasks('# Tasks\n\n- [x] 1.1 done\n- [ ] 1.2 write it\n  - [ ] 1.3 nested\n* [ ] 1.4 star\n- [X] 1.5 done too\n'), ['1.2 write it', '1.3 nested', '1.4 star']);
});

test('a change with open tasks is not finalized and nothing is committed', () => {
  const { repo, g } = fixture('- [x] 1.1 done\n- [ ] 1.2 not yet\n');
  const before = g('rev-parse', 'HEAD').toString();
  assert.deepEqual(finalizeChange({ repo, change: 'add-thing', author: AUTHOR }), { status: 'open-tasks', tasks: ['1.2 not yet'] });
  assert.equal(g('rev-parse', 'HEAD').toString(), before);
  assert.ok(fs.existsSync(path.join(repo, 'openspec/changes/add-thing')));
});

test('a done change is archived with its specs synced, in one commit by the bot; a second run is a no-op', () => {
  const { repo, g } = fixture('- [x] 1.1 done\n');
  assert.equal(readFinalizationTasks(repo, { change: 'add-thing' }), '- [x] 1.1 done');
  const r = finalizeChange({ repo, change: 'add-thing', author: AUTHOR });
  assert.equal(r.status, 'finalized');
  const association = { version: 1, change: 'add-thing', archive: r.archive, finalizedHead: r.commit };
  assert.equal(readFinalizationTasks(repo, association), '- [x] 1.1 done');
  assert.equal(readFinalizationTasks(repo, { change: 'add-thing' }), '- [x] 1.1 done', 'lost body-update repair uses tracked archive tasks');
  assert.throws(() => readFinalizationTasks(repo, { ...association, finalizedHead: 'f'.repeat(40) }), /history/);
  assert.throws(() => readFinalizationTasks(repo, { ...association, archive: 'openspec/changes/archive/2000-01-01-add-thing' }), /association/);
  assert.throws(() => readFinalizationTasks(repo, { ...association, finalizedHead: undefined }), /invalid/);
  assert.match(r.archive, /^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-add-thing$/);
  assert.ok(!fs.existsSync(path.join(repo, 'openspec/changes/add-thing')));
  assert.match(fs.readFileSync(path.join(repo, 'openspec/specs/demo/spec.md'), 'utf8'), /### Requirement: Thing/);
  assert.equal(g('log', '-1', '--format=%s|%an').toString().trim(), 'docs(openspec): finalize add-thing|test-bot[bot]');
  assert.equal(g('status', '--porcelain').toString(), '', 'everything is committed');
  assert.equal(r.commit, g('rev-parse', 'HEAD').toString().trim());

  const again = finalizeChange({ repo, change: 'add-thing', author: AUTHOR });
  assert.deepEqual(again, { status: 'already', archive: r.archive });
  assert.equal(g('rev-parse', 'HEAD').toString().trim(), r.commit, 'no second commit');
});

test('long requirements stay informational during strict finalization', () => {
  const requirement = `The demo SHALL have a thing. ${'It SHALL offer a thing. '.repeat(25)}`;
  assert.ok(requirement.length > 500);
  const { repo, g } = fixture('- [x] 1.1 done\n', requirement);
  const result = finalizeChange({ repo, change: 'add-thing', author: AUTHOR });
  assert.equal(result.status, 'finalized');
  assert.match(fs.readFileSync(path.join(repo, 'openspec/specs/demo/spec.md'), 'utf8'), /It SHALL offer a thing/);
  assert.equal(g('status', '--porcelain').toString(), '');
});

test('strict finalization still rejects missing scenarios', () => {
  const { repo, g } = fixture('- [x] 1.1 done\n', 'The demo SHALL have a thing.', '');
  const before = g('rev-parse', 'HEAD').toString();
  assert.throws(() => finalizeChange({ repo, change: 'add-thing', author: AUTHOR }), /Command failed/);
  assert.equal(g('rev-parse', 'HEAD').toString(), before);
  assert.ok(fs.existsSync(path.join(repo, 'openspec/changes/add-thing')));
});

test('CI and finalization pin the same strict OpenSpec version', () => {
  const base = path.resolve(import.meta.dirname, '../..');
  const pkg = JSON.parse(fs.readFileSync(path.join(base, 'tools/pr-automation/package.json'), 'utf8'));
  const installed = JSON.parse(fs.readFileSync(path.join(base, 'tools/pr-automation/node_modules/@fission-ai/openspec/package.json'), 'utf8'));
  const ci = fs.readFileSync(path.join(base, '.github/workflows/ci.yml'), 'utf8');
  assert.equal(installed.version, pkg.devDependencies['@fission-ai/openspec']);
  assert.match(ci, new RegExp(`@fission-ai/openspec@${installed.version.replaceAll('.', '\\.')} validate --all --strict`));
});

test('an unknown change is an error', () => {
  const { repo } = fixture('- [x] 1.1 done\n');
  assert.throws(() => finalizeChange({ repo, change: 'missing', author: AUTHOR }), /neither active nor archived/);
});
