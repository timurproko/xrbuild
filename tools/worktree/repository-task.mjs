// Local/private delivery records. No staging, PR creation, push, merge or worktree cleanup commands.
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const BRANCH = /^(?:feat|fix|refactor|docs|test|chore|ci|perf)\/[a-z0-9][a-z0-9-]*$/;
const inside = (root, file) => { const relative = path.relative(root, file); return !relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
const canonical = file => realpathSync.native(path.resolve(file));
function git(root, args, acceptFailure = false, env = process.env) {
  const isolated = Object.fromEntries(Object.entries(env).filter(([key]) => !/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/i.test(key)));
  const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'filter.lfs.process=', '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.clean=', '-c', 'filter.lfs.required=false', '-C', root, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024, env: isolated });
  if (result.status !== 0 && !acceptFailure) throw new Error('Repository operation failed; review the local configuration and access');
  return acceptFailure ? result.status === 0 : ['status', 'diff', 'ls-files'].includes(args[0]) ? result.stdout : result.stdout.trimEnd();
}
async function plain(file, missing = false) {
  const absolute = path.resolve(file), base = path.parse(absolute).root; let current = base;
  for (const segment of absolute.slice(base.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch(error => { if (missing && error.code === 'ENOENT') return null; throw error; });
    if (stat && (stat.isSymbolicLink() || stat.isFile() && stat.nlink !== 1 || !stat.isFile() && !stat.isDirectory())) throw new Error('Repository paths must be plain, unlinked paths');
  }
  return absolute;
}
export function routeRepositoryPaths(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 4096) throw new Error('Explicit affected paths are required');
  const core = [], privatePaths = [], local = [];
  for (const file of paths) {
    if (typeof file !== 'string' || !file || file.length > 512 || file.includes('\\') || file.includes('\0') || file.includes(':') || path.isAbsolute(file) || file.split('/').some(segment => !segment || segment === '.' || segment === '..' || /[. ]$/.test(segment)) || /(?:^|\/)\.git(?:\/|$)/.test(file)) throw new Error('Affected paths must be safe repository-relative source paths');
    if (file.split('/')[0].toLowerCase() === '.xrbuild' && file.split('/')[0] !== '.xrbuild') throw new Error('Private workspace paths must use the canonical .xrbuild spelling');
    if (file === '.xrbuild' || file.startsWith('.xrbuild/')) privatePaths.push(file);
    else if (file.startsWith('.artifacts/')) local.push(file);
    else core.push(file);
  }
  return { scope: core.length && privatePaths.length ? 'paired' : privatePaths.length ? 'private' : core.length ? 'core' : 'local', core, private: privatePaths, local };
}
export function remoteIdentity(value, allowLocal = false, transportNeutral = false) {
  if (typeof value !== 'string' || !value || /[\x00-\x20]/.test(value)) throw new Error('Expected remote identity is required');
  const scp = /^git@([^:]+):(.+)$/.exec(value);
  if (scp) return `${transportNeutral ? 'repo' : 'ssh'}://${scp[1].toLowerCase()}/${scp[2].replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')}`;
  try {
    const url = new URL(value);
    if (url.protocol === 'file:' && allowLocal) return `local:${canonical(decodeURIComponent(url.pathname).replace(/^\/([a-zA-Z]:)/, '$1'))}`;
    if (!['https:', 'ssh:'].includes(url.protocol) || url.password || url.search || url.hash || url.protocol === 'https:' && url.username) throw new Error();
    const user = !transportNeutral && url.protocol === 'ssh:' && url.username && url.username !== 'git' ? `${url.username}@` : '';
    const port = url.port && !(url.protocol === 'ssh:' && url.port === '22') ? `:${url.port}` : '';
    return `${transportNeutral ? 'repo:' : url.protocol}//${user}${url.hostname.toLowerCase()}${port}/${url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')}`;
  } catch {
    if (allowLocal && (path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value))) return `local:${canonical(value)}`;
    throw new Error('Remote identity must be an explicit credential-free HTTPS or SSH repository');
  }
}
export async function verifyTaskCore(core, expectedRemote, allowLocal = false) {
  await plain(core); const root = canonical(core), marker = await fs.lstat(path.join(root, '.git'));
  if (!marker.isFile() || marker.isSymbolicLink() || marker.nlink !== 1 || canonical(git(root, ['rev-parse', '--show-toplevel'])) !== root) throw new Error('Use the registered linked task worktree, never the primary checkout');
  const branch = git(root, ['branch', '--show-current']);
  if (!BRANCH.test(branch)) throw new Error('The task must use its own typed non-main branch');
  const common = canonical(path.resolve(root, git(root, ['rev-parse', '--git-common-dir'])));
  if (remoteIdentity(git(root, ['remote', 'get-url', 'origin']), allowLocal) !== remoteIdentity(expectedRemote, allowLocal)) throw new Error('Core remote does not match the expected repository');
  return { root, branch, common, remote: remoteIdentity(expectedRemote, allowLocal), head: git(root, ['rev-parse', 'HEAD']) };
}
export async function verifyPrivateRepository(core, expectedRemote, branch, allowLocal = false) {
  const root = path.join(core.root, '.xrbuild'); await plain(root);
  const marker = await fs.lstat(path.join(root, '.git'));
  if (!marker.isDirectory() || marker.isSymbolicLink()) throw new Error('Private workspace must be an independent clone, not a worktree/submodule/link');
  if (!BRANCH.test(branch) || git(root, ['branch', '--show-current']) !== branch) throw new Error('Private task branch does not match');
  if (remoteIdentity(git(root, ['remote', 'get-url', 'origin']), allowLocal) !== remoteIdentity(expectedRemote, allowLocal)) throw new Error('Private remote does not match the expected repository');
  const common = canonical(path.resolve(root, git(root, ['rev-parse', '--git-common-dir'])));
  if (common !== canonical(path.join(root, '.git')) || inside(core.common, common) || inside(common, core.common)) throw new Error('Private Git storage must be independent');
  const alternate = await fs.readFile(path.join(common, 'objects/info/alternates'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  if (alternate.trim()) throw new Error('Private Git object alternates are forbidden');
  const lfs = git(root, ['config', '--get', 'lfs.storage'], true) ? git(root, ['config', '--get', 'lfs.storage']) : null;
  if (lfs && !inside(common, path.resolve(root, lfs))) throw new Error('Private LFS storage must be independent');
  const inspect = async directory => {
    await plain(directory);
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name); await plain(file);
      if (entry.isDirectory()) await inspect(file);
    }
  };
  await inspect(path.join(common, 'objects'));
  if (await fs.lstat(path.join(common, 'lfs')).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) await inspect(path.join(common, 'lfs'));
  return { root: canonical(root), branch, common, remote: remoteIdentity(expectedRemote, allowLocal), head: git(root, ['rev-parse', 'HEAD']), lfs: 'not-implicitly-materialized' };
}
export async function provisionTaskPrivate(options) {
  const { core: root, coreRemote, privateRemote, privateBranch, paths, allowLocal = false } = options;
  const route = routeRepositoryPaths(paths), core = await verifyTaskCore(root, coreRemote, allowLocal);
  if (!route.private.length) return { status: 'not-needed', scope: route.scope };
  if (!BRANCH.test(privateBranch)) throw new Error('A typed private task branch is required');
  if (remoteIdentity(coreRemote, allowLocal, true) === remoteIdentity(privateRemote, allowLocal, true)) throw new Error('Core and private repository identities must differ');
  const destination = path.join(core.root, '.xrbuild'); await plain(destination, true);
  if (await fs.lstat(destination).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) throw new Error('Private destination already exists; validate or preserve it instead of replacing it');
  // No local hard links, alternates, reference clones or automatic LFS downloads.
  const env = { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' };
  git(core.root, ['clone', '--no-local', '--no-hardlinks', '--no-checkout', '--', privateRemote, destination], false, env);
  git(destination, ['switch', '-c', privateBranch, 'refs/remotes/origin/main'], false, env);
  const privateRepo = await verifyPrivateRepository(core, privateRemote, privateBranch, allowLocal);
  return { status: 'provisioned', scope: route.scope, core, private: privateRepo, instructionsRequiredBeforeEdits: true };
}
async function workFingerprint(root) {
  const hash = createHash('sha256');
  hash.update(git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
  hash.update(git(root, ['ls-files', '--stage', '-z']));
  hash.update(git(root, ['diff', '--no-ext-diff', '--no-textconv', '--raw', '-z', 'HEAD']));
  const files = [...new Set(git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))].sort();
  for (const relative of files) {
    const file = path.join(root, relative); hash.update(`${relative}\0`);
    const stat = await fs.lstat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) { hash.update('missing\0'); continue; }
    await plain(file);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('Repository source state contains linked files or nested repositories');
    hash.update(`file:${stat.mode & 0o777}:${stat.size}\0`); const handle = await fs.open(file, 'r');
    try { for await (const bytes of handle.createReadStream({ autoClose: false })) hash.update(bytes); } finally { await handle.close(); }
  }
  return hash.digest('hex');
}
export async function repositoryInventory(options) {
  const route = routeRepositoryPaths(options.paths), core = await verifyTaskCore(options.core, options.coreRemote, options.allowLocal);
  const repositories = {};
  if (route.core.length || options.requiredCore) repositories.core = { ...core, work: await workFingerprint(core.root) };
  if (route.private.length) {
    const repo = await verifyPrivateRepository(core, options.privateRemote, options.privateBranch, options.allowLocal);
    repositories.private = { ...repo, work: await workFingerprint(repo.root) };
  }
  let dependency = 'not-required';
  if (options.requiredCore) {
    if (!/^[a-f0-9]{40}$/.test(options.requiredCore)) throw new Error('Core dependency must be an immutable commit');
    dependency = git(core.root, ['merge-base', '--is-ancestor', options.requiredCore, 'refs/remotes/origin/main'], true) && git(core.root, ['merge-base', '--is-ancestor', options.requiredCore, core.head], true) ? 'merged' : 'blocked-or-unknown';
  }
  return { version: 1, scope: route.scope, paths: route, repositories, requiredCore: options.requiredCore ?? null, dependency, delivery: 'manual' };
}
export async function recordTestedRepositories(options, tested) {
  const current = await repositoryInventory(options);
  if (!tested || tested.confirm !== 'record-tested-revisions' || !tested.results || typeof tested.results !== 'object' || Array.isArray(tested.results)) throw new Error('Explicit tested-revision attestation is required');
  if (current.dependency === 'blocked-or-unknown') throw new Error('Required core revision is not verified merged');
  for (const [role, repo] of Object.entries(current.repositories)) {
    const accepted = tested.results[role];
    if (!accepted || accepted.head !== repo.head || accepted.work !== repo.work || accepted.result !== 'passed') throw new Error('Tested revision/work state is missing or stale');
  }
  return { ...current, testedAt: new Date().toISOString(), tested: true };
}
export async function verifyTestedRepositories(options, record) {
  const current = await repositoryInventory(options);
  if (!record?.tested || record.scope !== current.scope || JSON.stringify(record.paths) !== JSON.stringify(current.paths) || record.requiredCore !== current.requiredCore || current.dependency === 'blocked-or-unknown') throw new Error('Tested repository record is not applicable');
  for (const [role, repo] of Object.entries(current.repositories)) if (record.repositories?.[role]?.head !== repo.head || record.repositories?.[role]?.work !== repo.work || record.repositories?.[role]?.branch !== repo.branch || record.repositories?.[role]?.root !== repo.root || record.repositories?.[role]?.common !== repo.common || record.repositories?.[role]?.remote !== repo.remote) throw new Error('A tested repository revision or work state changed; retest');
  return { valid: true, scope: current.scope, delivery: 'manual' };
}
export function publicRepositorySummary(record) {
  return { scope: record.scope, coreRequired: !!record.paths?.core?.length, privateRequired: !!record.paths?.private?.length, tested: record.tested === true, dependency: record.dependency ?? 'not-required', delivery: 'manual' };
}
async function localJson(core, file) {
  const absolute = path.resolve(core, file), artifacts = path.join(core, '.artifacts');
  if (!inside(artifacts, absolute) || absolute === artifacts) throw new Error('Repository records/configuration must stay in ignored task artifacts');
  await plain(absolute); const stat = await fs.lstat(absolute);
  if (!stat.isFile() || stat.size > 65536 || !git(core, ['check-ignore', '--quiet', '--', absolute], true)) throw new Error('Repository records/configuration must be bounded ignored local files');
  const handle = await fs.open(absolute, 'r');
  try {
    const opened = await handle.stat();
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.nlink !== 1) throw new Error();
    const bytes = Buffer.alloc(65537); let size = 0;
    while (size < bytes.length) { const read = await handle.read(bytes, size, bytes.length - size, null); if (!read.bytesRead) break; size += read.bytesRead; }
    if (size > 65536) throw new Error();
    try { return JSON.parse(bytes.subarray(0, size).toString('utf8')); } catch { throw new Error('Invalid local repository record'); }
  } finally { await handle.close(); }
}
async function writeRecord(core, file, value) {
  const absolute = path.resolve(core, file), artifacts = path.join(core, '.artifacts');
  if (!inside(artifacts, absolute) || absolute === artifacts) throw new Error('Records must stay in ignored task artifacts');
  await plain(absolute, true);
  if (!git(core, ['check-ignore', '--quiet', '--', absolute], true)) throw new Error('Repository record destination must be ignored');
  await fs.mkdir(path.dirname(absolute), { recursive: true }); const temp = `${absolute}.${randomUUID()}.tmp`;
  const text = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(text) > 65536) throw new Error('Repository record exceeds 64 KiB');
  try {
    await fs.writeFile(temp, text, { flag: 'wx', mode: 0o600 });
    // Records are create-only; use a new explicit record name after retesting.
    await fs.link(temp, absolute).catch(error => { if (error.code === 'EEXIST') throw new Error('Repository record already exists; choose a new explicit record name'); throw error; });
  } finally { await fs.unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
export async function repositoryTaskMain(args = process.argv.slice(2)) {
  const [command, ...flags] = args;
  if (command === '--help') { console.log('task:repos <route|provision|inventory|record|verify> --config=.artifacts/repositories.json [--record=.artifacts/tested-repositories.json]'); return; }
  if (!['route', 'provision', 'inventory', 'record', 'verify'].includes(command)) throw new Error('Unknown repository task operation');
  const values = new Map();
  for (const flag of flags) { const match = /^(--config|--record)=(.+)$/.exec(flag); if (!match || values.has(match[1])) throw new Error('Unknown or duplicate repository task option'); values.set(match[1], match[2]); }
  const core = canonical(process.cwd()), config = await localJson(core, values.get('--config') ?? '.artifacts/repositories.json');
  // Local fixture remotes are a programmatic test option, never enabled by a task config.
  const options = { ...config, core, allowLocal: false };
  const route = routeRepositoryPaths(options.paths);
  if (command === 'route') { await verifyTaskCore(core, options.coreRemote); console.log(JSON.stringify(publicRepositorySummary({ scope: route.scope, paths: route }))); return; }
  if (command === 'provision') { const result = await provisionTaskPrivate(options); console.log(JSON.stringify({ status: result.status, scope: result.scope, delivery: 'manual', instructionsRequiredBeforeEdits: !!result.private })); return; }
  const recordPath = values.get('--record') ?? (command === 'inventory' ? '.artifacts/repository-inventory.json' : '.artifacts/tested-repositories.json');
  if (command === 'verify') { console.log(JSON.stringify(await verifyTestedRepositories(options, await localJson(core, recordPath)))); return; }
  const record = command === 'record' ? await recordTestedRepositories(options, config.tested) : await repositoryInventory(options);
  await writeRecord(core, recordPath, record); console.log(JSON.stringify(publicRepositorySummary(record)));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) repositoryTaskMain().catch(error => { console.error(error.code ? 'Repository task filesystem operation failed; inspect the ignored local configuration/records' : error.message || 'Repository task validation failed'); process.exitCode = 1; });
