import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeployment } from '../src/deploy.mjs';

const config = { origin: 'https://example.test', repository: 'example/site', branch: 'main', verifyTimeoutMs: 50 };
const commit = 'a'.repeat(40);
function fixture(options = {}) {
  const calls = [];
  let time = 100000;
  const api = async (method, route, fields) => {
    calls.push([method, route, fields]);
    if (route.endsWith('/pages')) return { build_type: options.buildType ?? 'legacy', source: { branch: 'main', path: '/' }, cname: 'example.test', html_url: 'https://example.test/', https_enforced: true };
    if (route.includes('/pages/builds?')) {
      if (options.missingBuild) return [];
      return [{ commit, status: options.status ?? 'built', created_at: new Date(100000).toISOString() }];
    }
    throw new Error(`unexpected API route: ${route}`);
  };
  return { calls, deployment: createDeployment(config, { api, now: () => time, sleep: async () => { time += 5000; } }) };
}

test('requires branch-based Pages hosting before publication', async () => {
  const f = fixture({ buildType: 'workflow' });
  await assert.rejects(f.deployment.ready(), /configured branch and folder/);
  assert.ok(!f.calls.some((call) => call[0] === 'POST'));
});

test('waits for the exact publication commit without dispatching a workflow', async () => {
  const f = fixture();
  const result = await f.deployment.deploy(commit);
  assert.equal(result.link, `https://github.com/example/site/commit/${commit}`);
  assert.ok(f.calls.some(([, route]) => route.includes('/pages/builds?')));
  assert.ok(!f.calls.some(([method]) => method === 'POST'));
});

test('a missing matching Pages build is not publication success', async () => {
  const f = fixture({ missingBuild: true });
  await assert.rejects(f.deployment.deploy(commit), /Timed out waiting for Pages/);
});

test('a failed Pages build is not publication success', async () => {
  const f = fixture({ status: 'errored' });
  await assert.rejects(f.deployment.deploy(commit), /Site deployment failed/);
});
