import { execFile } from 'node:child_process';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function gh(method, route, fields) {
  const args = ['api', route, '-X', method, '-H', 'Accept: application/vnd.github+json'];
  for (const [key, value] of Object.entries(fields ?? {})) args.push('-f', `${key}=${value}`);
  return new Promise((resolve, reject) => execFile('gh', args, {
    windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  }, (error, stdout) => {
    if (error) return reject(new Error('Public repository authentication or Pages API unavailable; sign in with gh auth login and check repository access.'));
    try { resolve(stdout.trim() ? JSON.parse(stdout) : null); }
    catch { reject(new Error('Public repository returned an invalid response.')); }
  }));
}

export function createDeployment(config, deps = {}) {
  const api = deps.api ?? gh;
  const sleep = deps.sleep ?? wait;
  const now = deps.now ?? Date.now;
  const repo = `repos/${config.repository}`;
  const commitUrl = (commit) => `https://github.com/${config.repository}/commit/${commit}`;

  async function ready() {
    const pages = await api('GET', `${repo}/pages`);
    if (pages?.build_type !== 'legacy' || pages.source?.branch !== config.branch || pages.source?.path !== (config.sitePath ?? '/') ||
        pages.cname !== new URL(config.origin).host || !pages.https_enforced || new URL(pages.html_url).origin !== config.origin)
      throw new Error('Production hosting is not serving the configured branch and folder through Pages.');
  }

  async function deploy(commit, log = () => {}) {
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('invalid public site commit');
    await ready();
    const started = now();
    const deadline = started + (config.verifyTimeoutMs ?? 300000);
    const link = commitUrl(commit);
    log(`Waiting for Pages to deploy ${commit.slice(0, 12)} from the publication branch.`);
    while (now() < deadline) {
      const builds = await api('GET', `${repo}/pages/builds?per_page=30`);
      const build = (Array.isArray(builds) ? builds : []).find((item) => item.commit === commit && Date.parse(item.created_at) >= started - 30000);
      if (build) {
        if (build.status === 'built') return { link };
        if (build.status === 'errored') throw new Error(`Site deployment failed; inspect ${link}`);
      }
      await sleep(3000);
    }
    throw new Error(`Timed out waiting for Pages to deploy ${commit.slice(0, 12)}; inspect ${link} before retrying.`);
  }
  return { ready, deploy };
}
