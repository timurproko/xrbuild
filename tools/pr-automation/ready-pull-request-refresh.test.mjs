import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyRefreshCandidate, decideRefresh, interpretBranchUpdate, refreshReadyPullRequests } from './ready-pull-request-refresh.mjs';
import { createGitHubRequest, runRefresh } from './refresh-ready-pull-requests.mjs';

const repository = 'example/xrbuild', head = 'a'.repeat(40), target = 'b'.repeat(40);
const candidate = (number = 1) => ({ number, state: 'open', draft: false,
  base: { ref: 'main', repo: { full_name: repository } }, head: { sha: head, repo: { full_name: repository } } });

function fixture({ pulls = [candidate()], behind = 1, update = { status: 202 }, override = () => undefined } = {}) {
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, ...options });
    const custom = override(path, options);
    if (custom !== undefined) return custom;
    if (path.includes('/pulls?')) return { body: pulls.map(pull => ({ number: pull.number })) };
    if (/\/pulls\/\d+$/.test(path)) return { body: pulls.find(pull => pull.number === Number(path.split('/').at(-1))) };
    if (path.endsWith('/git/ref/heads/main')) return { body: { object: { sha: target } } };
    if (path.includes('/compare/')) return { body: { behind_by: behind } };
    if (path.endsWith('/update-branch')) return update;
    assert.fail(`unexpected API call ${path}`);
  };
  return { calls, request, run: () => refreshReadyPullRequests({ repository, request }) };
}

const mutations = calls => calls.filter(call => call.method && call.method !== 'GET');

test('only open ready same-repository main candidates are eligible; malformed identity fails', () => {
  assert.equal(classifyRefreshCandidate(candidate(), repository).disposition, 'eligible');
  for (const change of [
    { state: 'closed' }, { draft: true }, { base: { ...candidate().base, ref: 'other' } },
    { base: { ...candidate().base, repo: { full_name: 'other/xrbuild' } } },
    { head: { ...candidate().head, repo: { full_name: 'fork/xrbuild' } } }, { head: null },
  ]) assert.equal(classifyRefreshCandidate({ ...candidate(), ...change }, repository).disposition, 'skipped');
  for (const pull of [null, { ...candidate(), number: 0 }, { ...candidate(), number: '1' },
    { ...candidate(), draft: undefined }, { ...candidate(), head: { ...candidate().head, sha: 'not-a-sha' } }]) {
    assert.equal(classifyRefreshCandidate(pull, repository).disposition, 'failed');
  }
});

test('comparison requires valid target and nonnegative integer behind count', () => {
  const eligible = classifyRefreshCandidate(candidate(), repository);
  assert.equal(decideRefresh(eligible, { behind_by: 0 }, target).disposition, 'current');
  assert.equal(decideRefresh(eligible, { behind_by: 1 }, target).disposition, 'update');
  for (const value of [-1, 0.1, '1', null, undefined]) {
    assert.equal(decideRefresh(eligible, { behind_by: value }, target).disposition, 'failed');
  }
  assert.equal(decideRefresh(eligible, { behind_by: 1 }, 'bad').disposition, 'failed');
  assert.deepEqual(decideRefresh({ disposition: 'skipped' }, {}, target), { disposition: 'skipped' });
});

test('accepted updates, expected-head races, already-current heads and conflicts are distinct', () => {
  const decision = { disposition: 'update', number: 1, headSha: head, targetSha: target };
  for (const [status, message, disposition] of [
    [202, '', 'updated'], [422, 'Expected head sha did not match', 'deferred'],
    [422, 'No new commits', 'current'], [422, 'Merge conflict', 'blocked'],
    [422, 'unknown error with secret', 'failed'], [500, 'secret', 'failed'],
  ]) {
    const result = interpretBranchUpdate(decision, { status, body: { message } });
    assert.equal(result.disposition, disposition);
    assert.doesNotMatch(JSON.stringify(result), /secret/);
  }
});

test('stale head is freshly compared and the only mutation is expected-head update-branch', async () => {
  const f = fixture();
  assert.deepEqual(await f.run(), [{ disposition: 'updated', number: 1, headSha: head, targetSha: target }]);
  assert.deepEqual(f.calls.map(call => call.path), [
    `/repos/${repository}/pulls?state=open&base=main&per_page=100&page=1`, `/repos/${repository}/pulls/1`,
    `/repos/${repository}/git/ref/heads/main`, `/repos/${repository}/compare/${target}...${head}?per_page=1`,
    `/repos/${repository}/pulls/1/update-branch`,
  ]);
  assert.deepEqual(mutations(f.calls), [{ path: `/repos/${repository}/pulls/1/update-branch`, method: 'PUT', body: { expected_head_sha: head }, expected: [202, 422] }]);
});

