import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const workflow = read('../../.github/workflows/ready-pull-request-refresh.yml');
const docs = read('../../.github/workflows/docs-auto-merge.yml');
const cli = read('./refresh-ready-pull-requests.mjs');

// Keep security-sensitive wiring explicit: a workflow_run event must never select candidate scripts/artifacts.
test('refresh listens only to main PR closures and the existing docs completion bridge', () => {
  const triggers = workflow.split(/^on:\r?\n/m)[1].split(/^permissions:/m)[0];
  assert.match(triggers, /pull_request_target:\s+branches: \[main\]\s+types: \[closed\]/);
  const docsName = docs.match(/^name: (.+)$/m)[1];
  assert.ok(triggers.includes(`workflows: [${docsName}]`));
  assert.match(triggers, /types: \[completed\]/);
  assert.deepEqual([...triggers.matchAll(/^  ([\w_]+):/gm)].map(match => match[1]), ['pull_request_target', 'workflow_run']);
  const gate = workflow.match(/    if: >-\r?\n([\s\S]*?)    runs-on:/)[1].trim().replace(/\s+/g, ' ');
  assert.equal(gate, "github.event.repository.default_branch == 'main' && (github.event_name == 'workflow_run' || github.event.pull_request.merged == true)");
});

test('only trusted default-branch files execute with a read-only workflow token and no installs', () => {
  assert.match(workflow, /^permissions:\s+contents: read\s+concurrency:/m);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}\s+persist-credentials: false/);
  assert.equal([...workflow.matchAll(/uses: actions\/checkout@/g)].length, 1);
  assert.doesNotMatch(workflow, /pull_request\.head|workflow_run\.(head|artifacts)|download-artifact|working-directory:|secrets: inherit|GITHUB_TOKEN|github\.token|npm |pnpm |npx /);
  assert.doesNotMatch(workflow, /^\s+(contents|pull-requests|actions|issues|checks): write$/m);
  assert.deepEqual([...workflow.matchAll(/^\s+run: (.+)$/gm)].map(match => match[1]), ['node tools/pr-automation/refresh-ready-pull-requests.mjs']);
  for (const use of workflow.matchAll(/uses: (\S+)/g)) assert.match(use[1], /^actions\/[\w-]+@[0-9a-f]{40}$/);
});

test('current-repository App token is scoped and passed only to the trusted entrypoint', () => {
  assert.match(workflow, /uses: actions\/create-github-app-token@[0-9a-f]{40}/);
  for (const binding of [
    'app-id: ${{ vars.XRB_BOT_APP_ID }}', 'private-key: ${{ secrets.XRB_BOT_PRIVATE_KEY }}',
    'owner: ${{ github.repository_owner }}', 'repositories: ${{ github.event.repository.name }}',
    'permission-contents: write', 'permission-pull-requests: write', 'BRANCH_REFRESH_TOKEN: ${{ steps.app.outputs.token }}',
  ]) assert.ok(workflow.includes(binding), binding);
  assert.deepEqual([...workflow.matchAll(/^\s+permission-([\w-]+):/gm)].map(match => match[1]), ['contents', 'pull-requests']);
  assert.ok(workflow.indexOf('persist-credentials: false') < workflow.indexOf('id: app'));
  assert.match(cli, /env\.BRANCH_REFRESH_TOKEN/);
  assert.doesNotMatch(cli, /env\.(GITHUB_TOKEN|GH_TOKEN)|env\['(?:GITHUB_TOKEN|GH_TOKEN)'\]/);
  assert.match(cli, /env\.GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(workflow, /gh pr (?:merge|ready)|\/merge\b|auto-merge enable|\/statuses|\/check-runs/);
});

test('passes serialize without canceling active updates and have a fixed runtime bound', () => {
  assert.match(workflow, /^concurrency:\s+group: ready-pull-request-refresh\s+cancel-in-progress: false/m);
  assert.match(workflow, /^    timeout-minutes: 10$/m);
  assert.doesNotMatch(workflow, /continue-on-error:|cancel-in-progress: true/);
});
