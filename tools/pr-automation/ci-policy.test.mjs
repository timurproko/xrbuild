import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const triage = readFileSync(new URL('../../.github/workflows/nightly-triage.yml', import.meta.url), 'utf8');

function job(name) {
  const lines = ci.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `missing ${name} job`);
  const next = lines.findIndex((line, index) => index > start && /^  [a-z][\w-]*:$/.test(line));
  return lines.slice(start, next < 0 ? undefined : next).join('\n');
}

test('the full host build is scheduled only at night or by explicit dispatch', () => {
  const native = job('native');
  assert.match(native, /needs: \[readiness\]/);
  const gate = native.match(/^    if: (.+)$/m)?.[1];
  assert.equal(gate, "needs.readiness.outputs.ready == 'true' && (github.event_name == 'schedule' || github.event_name == 'workflow_dispatch')");
  // The gate is independent of changed paths: native-only and CI-only PRs both skip the host.
  const runsNative = (event, draft = false) => (event !== 'pull_request' || !draft) && (event === 'schedule' || event === 'workflow_dispatch');
  for (const [event, draft, changed, selected] of [
    ['pull_request', true, ['native/host/CMakeLists.txt'], false],
    ['pull_request', false, ['native/host/CMakeLists.txt'], false],
    ['pull_request', false, ['.github/workflows/ci.yml'], false],
    ['push', false, ['native/host/CMakeLists.txt'], false],
    ['schedule', false, [], true],
    ['workflow_dispatch', false, [], true],
  ]) assert.equal(runsNative(event, draft), selected, `${event} (${changed.join(', ') || 'no changes'}, draft=${draft})`);
  assert.match(ci, /cron: '17 1 \* \* \*'/);
  assert.match(ci, /^  workflow_dispatch:$/m);
  assert.match(native, /uses: actions\/cache@/);
  assert.ok(native.includes('key: third-party-${{ hashFiles('));
  for (const step of [
    'node tools/fetch-deps/fetch-deps.mjs',
    'cmake -S native/host -B native/host/build -A x64',
    'cmake --build native/host/build --config Release --parallel',
    'native/host/build/Release/host-tests.exe',
  ]) assert.ok(native.includes(step), `nightly job keeps ${step}`);
});

test('fast PR checks remain path-selected and the required check accepts only intentional skips', () => {
  const changes = job('changes');
  assert.doesNotMatch(changes, /outputs\.native|native=true|native=\$\(/);
  assert.match(changes, /echo "node=\$\(match/);
  assert.doesNotMatch(ci, /workspace_assets|hand_tracking_runtime|\.xrbuild\/|lfs: true|CORE_READ_TOKEN/);
  assert.match(changes, /\\\.github\/workflows\/ci\\\.yml\$/);
  assert.match(job('node'), /needs\.changes\.outputs\.node == 'true'/);
  const required = job('required');
  assert.match(required, /needs: \[readiness, changes, names, openspec, delivery, node, native\]/);
  assert.ok(required.includes(`grep -qE '"(failure|cancelled)"'`));
  for (const [results, passes] of [
    [['success', 'skipped'], true], // Ready PR: the native job was skipped.
    [['success', 'failure'], false], // Nightly host failure must fail the aggregate.
    [['cancelled', 'success'], false],
  ]) assert.equal(!results.some((result) => result === 'failure' || result === 'cancelled'), passes);
});

test('only a scheduled main failure automatically enters nightly triage with separate read and write credentials', () => {
  assert.match(triage, /github\.event\.workflow_run\.event == 'schedule' && github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(triage, /workflows: \[CI\]/);
  assert.match(triage, /actions: read/);
  assert.match(triage, /issues: write/);
  assert.match(triage, /GH_TOKEN: \$\{\{ steps\.bot\.outputs\.token \}\}/);
  assert.match(triage, /GH_WORKFLOW_TOKEN: \$\{\{ github\.token \}\}/);
});