test('current and ineligible candidates receive no mutation, even when listed as open', async () => {
  const f = fixture({ behind: 0, pulls: [candidate(), { ...candidate(2), draft: true }, { ...candidate(3), state: 'closed' }] });
  assert.deepEqual((await f.run()).map(result => result.disposition), ['current', 'skipped', 'skipped']);
  assert.deepEqual(mutations(f.calls), []);
  assert.equal(f.calls.filter(call => call.path.includes('/compare/')).length, 1);
});

test('fresh head and fresh target, not listing data, bind each candidate decision', async () => {
  let mainReads = 0;
  const otherHead = 'c'.repeat(40), otherTarget = 'd'.repeat(40);
  const f = fixture({ pulls: [candidate(), { ...candidate(2), head: { ...candidate().head, sha: otherHead } }],
    override: path => path.endsWith('/git/ref/heads/main') ? { body: { object: { sha: mainReads++ ? otherTarget : target } } } : undefined });
  await f.run();
  assert.equal(mainReads, 2);
  assert.ok(f.calls.some(call => call.path.includes(`/compare/${otherTarget}...${otherHead}`)));
  assert.equal(mutations(f.calls)[1].body.expected_head_sha, otherHead);
});

test('pagination is bounded, deduplicated and completed before any branch write', async () => {
  const f = fixture({ override: path => path.includes('/pulls?')
    ? { body: path.endsWith('page=1') ? Array.from({ length: 100 }, () => ({ number: 1 })) : [{ number: 1 }] } : undefined });
  await f.run();
  assert.equal(f.calls[1].path.endsWith('page=2'), true);
  assert.equal(mutations(f.calls).length, 1);
  const overflow = fixture({ override: path => path.includes('/pulls?') ? { body: Array.from({ length: 100 }, () => ({ number: 1 })) } : undefined });
  await assert.rejects(overflow.run(), /pagination bound/);
  assert.equal(overflow.calls.length, 10);
  assert.deepEqual(mutations(overflow.calls), []);
  await assert.rejects(refreshReadyPullRequests({ repository, request: f.request, maxPages: 11 }), /pagination bound/);
});

test('malformed listings abort before writes, malformed candidate/ref/comparison fails closed', async () => {
  for (const listing of [{}, [null], [{ number: -1 }], Array(101).fill({ number: 1 })]) {
    const f = fixture({ override: path => path.includes('/pulls?') ? { body: listing } : undefined });
    await assert.rejects(f.run(), /Malformed/); assert.deepEqual(mutations(f.calls), []);
  }
  for (const [fragment, body] of [['/pulls/1', candidate(99)], ['/git/ref/heads/main', { object: { sha: 'bad' } }], ['/compare/', {}]]) {
    const f = fixture({ override: path => path.includes(fragment) ? { body } : undefined });
    assert.equal((await f.run())[0].disposition, 'failed'); assert.deepEqual(mutations(f.calls), []);
  }
});

test('a head race is deferred without retries; conflicts do not stop independent candidates', async () => {
  const f = fixture({ pulls: [candidate(), candidate(2), candidate(3)], override: (path, options) => {
    if (!options.method) return undefined;
    if (path.includes('/pulls/1/')) return { status: 422, body: { message: 'expected head sha mismatch' } };
    if (path.includes('/pulls/2/')) return { status: 422, body: { message: 'merge conflict' } };
  } });
  assert.deepEqual((await f.run()).map(result => result.disposition), ['deferred', 'blocked', 'updated']);
  assert.equal(mutations(f.calls).length, 3);
});

