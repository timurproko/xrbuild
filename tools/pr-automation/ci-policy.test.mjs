import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { requiredProblems } from './required.mjs';

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
    'pnpm host --workspace=.artifacts/native-ci --core-only --tests',
    'pnpm host --workspace=.artifacts/native-ci --plugins-only',
  ]) assert.ok(native.includes(step), `nightly job keeps ${step}`);
});

test('fast PR checks remain path-selected and the required check accepts only intentional skips', () => {
  const changes = job('changes');
  assert.doesNotMatch(changes, /outputs\.native|native=true|native=\$\(/);
  assert.match(changes, /echo "node=\$\(match/);
  assert.doesNotMatch(ci, /workspace_assets|hand_tracking_runtime|\.xrbuild\/|lfs: true|CORE_READ_TOKEN/);
  assert.match(changes, /\\\.github\//);
  assert.match(job('node'), /needs\.changes\.outputs\.node == 'true'/);
  const required = job('required');
  assert.match(required, /needs: \[readiness, changes, names, openspec, delivery, node, embedded, native\]/);
  assert.match(required, /always\(\) && \(github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft\)/);
  assert.match(required, /node tools\/pr-automation\/required\.mjs/);
  const ready = { readiness: { result: 'success', outputs: { ready: 'true' } }, changes: { result: 'success', outputs: { node: 'true', embedded: 'true' } },
    names: { result: 'success' }, openspec: { result: 'success' }, delivery: { result: 'success' }, node: { result: 'success' }, embedded: { result: 'success' }, native: { result: 'skipped' } };
  assert.deepEqual(requiredProblems(ready, 'pull_request'), []);
  for (const result of ['skipped', 'failure', 'cancelled', undefined]) {
    for (const name of ['node', 'embedded', 'delivery']) assert.ok(requiredProblems({ ...ready, [name]: { result } }, 'pull_request').length, `${name}: ${result}`);
  }
  assert.ok(requiredProblems({ ...ready, readiness: { result: 'success', outputs: { ready: 'false' } } }, 'pull_request').length);
  assert.deepEqual(requiredProblems({ ...ready, delivery: { result: 'skipped' }, native: { result: 'success' } }, 'schedule'), []);
  for (const node of ['true', 'false']) for (const embedded of ['true', 'false']) {
    const selected = { ...ready, changes: { result: 'success', outputs: { node, embedded } },
      node: { result: node === 'true' ? 'success' : 'skipped' }, embedded: { result: embedded === 'true' ? 'success' : 'skipped' } };
    assert.deepEqual(requiredProblems(selected, 'pull_request'), []);
    for (const name of ['node', 'embedded']) {
      assert.ok(requiredProblems({ ...selected, changes: { result: 'success', outputs: { ...selected.changes.outputs, [name]: undefined } } }, 'pull_request').length, `${name}: missing selection`);
      assert.ok(requiredProblems({ ...selected, [name]: { result: selected[name].result === 'success' ? 'skipped' : 'success' } }, 'pull_request').length, `${name}: unexpected result`);
      const missing = { ...selected }; delete missing[name];
      assert.ok(requiredProblems(missing, 'pull_request').length, `${name}: missing job`);
    }
  }
});

test('public embedded contracts select frozen typechecked/compiler checks without private credentials or devices', () => {
  const changes = job('changes');
  const pattern = output => {
    const line = changes.split('\n').find(line => line.includes(`"${output}=$(match '`));
    assert.ok(line, `missing ${output} selector`); return new RegExp(line.split("match '")[1].split("'")[0]);
  };
  const node = pattern('node'), embedded = pattern('embedded');
  for (const file of ['embedded/plugins/example/src/plugin.cpp', 'embedded/projects/core/example/test/check.test.ts', 'embedded/pnpm-lock.yaml', 'native/plugin-sdk/include/xrb_plugin.h', 'packages/sdk/src/index.ts', 'tools/embedded/embedded.ts', 'tools/fetch-deps/deps.lock.json', 'tsconfig.json', 'package.json', '.github/workflows/ci.yml', '.github/actions/app-token/action.yml', '.github/workflows/openspec-finalization.yml']) {
    assert.equal(node.test(file), true, `Node selection: ${file}`); assert.equal(embedded.test(file), true, `embedded selection: ${file}`);
  }
  for (const file of ['docs/example.md', 'openspec/changes/example/tasks.md']) assert.equal(embedded.test(file), false);
  assert.equal(embedded.test('native/host/src/main.cpp'), true);
  assert.match(job('embedded'), /needs\.changes\.outputs\.embedded == 'true'/);
  for (const command of ['pnpm install --frozen-lockfile --ignore-scripts', 'pnpm check:types', 'pnpm test:embedded --workspace=.artifacts/embedded-boundary-ci', 'test/native-build.fixture.ts', 'test/service-artifacts.test.ts', 'test/package-staging.test.ts']) assert.ok(job('embedded').includes(command), command);
  assert.doesNotMatch(job('embedded'), /fetch-deps\.mjs|--open|--core-only|lfs: true|secrets\./);
  assert.match(job('node'), /pnpm check:types/);
});

test('only a scheduled main failure automatically enters nightly triage with separate read and write credentials', () => {
  assert.match(triage, /github\.event\.workflow_run\.event == 'schedule' && github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(triage, /workflows: \[CI\]/);
  assert.match(triage, /actions: read/);
  assert.match(triage, /issues: write/);
  assert.match(triage, /GH_TOKEN: \$\{\{ steps\.bot\.outputs\.token \}\}/);
  assert.match(triage, /GH_WORKFLOW_TOKEN: \$\{\{ github\.token \}\}/);
});
