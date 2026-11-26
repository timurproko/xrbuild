import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { requiredProblems } from './required.mjs';

const ci = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const triage = readFileSync(new URL('../../.github/workflows/nightly-triage.yml', import.meta.url), 'utf8');
const delivery = readFileSync(new URL('../../.github/workflows/delivery.yml', import.meta.url), 'utf8');

function job(name) {
  const lines = ci.split(/\r?\n/);
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `missing ${name} job`);
  const next = lines.findIndex((line, index) => index > start && /^  [a-z][\w-]*:$/.test(line));
  return lines.slice(start, next < 0 ? undefined : next).join('\n');
}

test('only code and readiness events start PR CI; Delivery retains description edits', () => {
  const trigger = ci.match(/^  pull_request:\r?\n([\s\S]*?)(?=^  \w+:)/m)?.[1];
  assert.ok(trigger, 'missing explicit pull_request trigger');
  const types = trigger.match(/types: \[([^\]]+)\]/)?.[1].split(',').map(type => type.trim());
  assert.deepEqual(types, ['opened', 'synchronize', 'reopened', 'ready_for_review', 'converted_to_draft']);
  for (const action of ['edited', 'labeled', 'unlabeled']) assert.equal(types.includes(action), false, action);
  // No title/body input justifies restarting tests. Delivery independently validates the PR description.
  assert.doesNotMatch(ci, /pull_request\.(title|body)|GITHUB_EVENT_PATH/);
  assert.match(delivery, /types: \[opened, synchronize, ready_for_review, converted_to_draft, reopened, edited, closed\]/);
  assert.match(ci, /cancel-in-progress: true/);
  assert.ok(ci.includes("format('ci-pr-{0}', github.event.pull_request.number)"));
});

test('cancelled aggregates skip, while failures and intentional skips still reach the existing validator', () => {
  const required = job('required');
  assert.match(required, /^    name: CI required$/m); // Keep the protected check context unchanged.
  const gate = required.match(/^    if: \$\{\{ (.+) \}\}$/m)?.[1];
  assert.equal(gate, "!cancelled() && (github.event_name != 'pull_request' || !github.event.pull_request.draft)");
  // This expression uses only the common JS/Actions boolean subset; evaluate the actual workflow gate.
  const runs = new Function('cancelled', 'github', `return ${gate};`);
  for (const event of ['pull_request', 'push', 'schedule', 'workflow_dispatch']) {
    for (const draft of [false, true]) {
      for (const cancelled of [false, true]) {
        assert.equal(runs(() => cancelled, { event_name: event, event: { pull_request: { draft } } }),
          !cancelled && (event !== 'pull_request' || !draft), `${event}, draft=${draft}, cancelled=${cancelled}`);
      }
    }
  }
  // A status function avoids Actions' implicit success() gate: failed needs must still be aggregated.
  assert.doesNotMatch(gate, /always\(\)|success\(\)|needs\./);
  assert.match(required, /node tools\/pr-automation\/required\.mjs/);
});

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
  assert.match(required, /needs: \[readiness, changes, names, openspec, node, embedded, native\]/);
  assert.match(required, /!cancelled\(\) && \(github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft\)/);
  assert.match(required, /node tools\/pr-automation\/required\.mjs/);
  const ready = { readiness: { result: 'success', outputs: { ready: 'true' } }, changes: { result: 'success', outputs: { node: 'true', embedded: 'true' } },
    names: { result: 'success' }, openspec: { result: 'success' }, node: { result: 'success' }, embedded: { result: 'success' }, native: { result: 'skipped' } };
  assert.deepEqual(requiredProblems(ready, 'pull_request'), []);
  for (const result of ['skipped', 'failure', 'cancelled', undefined]) {
    for (const name of ['node', 'embedded']) assert.ok(requiredProblems({ ...ready, [name]: { result } }, 'pull_request').length, `${name}: ${result}`);
  }
  assert.ok(requiredProblems({ ...ready, readiness: { result: 'success', outputs: { ready: 'false' } } }, 'pull_request').length);
  for (const name of ['readiness', 'changes', 'names', 'openspec', 'node', 'embedded']) {
    assert.ok(requiredProblems({ ...ready, [name]: { ...ready[name], result: 'failure' } }, 'pull_request').length, `${name}: real failure`);
  }
  for (const event of ['schedule', 'workflow_dispatch']) {
    assert.deepEqual(requiredProblems({ ...ready, native: { result: 'success' } }, event), []);
    assert.ok(requiredProblems({ ...ready, native: { result: 'failure' } }, event).length, `${event}: real host failure`);
  }
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

test('only a scheduled default-branch failure automatically enters nightly triage with separate read and write credentials', () => {
  assert.match(triage, /github\.event\.workflow_run\.event == 'schedule' && github\.event\.workflow_run\.head_branch == github\.event\.repository\.default_branch/);
  assert.match(triage, /workflows: \[CI\]/);
  assert.match(triage, /actions: read/);
  assert.match(triage, /issues: write/);
  assert.match(triage, /GH_TOKEN: \$\{\{ steps\.bot\.outputs\.token \}\}/);
  assert.match(triage, /GH_WORKFLOW_TOKEN: \$\{\{ github\.token \}\}/);
});