test('individual request failures continue, but credential failures abort immediately', async () => {
  const f = fixture({ pulls: [candidate(), candidate(2)], override: path => {
    if (path.endsWith('/pulls/1')) throw new Error('do not echo arbitrary text');
  } });
  const results = await f.run();
  assert.deepEqual(results.map(result => result.disposition), ['failed', 'updated']);
  assert.doesNotMatch(JSON.stringify(results), /arbitrary/);
  for (const status of [401, 403]) {
    const denied = fixture({ pulls: [candidate(), candidate(2)], override: path => {
      if (path.endsWith('/pulls/1')) throw Object.assign(new Error('credential rejected'), { status });
    } });
    await assert.rejects(denied.run(), /credential/);
    assert.equal(denied.calls.some(call => call.path.endsWith('/pulls/2')), false);
    assert.deepEqual(mutations(denied.calls), []);
  }
});

test('API client sends only the App token with HTTPS, timeout and redirect rejection', async () => {
  let seen;
  const request = createGitHubRequest({ token: 'test-app-token', fetchImpl: async (url, options) => {
    seen = { url, options }; return { status: 202, text: async () => '{"message":"accepted"}' };
  } });
  assert.equal((await request(`/repos/${repository}/pulls/1/update-branch`, { method: 'PUT', body: { expected_head_sha: head }, expected: [202, 422] })).status, 202);
  assert.equal(seen.url, `https://api.github.com/repos/${repository}/pulls/1/update-branch`);
  assert.equal(seen.options.headers.authorization, 'Bearer test-app-token');
  assert.equal(seen.options.redirect, 'error'); assert.ok(seen.options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(seen.options.body), { expected_head_sha: head });
  for (const apiUrl of ['http://example.invalid', 'https://user:pass@example.invalid', 'https://example.invalid?token=bad']) {
    assert.throws(() => createGitHubRequest({ token: 'app', apiUrl }), /HTTPS/);
  }
});

test('API failures carry only bounded status evidence, never arbitrary response or network text', async () => {
  const request = createGitHubRequest({ token: 'app', fetchImpl: async () => ({ status: 403, text: async () => 'secret contents' }) });
  await assert.rejects(request('/repos/example/xrbuild'), error => error.status === 403 && !error.message.includes('secret'));
  const invalid = createGitHubRequest({ token: 'app', fetchImpl: async () => ({ status: 200, text: async () => 'not JSON' }) });
  await assert.rejects(invalid('/repos/example/xrbuild'), /malformed JSON/);
  const network = createGitHubRequest({ token: 'app', fetchImpl: async () => { throw new Error('secret contents'); } });
  await assert.rejects(network('/repos/example/xrbuild'), error => /timed out/.test(error.message) && !error.message.includes('secret'));
});

function cliFixture(f) {
  const messages = [];
  const options = { env: { BRANCH_REFRESH_TOKEN: 'test-app-token', GITHUB_REPOSITORY: repository },
    readRepository: token => { assert.equal(token, 'test-app-token'); return repository; },
    report: async message => messages.push(message),
    fetchImpl: async (url, options) => {
      const response = await f.request(new URL(url).pathname + new URL(url).search, {
        method: options.method, ...(options.body ? { body: JSON.parse(options.body) } : {}),
      });
      return { status: response.status ?? 200, text: async () => JSON.stringify(response.body ?? {}) };
    } };
  return { options, messages };
}

test('CLI fails without the dedicated App token or matching governed checkout, before API access', async () => {
  const { options } = cliFixture(fixture());
  for (const env of [{ GH_TOKEN: 'ambient', GITHUB_TOKEN: 'ambient', GITHUB_REPOSITORY: repository },
    { ...options.env, GITHUB_REPOSITORY: 'example/other' }]) {
    await assert.rejects(runRefresh({ ...options, env }), /App token and governed repository/);
  }
  await assert.rejects(runRefresh({ ...options, readRepository: () => 'other/xrbuild' }), /does not match/);
});

test('CLI reports no candidates, accepted updates and failures truthfully without credentials', async () => {
  for (const [f, code, pattern] of [
    [fixture({ pulls: [] }), 0, /no open pull requests/],
    [fixture(), 0, /"disposition":"updated"/],
    [fixture({ update: { status: 422, body: { message: 'unrecognized test-app-token' } } }), 1, /"disposition":"failed"/],
    [fixture({ update: { status: 422, body: { message: 'merge conflict' } } }), 0, /"disposition":"blocked"/],
    [fixture({ override: () => { throw new Error('test-app-token'); } }), 1, /aborted/],
  ]) {
    const { options, messages } = cliFixture(f);
    assert.equal(await runRefresh(options), code);
    assert.match(messages.join('\n'), pattern); assert.doesNotMatch(messages.join('\n'), /test-app-token/);
  }
});
