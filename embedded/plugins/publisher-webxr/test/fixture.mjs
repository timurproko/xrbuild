import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProductionPublisher } from '../src/production.mjs';

/** Disposable bare repository, seeded site, simulated public origin and a publisher wired to them. */
export const config = { origin: 'https://example.test', repository: 'example/site', branch: 'apps', seedBranch: 'gh-pages', routePrefix: 'apps', verifyTimeoutMs: 15 };
export const id = (last) => `11111111-1111-4111-8111-11111111111${last}`;
export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();

export async function fixture(t, options = {}) {
  const fixtureConfig = options.config ?? config;
  const scratch = process.env.XRB_TEST_ROOT;
  if (!scratch || !path.isAbsolute(scratch)) throw new Error('Explicit private test scratch required');
  await fs.mkdir(scratch, {recursive:true});
  const root = await fs.mkdtemp(path.join(scratch, 'publisher-pages-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git'), seed = path.join(root, 'seed');
  await fs.mkdir(seed);
  git(root, 'init', '--bare', remote);
  git(seed, 'init', '-b', 'gh-pages');
  git(seed, 'config', 'user.name', 'Test'); git(seed, 'config', 'user.email', 'test@example.invalid');
  const site = fixtureConfig.sitePath && fixtureConfig.sitePath !== '/' ? path.join(seed, fixtureConfig.sitePath.slice(1)) : seed;
  await fs.mkdir(site, { recursive: true });
  await fs.writeFile(path.join(site, 'index.html'), 'Root stays here');
  await fs.writeFile(path.join(site, 'CNAME'), 'example.test\n');
  await fs.writeFile(path.join(site, '.nojekyll'), '');
  await fs.mkdir(path.join(site, 'legacy'));
  await fs.writeFile(path.join(site, 'legacy', 'index.html'), 'Legacy app');
  if (site !== seed) await fs.writeFile(path.join(seed, 'source.txt'), 'Project source stays here');
  git(seed, 'add', '.'); git(seed, 'commit', '-m', 'legacy site');
  git(seed, 'remote', 'add', 'origin', remote); git(seed, 'push', 'origin', 'gh-pages');
  const app = path.join(root, 'app'); await fs.mkdir(app);
  await fs.writeFile(path.join(app, 'index.html'), '<html>New app</html>');
  const associationsFile = path.join(root, 'associations.json');
  await fs.writeFile(associationsFile, JSON.stringify({ version: 1, records: [] }));
  const storageRoot = path.join(root, 'cache');
  let ready = options.ready ?? true;
  let visible = true;
  const fetch = async (input) => {
    const url = new URL(input);
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    let body;
    const siteRelative = fixtureConfig.sitePath && fixtureConfig.sitePath !== '/' ? `${fixtureConfig.sitePath.slice(1)}/` : '';
    try { body = git(root, '--git-dir', remote, 'show', `${fixtureConfig.branch}:${siteRelative}${relative}`); }
    catch { return new Response('Not found', { status: 404 }); }
    if (!visible && relative.endsWith('/.xrb-publication.json')) return new Response('Unavailable', { status: 503 });
    return new Response(body, { status: 200 });
  };
  const deployments = [];
  const plugin = createProductionPublisher(fixtureConfig, {
    storageRoot, remoteUrl: remote, associationsFile, fetch, sleep: async () => {},
    hostingReady: async () => { if (!ready) throw new Error('branch deployment not ready'); },
    beforePush: options.beforePush ? () => options.beforePush({ root, remote, seed }) : undefined,
    deployment: { deploy: async (sha) => { deployments.push(sha); if ((options.failFirstDeploy && deployments.length === 1) || options.failDeploy?.(deployments.length)) throw new Error('Pages deployment failed'); return { link: `https://example.test/builds/${deployments.length}` }; } },
  });
  return { root, remote, seed, app, associationsFile, plugin, deployments, fetch, setReady(value) { ready = value; }, setVisible(value) { visible = value; } };
}

export const log = () => {};
