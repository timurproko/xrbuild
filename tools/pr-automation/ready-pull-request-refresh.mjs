import { held, samePullSnapshot } from './snapshot.mjs';

const FULL_SHA = /^[0-9a-f]{40}$/;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** Only freshly read, open, ready PRs with both sides in this repository may be updated. */
export function classifyRefreshCandidate(pull, repository) {
  const number = pull?.number, headSha = pull?.head?.sha;
  const skip = reason => ({ disposition: 'skipped', number, headSha, reason });
  const fail = reason => ({ disposition: 'failed', number: Number.isSafeInteger(number) ? number : null, headSha: null, reason });
  if (!Number.isSafeInteger(number) || number < 1) return fail('malformed pull request number');
  if (pull.state !== 'open') return skip('pull request is not open');
  if (typeof pull.draft !== 'boolean') return fail('draft state is malformed');
  if (pull.draft) return skip('draft pull request');
  if (held(pull)) return skip('delivery-hold pauses automatic refresh');
  if (pull.base?.ref !== 'main') return skip('base branch is not main');
  if (pull.base?.repo?.full_name !== repository) return skip('base repository is not the governed repository');
  if (pull.head?.repo?.full_name !== repository) return skip('head repository is a fork or unavailable');
  if (typeof headSha !== 'string' || !FULL_SHA.test(headSha)) return fail('head SHA is malformed or missing');
  return { disposition: 'eligible', number, headSha };
}

export function decideRefresh(eligibility, comparison, targetSha) {
  if (eligibility.disposition !== 'eligible') return eligibility;
  if (!FULL_SHA.test(targetSha ?? '') || !Number.isSafeInteger(comparison?.behind_by) || comparison.behind_by < 0) {
    return { ...eligibility, disposition: 'failed', reason: 'target or comparison response is malformed' };
  }
  return { ...eligibility, disposition: comparison.behind_by === 0 ? 'current' : 'update', targetSha };
}

/** Expected races/conflicts are bounded outcomes, not permission to force a branch update. */
export function interpretBranchUpdate(decision, response) {
  if (response.status === 202) return { ...decision, disposition: 'updated' };
  const message = typeof response.body?.message === 'string' ? response.body.message : '';
  if (response.status === 422) {
    if (/expected head sha/i.test(message)) return { ...decision, disposition: 'deferred', reason: 'head changed after it was read' };
    if (/no new commits/i.test(message)) return { ...decision, disposition: 'current' };
    if (/conflict/i.test(message)) return { ...decision, disposition: 'blocked', reason: 'merge conflict requires manual resolution' };
  }
  // Do not echo arbitrary API text (or candidate-controlled data) into Actions logs or summaries.
  return { ...decision, disposition: 'failed', reason: `update-branch returned unexpected status ${response.status}` };
}

/** List before writing, then independently reconcile candidates against fresh main and head snapshots. */
export async function refreshReadyPullRequests({ repository, request, maxPages = MAX_PAGES }) {
  if (!/^[\w-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Invalid repository identity');
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES) throw new Error('Invalid pagination bound');
  const prefix = `/repos/${repository}`, numbers = new Set();
  for (let page = 1; ; page += 1) {
    if (page > maxPages) throw new Error('Open pull-request listing exceeded pagination bound');
    const listing = await request(`${prefix}/pulls?state=open&base=main&per_page=${PAGE_SIZE}&page=${page}`);
    if (!Array.isArray(listing.body) || listing.body.length > PAGE_SIZE) throw new Error('Malformed open pull-request listing');
    for (const pull of listing.body) {
      if (!Number.isSafeInteger(pull?.number) || pull.number < 1) throw new Error('Malformed listed pull-request number');
      numbers.add(pull.number);
    }
    if (listing.body.length < PAGE_SIZE) break;
  }

  const results = [];
  for (const number of numbers) {
    try {
      results.push(await refreshCandidate(number));
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) throw error;
      results.push({ disposition: 'failed', number, headSha: null, reason: 'candidate request failed' });
    }
  }
  return results;

  async function refreshCandidate(number) {
    const pull = (await request(`${prefix}/pulls/${number}`)).body;
    if (pull?.number !== number) return { disposition: 'failed', number, headSha: null, reason: 'pull request identity changed while reading' };
    const eligibility = classifyRefreshCandidate(pull, repository);
    if (eligibility.disposition !== 'eligible') return eligibility;
    const targetSha = (await request(`${prefix}/git/ref/heads/main`)).body?.object?.sha;
    if (typeof targetSha !== 'string' || !FULL_SHA.test(targetSha)) return { ...eligibility, disposition: 'failed', reason: 'target ref is malformed' };
    const comparison = (await request(`${prefix}/compare/${targetSha}...${eligibility.headSha}?per_page=1`)).body;
    const decision = decideRefresh(eligibility, comparison, targetSha);
    if (decision.disposition !== 'update') return decision;
    const current = (await request(`${prefix}/pulls/${number}`)).body;
    const currentTarget = (await request(`${prefix}/git/ref/heads/main`)).body?.object?.sha;
    if (!samePullSnapshot(pull, current, { draft: false }) || classifyRefreshCandidate(current, repository).disposition !== 'eligible' || currentTarget !== targetSha) {
      return { ...decision, disposition: 'deferred', reason: 'candidate, hold or target changed before refresh' };
    }
    const response = await request(`${prefix}/pulls/${number}/update-branch`, {
      method: 'PUT', body: { expected_head_sha: decision.headSha }, expected: [202, 422],
    });
    return interpretBranchUpdate(decision, response);
  }
}
