import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { refreshReadyPullRequests } from './ready-pull-request-refresh.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function createGitHubRequest({ token, apiUrl = 'https://api.github.com', fetchImpl = fetch }) {
  const base = new URL(apiUrl);
  if (!token || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('An App token and HTTPS API endpoint are required');
  }
  return async (path, { method = 'GET', body, expected = [200] } = {}) => {
    let response, text;
    try {
      response = await fetchImpl(`${base.href.replace(/\/$/, '')}${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: {
          accept: 'application/vnd.github+json', authorization: `Bearer ${token}`,
          'x-github-api-version': '2022-11-28', 'user-agent': 'xr-build-ready-pr-refresh',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      text = await response.text();
    } catch {
      throw new Error('GitHub request failed or timed out');
    }
    if (!expected.includes(response.status)) {
      const error = new Error(`GitHub request returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    try {
      return { status: response.status, body: text ? JSON.parse(text) : undefined };
    } catch {
      throw new Error('GitHub returned malformed JSON');
    }
  };
}

function repositoryOfCheckout(token) {
  try {
    // Like governance, bind identity to this checkout, not the caller's cwd or repository environment alone.
    return execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20_000,
      env: { ...process.env, GH_TOKEN: token },
    }).trim();
  } catch {
    throw new Error('Cannot verify repository identity from the trusted checkout');
  }
}

export async function runRefresh({ env = process.env, readRepository = repositoryOfCheckout,
  fetchImpl = fetch, report = message => reportSummary(message, env.GITHUB_STEP_SUMMARY) } = {}) {
  // Deliberately no GITHUB_TOKEN/GH_TOKEN fallback: only the App's updates emit ordinary CI events.
  const token = env.BRANCH_REFRESH_TOKEN, repository = env.GITHUB_REPOSITORY;
  if (!token || !/^[\w-]+\/xrbuild$/.test(repository ?? '')) throw new Error('The branch-refresh App token and governed repository are required');
  if (readRepository(token) !== repository) throw new Error('Repository environment does not match the trusted checkout');
  const request = createGitHubRequest({ token, apiUrl: env.GITHUB_API_URL, fetchImpl });
  let results;
  try {
    results = await refreshReadyPullRequests({ repository, request });
  } catch {
    await report('Ready pull-request refresh aborted: listing or credential/request failure; inspect the job and App configuration');
    return 1;
  }
  if (results.length === 0) await report('Ready pull-request refresh: no open pull requests target main');
  for (const result of results) {
    const evidence = { disposition: result.disposition, pullRequest: result.number,
      headSha: /^[0-9a-f]{40}$/.test(result.headSha ?? '') ? result.headSha : null,
      targetSha: result.targetSha ?? null, reason: result.reason ?? null };
    await report(`Ready pull-request refresh: ${JSON.stringify(evidence)}`);
  }
  return results.some(result => result.disposition === 'failed') ? 1 : 0;
}

async function reportSummary(message, summaryPath) {
  console.log(message);
  if (summaryPath) await appendFile(summaryPath, `- ${message}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { process.exitCode = await runRefresh(); }
  catch {
    console.error('Ready pull-request refresh refused: verify the App token, governed checkout and HTTPS endpoint');
    process.exitCode = 1;
  }
}
