import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createDeployment } from './deploy.mjs';
import { readJson as readOwnedJson } from './ownership.mjs';


const INVENTORY_FILE = '.xrb-publications.json';
const MARKER_FILE = '.xrb-publication.json';
/** Publisher-owned release namespace at the site root: `<RELEASES_DIR>/<publicationId>/<releaseId>/` snapshots and `catalog.json`. */
const RELEASES_DIR = '.xrb-releases';
const CATALOG_FILE = 'catalog.json';
const ASSET_LINKS_FILE = path.join('.well-known', 'assetlinks.json');
const forbiddenNames = new Set(['.git', '.github', '.npmrc', '.yarnrc', '.gitconfig', '.xrbuild', '.xrb-publication.json', '.xrb-publications.json', '.xrb-releases', 'node_modules', 'xrb-project.json', 'pnpm-lock.yaml', 'package.json', 'claude.md']);
const forbiddenExtensions = new Set(['.key', '.map', '.p12', '.pem', '.pfx']);
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const RELEASE_ID = /^[a-z0-9]{1,16}-[0-9a-f]{12}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const stableVersion = (value) => typeof value === 'string' && VERSION.test(value) && value.split('.').every((part) => Number.isSafeInteger(Number(part)));
function compareVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}
const highestVersion = (releases) => releases.map((r) => r.version).filter(stableVersion).sort(compareVersions).at(-1) ?? null;

/** A release catalog read from storage; anything unexpected fails closed instead of resetting history. */
export function normalizeCatalog(value, publicationId) {
  if (value === null) return { version: 1, publicationId, releases: [], requested: null };
  if (value?.version !== 1 || value.publicationId !== publicationId || !Array.isArray(value.releases) || !('requested' in value))
    throw new Error('release catalog is corrupt or unsupported; refusing to change release history');
  const releases = value.releases.map((item) => {
    if (!item || typeof item.releaseId !== 'string' || !RELEASE_ID.test(item.releaseId)
      || (item.version !== null && !stableVersion(item.version))
      || typeof item.contentHash !== 'string' || !/^[0-9a-f]{64}$/.test(item.contentHash)
      || typeof item.indexHash !== 'string' || !/^[0-9a-f]{64}$/.test(item.indexHash)
      || !Number.isFinite(item.createdMs)
      || typeof item.slug !== 'string' || (item.slug !== '' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug))
      || (item.slug === '' ? !Array.isArray(item.files) || !item.files.every(validOwnedFile) : item.files !== undefined))
      throw new Error('release catalog entry is invalid; refusing to change release history');
    return { releaseId: item.releaseId, version: item.version, contentHash: item.contentHash, indexHash: item.indexHash, createdMs: item.createdMs, slug: item.slug, ...(item.slug === '' ? { files: [...item.files] } : {}) };
  });
  if (new Set(releases.map((r) => r.releaseId)).size !== releases.length) throw new Error('release catalog has duplicate releases');
  const versions = releases.map((r) => r.version).filter((v) => v !== null);
  if (new Set(versions).size !== versions.length) throw new Error('release catalog has duplicate versions');
  const requested = value.requested;
  if (requested !== null && (!requested || typeof requested.releaseId !== 'string' || !releases.some((r) => r.releaseId === requested.releaseId) || !Number.isFinite(requested.at)))
    throw new Error('release catalog decision is invalid; refusing to change release history');
  return { version: 1, publicationId, releases, requested: requested && { releaseId: requested.releaseId, at: requested.at } };
}

/** Precondition token: changes with this identity's retained releases or its latest deployment decision only. */
export const catalogRevision = (catalog) => createHash('sha256')
  .update(JSON.stringify([catalog.releases.map((r) => [r.releaseId, r.version, r.contentHash]), catalog.requested?.releaseId ?? null]))
  .digest('hex').slice(0, 24);
const newReleaseId = (contentHash, now = Date.now()) => `${now.toString(36)}-${contentHash.slice(0, 12)}`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readJson(file) {
  return fs.readFile(file, 'utf8').then(JSON.parse);
}

function validateConfig(config) {
  const origin = new URL(config.origin);
  if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('publisher origin must be a credential-free HTTPS origin');
  if (!/^[\w.-]+\/[\w.-]+$/.test(config.repository)) throw new Error('publisher repository must be owner/name');
  for (const [field, value] of [['branch', config.branch], ['seedBranch', config.seedBranch]]) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(value) || value.includes('..')) throw new Error(`publisher ${field} is invalid`);
  }
  if (!/^[a-z0-9-]+$/.test(config.routePrefix)) throw new Error('publisher routePrefix is invalid');
  const sitePath = config.sitePath ?? '/';
  if (sitePath !== '/' && !/^\/[A-Za-z0-9._-]+$/.test(sitePath)) throw new Error('publisher sitePath must be / or one repository folder');
  return { ...config, sitePath, origin: origin.origin, verifyTimeoutMs: Math.max(1, Number(config.verifyTimeoutMs) || 300_000) };
}

export function verifyHosting(config, pages) {
  if (pages.build_type !== 'legacy' || pages.source?.branch !== config.branch || pages.source?.path !== (config.sitePath ?? '/'))
    throw new Error(`Production hosting is not serving ${config.branch}${config.sitePath ?? '/'} directly through Pages; refusing local publication.`);
  if (new URL(pages.html_url).origin !== config.origin || pages.cname !== new URL(config.origin).host || !pages.https_enforced)
    throw new Error('Production hosting origin or HTTPS settings do not match the publisher configuration.');
}

/** The launcher card the panel records with a deployment: name, description and how to render the icon. */
const validCard = (card) => !!card && typeof card === 'object'
  && typeof card.name === 'string' && !!card.name.trim() && card.name.length <= 120
  && typeof card.description === 'string' && card.description.length <= 400
  && !!card.icon && typeof card.icon === 'object' && typeof card.icon.default === 'boolean' && typeof card.icon.model === 'boolean'
  && typeof card.icon.color === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(card.icon.color) && typeof card.icon.shape === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(card.icon.shape);
const cardRecord = (card) => validCard(card) ? { card: { name: card.name, description: card.description, icon: { default: card.icon.default, color: card.icon.color, shape: card.icon.shape, model: card.icon.model } } } : {};

const validOwnedFile = (relative) => typeof relative === 'string' && !!relative && !relative.includes('\\')
  && relative.split('/').every((part) => part && part !== '.' && part !== '..' && !/[<>:"|?*\x00-\x1f]/.test(part) && !/[. ]$/.test(part));

function normalizeInventory(value) {
  const publications = Array.isArray(value?.publications) ? value.publications.filter((item) =>
    item && typeof item.id === 'string' && /^[0-9a-f-]{36}$/i.test(item.id)
      && typeof item.slug === 'string' && (item.slug === '' || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug))
      && typeof item.contentHash === 'string' && /^[0-9a-f]{64}$/.test(item.contentHash)
      && typeof item.indexHash === 'string' && /^[0-9a-f]{64}$/.test(item.indexHash)
      && Number.isFinite(item.publishedMs)
      && (item.releaseId === undefined || (typeof item.releaseId === 'string' && RELEASE_ID.test(item.releaseId)))
      && (item.version === undefined || item.version === null || stableVersion(item.version))
      && (item.card === undefined || validCard(item.card))
      && (item.slug !== '' ? item.files === undefined : Array.isArray(item.files) && item.files.includes('index.html') && item.files.includes(MARKER_FILE)
        && item.files.every(validOwnedFile) && new Set(item.files).size === item.files.length)) : [];
  if (value !== null && (value?.version !== 1 || !Array.isArray(value.publications) || publications.length !== value.publications.length))
    throw new Error('content branch publication inventory is invalid; refusing to change any route');
  if (new Set(publications.map((item) => item.id)).size !== publications.length || new Set(publications.map((item) => item.slug)).size !== publications.length)
    throw new Error('content branch publication inventory has duplicate owners or routes');
  const root = publications.find((item) => item.slug === '');
  if (root && publications.some((item) => item.slug && root.files.some((file) => file.split('/')[0] === item.slug)))
    throw new Error('content branch root publication overlaps a named route');
  return { version: 1, publications };
}

function normalizeAssociations(value) {
  const records = Array.isArray(value?.records) ? value.records.filter((record) =>
    record && typeof record.publicationId === 'string' && /^[0-9a-f-]{36}$/i.test(record.publicationId)
      && typeof record.packageId === 'string' && /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(record.packageId)
      && Array.isArray(record.fingerprints) && record.fingerprints.length
      && record.fingerprints.every((fingerprint) => typeof fingerprint === 'string' && /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(fingerprint))) : [];
  if (value?.version !== 1 || !Array.isArray(value.records) || records.length !== value.records.length)
    throw new Error('publisher association records are invalid; refusing to change the origin-root document');
  if (new Set(records.map((record) => record.packageId)).size !== records.length)
    throw new Error('publisher association records have duplicate package IDs');
  return { version: 1, records };
}

function assetLinks(inventory, associations) {
  const active = new Set(inventory.publications.map((item) => item.id));
  return associations.records.filter((record) => active.has(record.publicationId)).map((record) => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: record.packageId,
      sha256_cert_fingerprints: record.fingerprints.map((fingerprint) => fingerprint.toUpperCase()),
    },
  })).sort((a, b) => a.target.package_name.localeCompare(b.target.package_name));
}

export function publisherGitEnvironment(environment = process.env) {
  const env = { ...environment, GIT_TERMINAL_PROMPT: '0' };
  for (const key of Object.keys(env)) if (/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CONFIG(?:_.*)?|PREFIX|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM)$/i.test(key)) delete env[key];
  return env;
}
function command(cmd, args, cwd) {
  if (!path.isAbsolute(cwd ?? '')) throw new Error('Publisher command requires an explicit working directory');
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      // Keep the process working directory short on Windows; Git receives its own explicit -C/repository paths.
      cwd: path.parse(cwd).root,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...publisherGitEnvironment(), GIT_CEILING_DIRECTORIES: path.parse(cwd).root },
    }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout.trim());
      const message = String(stderr || stdout || error.message).trim();
      const failure = new Error(`${cmd} ${args.join(' ')}: ${message}`);
      failure.code = error.code;
      failure.stdout = stdout;
      failure.stderr = stderr;
      reject(failure);
    });
  });
}

const gitOptions = ['-c', 'core.longpaths=true', '-c', 'core.hooksPath=/dev/null', '-c', 'filter.lfs.process=', '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.clean=', '-c', 'filter.lfs.required=false'];
const git = (args, cwd) => {
  if (!path.isAbsolute(cwd ?? '')) throw new Error('Publisher Git requires an explicit repository');
  // Bind every operation, even when long-path discovery cannot see a nested .git directory.
  return command('git', [...gitOptions, '-C', cwd, `--git-dir=${path.join(cwd, '.git')}`, `--work-tree=${cwd}`, ...args], cwd);
};
const refExists = (dir, ref) => git(['show-ref', '--verify', '--quiet', ref], dir).then(() => true, () => false);
const nonFastForward = (error) => /non-fast-forward|fetch first|failed to push some refs|rejected/i.test(error?.message ?? '');

async function fileList(root, { skip = new Set() } = {}) {
  if (!(await fs.lstat(root)).isDirectory()) throw new Error('publication build entry must be a directory');
  const out = [];
  let bytes = 0;
  async function visit(dir, prefix = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (skip.has(relative)) continue;
      if (entry.isSymbolicLink()) throw new Error(`publication build contains a symbolic link: ${relative}`);
      if (forbiddenNames.has(entry.name.toLowerCase()) || entry.name.toLowerCase().startsWith('.env') || forbiddenExtensions.has(path.extname(entry.name).toLowerCase()))
        throw new Error(`publication build contains a private or excluded file: ${relative}`);
      if (entry.isDirectory()) await visit(path.join(dir, entry.name), relative);
      else if (entry.isFile()) {
        bytes += (await fs.stat(path.join(dir, entry.name))).size;
        out.push(relative);
        if (out.length > 20_000 || bytes > 500 * 1024 * 1024) throw new Error('publication build exceeds the file or size limit');
      } else throw new Error(`publication build contains an unsupported entry: ${relative}`);
    }
  }
  await visit(root);
  return out.sort();
}

async function copyAndHashFiles(source, destination, files) {
  const hash = createHash('sha256');
  const realSource = await fs.realpath(source);
  for (const relative of files) {
    const input = path.join(source, ...relative.split('/'));
    const realInput = await fs.realpath(input);
    const inside = path.relative(realSource, realInput);
    if (!inside || inside.startsWith('..' + path.sep) || inside === '..' || path.isAbsolute(inside) || (await fs.lstat(input)).isSymbolicLink())
      throw new Error(`publication build entry changed or escaped its folder: ${relative}`);
    const body = await fs.readFile(input);
    hash.update(relative); hash.update('\0'); hash.update(body); hash.update('\0');
    if (destination === null) continue;
    const output = path.join(destination, ...relative.split('/'));
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, body);
  }
  return hash.digest('hex');
}
const hashFile = async (file) => createHash('sha256').update(await fs.readFile(file)).digest('hex');

async function hashAndCopyApp(source, destination) {
  const files = await fileList(source);
  if (!files.includes('index.html')) throw new Error('publication build has no index.html');
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  return copyAndHashFiles(source, destination, files);
}

async function removeOwnedRootFiles(root, files = []) {
  const directories = new Set();
  for (const relative of [...files].sort((a, b) => b.length - a.length)) {
    if (!validOwnedFile(relative)) throw new Error('root publication ownership record is invalid');
    const target = path.join(root, ...relative.split('/'));
    if (existsSync(target)) {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`root publication ownership changed: ${relative}`);
      await fs.unlink(target);
    }
    let parent = path.posix.dirname(relative);
    while (parent !== '.') { directories.add(parent); parent = path.posix.dirname(parent); }
  }
  for (const relative of [...directories].sort((a, b) => b.split('/').length - a.split('/').length))
    await fs.rmdir(path.join(root, ...relative.split('/'))).catch((error) => { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; });
}

async function hashAndCopyRoot(source, destination, previousFiles, namedSlugs) {
  const files = await fileList(source);
  if (!files.includes('index.html')) throw new Error('publication build has no index.html');
  const blocked = new Set(namedSlugs);
  for (const relative of files) if (blocked.has(relative.split('/')[0]))
    throw new Error(`root publication output overlaps named route ${relative.split('/')[0]}`);
  await removeOwnedRootFiles(destination, previousFiles);
  const outputs = [...files, MARKER_FILE];
  const directories = new Set();
  for (const relative of outputs) {
    if (existsSync(path.join(destination, ...relative.split('/')))) throw new Error(`root publication file ${relative} exists without an ownership record`);
    let parent = path.posix.dirname(relative);
    while (parent !== '.') { directories.add(parent); parent = path.posix.dirname(parent); }
  }
  for (const relative of directories) if (existsSync(path.join(destination, ...relative.split('/'))))
    throw new Error(`root publication folder ${relative} contains content not owned by this publication`);
  await fs.mkdir(destination, { recursive: true });
  return { contentHash: await copyAndHashFiles(source, destination, files), files };
}

function defaultRemote(config) {
  return `https://github.com/${config.repository}.git`;
}

export function createProductionPublisher(rawConfig, dependencies = {}) {
  const config = validateConfig(rawConfig);
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const sleep = dependencies.sleep ?? delay;
  const storageRoot = dependencies.storageRoot;
  if (!path.isAbsolute(storageRoot ?? '') || !path.isAbsolute(dependencies.associationsFile ?? '')) throw new Error('Explicit user-owned publisher storage and associations paths are required');
  const remote = dependencies.remoteUrl ?? defaultRemote(config);
  // Separate processes must never reset/clean the same checkout; non-fast-forward retries coordinate the shared branch.
  const cloneDir = path.join(storageRoot, `c-${randomUUID().replaceAll('-', '').slice(0, 16)}`);
  const associationsPath = dependencies.associationsFile;
  const siteRelative = config.sitePath === '/' ? '' : config.sitePath.slice(1);
  const siteDirectory = (dir) => siteRelative ? path.join(dir, siteRelative) : dir;
  const repositoryPath = (relative) => siteRelative ? `${siteRelative}/${relative}` : relative;
  const deployment = dependencies.deployment ?? createDeployment(config);
  const hostingReady = dependencies.hostingReady ?? deployment.ready;
  let tail = Promise.resolve();

  const serialized = (work) => {
    const result = tail.then(work, work);
    tail = result.catch(() => {});
    return result;
  };

  const url = (slug) => new URL(`/${config.routePrefix}/${slug ? `${slug}/` : ''}`, `${config.origin}/`).href;
  const branchLink = () => `https://github.com/${config.repository}/tree/${encodeURIComponent(config.branch)}`;
  const routesRoot = (dir) => path.join(siteDirectory(dir), config.routePrefix);
  async function removePublicationOutput(dir, record) {
    if (record.slug === '') await removeOwnedRootFiles(routesRoot(dir), record.files);
    else await fs.rm(path.join(routesRoot(dir), record.slug), { recursive: true, force: true });
  }

  async function assertOwnClone() {
    const metadata = await fs.lstat(path.join(cloneDir, '.git'));
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Publisher clone must have independent plain Git metadata');
    for (const file of ['commondir', 'objects/info/alternates']) if (existsSync(path.join(cloneDir, '.git', file))) throw new Error('Publisher clone cannot share another repository store');
    const actual = await fs.realpath(await git(['rev-parse', '--show-toplevel'], cloneDir));
    const expected = await fs.realpath(cloneDir);
    if ((process.platform === 'win32' ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected)) throw new Error('Publisher Git escaped its owned clone');
  }
  async function ensureClone() {
    // Some Windows Git builds still impose an internal Git-directory bound despite core.longpaths.
    // Reserve space for this Git build's internal temporary pack/index paths, not only the .git directory.
    if (process.platform === 'win32' && path.join(cloneDir, '.git').length >= 220) throw new Error('Publisher working path is too long for this Git build; select a shorter user workspace');
    if (!existsSync(path.join(cloneDir, '.git'))) {
      await fs.mkdir(path.dirname(cloneDir), { recursive: true });
      await command('git', [...gitOptions, 'clone', '--no-local', '--no-hardlinks', '--no-checkout', remote, cloneDir], path.dirname(cloneDir));
      await assertOwnClone();
      await git(['config', 'user.name', 'XR Build Publisher'], cloneDir);
      await git(['config', 'user.email', 'publisher@xrbuild.local'], cloneDir);
    }
    await assertOwnClone();
    await git(['fetch', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*'], cloneDir);
    return cloneDir;
  }

  async function checkoutBranch(log) {
    const dir = await ensureClone();
    const branchRef = `refs/remotes/origin/${config.branch}`;
    const seedRef = `refs/remotes/origin/${config.seedBranch}`;
    if (await refExists(dir, branchRef)) {
      await git(['checkout', '-B', config.branch, `origin/${config.branch}`], dir);
      await git(['reset', '--hard', `origin/${config.branch}`], dir);
    } else if (await refExists(dir, seedRef)) {
      log(`${config.repository}: preparing ${config.branch} from ${config.seedBranch}`);
      await git(['checkout', '-B', config.branch, `origin/${config.seedBranch}`], dir);
    } else {
      log(`${config.repository}: preparing empty ${config.branch} branch`);
      await git(['checkout', '--orphan', config.branch], dir);
      await git(['rm', '-rf', '--quiet', '--ignore-unmatch', '.'], dir);
    }
    await git(['clean', '-fdxq'], dir);
    return dir;
  }

  async function readInventoryFromDirectory(dir) {
    const file = path.join(siteDirectory(dir), INVENTORY_FILE);
    if (!existsSync(file)) return normalizeInventory(null);
    return normalizeInventory(await readJson(file));
  }

  async function readRemoteInventory() {
    const dir = await ensureClone();
    if (!(await refExists(dir, `refs/remotes/origin/${config.branch}`))) return normalizeInventory(null);
    const inventoryPath = repositoryPath(INVENTORY_FILE);
    const hasInventory = await git(['cat-file', '-e', `origin/${config.branch}:${inventoryPath}`], dir).then(() => true, () => false);
    if (!hasInventory) return normalizeInventory(null);
    return normalizeInventory(JSON.parse(await git(['show', `origin/${config.branch}:${inventoryPath}`], dir)));
  }

  async function readAssociations() {
    return normalizeAssociations(await readOwnedJson(associationsPath, { version: 1, records: [] }));
  }

  // Release storage: `<site>/.xrb-releases/<publicationId>/catalog.json` plus one immutable snapshot folder per release.
  const releasesRoot = (dir, publicationId) => path.join(siteDirectory(dir), RELEASES_DIR, publicationId);
  const snapshotDir = (dir, publicationId, releaseId) => path.join(releasesRoot(dir, publicationId), releaseId);
  async function readCatalogFromDirectory(dir, publicationId) {
    if (!UUID.test(publicationId)) throw new Error('publication ID is invalid');
    const file = path.join(releasesRoot(dir, publicationId), CATALOG_FILE);
    if (!existsSync(file)) return normalizeCatalog(null, publicationId);
    return normalizeCatalog(await readJson(file), publicationId);
  }
  async function readRemoteCatalog(publicationId) {
    if (!UUID.test(publicationId)) throw new Error('publication ID is invalid');
    const dir = await ensureClone();
    if (!(await refExists(dir, `refs/remotes/origin/${config.branch}`))) return normalizeCatalog(null, publicationId);
    const catalogPath = repositoryPath(`${RELEASES_DIR}/${publicationId}/${CATALOG_FILE}`);
    const has = await git(['cat-file', '-e', `origin/${config.branch}:${catalogPath}`], dir).then(() => true, () => false);
    if (!has) return normalizeCatalog(null, publicationId);
    return normalizeCatalog(JSON.parse(await git(['show', `origin/${config.branch}:${catalogPath}`], dir)), publicationId);
  }
  async function writeCatalog(dir, catalog) {
    const root = releasesRoot(dir, catalog.publicationId);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, CATALOG_FILE), JSON.stringify(catalog, null, 2) + '\n');
  }
  function assertCurrentDecision(catalog, expectedRevision) {
    if (expectedRevision !== null && expectedRevision !== undefined && expectedRevision !== catalogRevision(catalog))
      throw new Error('release history changed since this decision was made; review it and try again');
  }
  /** Retains the app's validated output as an immutable snapshot and returns the new release entry. */
  async function snapshotApp(dir, publication, app, version, files, contentHash) {
    const releaseId = newReleaseId(contentHash);
    const target = snapshotDir(dir, publication.id, releaseId);
    if (existsSync(target)) throw new Error(`release storage ${releaseId} exists without a catalog entry; refusing to adopt it`);
    if ((await copyAndHashFiles(app, target, files)) !== contentHash) throw new Error('publication build changed while it was being retained');
    const indexHash = await hashFile(path.join(target, 'index.html'));
    return { releaseId, version, contentHash, indexHash, createdMs: Date.now(), slug: publication.slug, ...(publication.slug ? {} : { files: [...files, MARKER_FILE] }) };
  }
  /** Verifies a retained snapshot's bytes against its catalog entry before anything is deployed from it. */
  async function verifiedSnapshot(dir, publicationId, release) {
    const label = release.version ?? 'the legacy release';
    const source = snapshotDir(dir, publicationId, release.releaseId);
    if (!existsSync(source)) throw new Error(`retained release ${label} is missing from storage`);
    const files = await fileList(source);
    if (release.slug === '' && JSON.stringify([...files].sort()) !== JSON.stringify(release.files.filter((f) => f !== MARKER_FILE).sort()))
      throw new Error(`retained release ${label} does not match its catalog entry`);
    if (!files.includes('index.html') || (await copyAndHashFiles(source, null, files)) !== release.contentHash) throw new Error(`retained release ${label} is corrupt; refusing to deploy it`);
    return source;
  }
  /** The first versioned update of an unversioned deployment keeps its exact verified bytes as a legacy release. */
  async function captureLegacy(dir, publication, previous, catalog, log) {
    if (!previous || catalog.releases.some((r) => r.contentHash === previous.contentHash)) return catalog;
    const route = previous.slug ? path.join(routesRoot(dir), previous.slug) : routesRoot(dir);
    const files = previous.slug ? await fileList(route, { skip: new Set([MARKER_FILE]) }) : previous.files.filter((f) => f !== MARKER_FILE);
    for (const relative of files) if (!existsSync(path.join(route, ...relative.split('/')))) throw new Error(`legacy deployment file ${relative} is missing; refusing to migrate unverifiable bytes`);
    if ((await copyAndHashFiles(route, null, files)) !== previous.contentHash) throw new Error('legacy deployment bytes do not match its inventory record; refusing to migrate them');
    const releaseId = newReleaseId(previous.contentHash, previous.publishedMs);
    const target = snapshotDir(dir, publication.id, releaseId);
    if (existsSync(target)) throw new Error(`release storage ${releaseId} exists without a catalog entry; refusing to adopt it`);
    await copyAndHashFiles(route, target, files);
    log(`retaining the current unversioned deployment of ${url(previous.slug)} as a legacy release`);
    const release = { releaseId, version: null, contentHash: previous.contentHash, indexHash: previous.indexHash, createdMs: previous.publishedMs, slug: previous.slug, ...(previous.slug === '' ? { files: [...files, MARKER_FILE] } : {}) };
    return { ...catalog, releases: [...catalog.releases, release] };
  }
  /** Materializes a verified snapshot at the canonical route and records it as the active deployment. */
  async function materialize(dir, publication, release, source, inventory, previous, card) {
    if (previous && previous.slug !== publication.slug) await removePublicationOutput(dir, previous);
    const target = publication.slug ? path.join(routesRoot(dir), publication.slug) : routesRoot(dir);
    let contentHash, files;
    if (publication.slug) {
      if (previous?.slug !== publication.slug && existsSync(target)) throw new Error(`route ${publication.slug} exists without an ownership record`);
      contentHash = await hashAndCopyApp(source, target);
    } else {
      ({ contentHash, files } = await hashAndCopyRoot(source, target, previous?.slug === '' ? previous.files : [], inventory.publications
        .filter((item) => item.id !== publication.id && item.slug).map((item) => item.slug)));
    }
    if (contentHash !== release.contentHash) throw new Error('retained release changed while it was being deployed');
    const indexHash = await hashFile(path.join(target, 'index.html'));
    const record = { id: publication.id, slug: publication.slug, contentHash, indexHash, publishedMs: Date.now(), releaseId: release.releaseId, version: release.version, ...cardRecord(card), ...(publication.slug ? {} : { files: [...files, MARKER_FILE] }) };
    await fs.writeFile(path.join(target, MARKER_FILE), JSON.stringify({ version: 1, ...record }, null, 2) + '\n');
    inventory.publications = [...inventory.publications.filter((item) => item.id !== publication.id), record].sort((a, b) => a.slug.localeCompare(b.slug));
    return record;
  }

  async function assertExistingAssociations(dir, inventory) {
    const file = path.join(siteDirectory(dir), ASSET_LINKS_FILE);
    const expected = assetLinks(inventory, await readAssociations());
    if (!existsSync(file)) {
      if (inventory.publications.length) throw new Error('public association document is missing; refusing to replace it');
      return;
    }
    const actual = await readJson(file);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error('public associations differ from private configuration; refusing to overwrite them');
  }

  async function writeMetadata(dir, inventory) {
    const site = siteDirectory(dir);
    await fs.mkdir(site, { recursive: true });
    await fs.writeFile(path.join(site, INVENTORY_FILE), JSON.stringify(inventory, null, 2) + '\n');
    const links = assetLinks(inventory, await readAssociations());
    const assetFile = path.join(site, ASSET_LINKS_FILE);
    await fs.mkdir(path.dirname(assetFile), { recursive: true });
    await fs.writeFile(assetFile, JSON.stringify(links, null, 2) + '\n');
    await fs.writeFile(path.join(site, '.nojekyll'), '');
    return links;
  }

  async function commit(dir, message) {
    await git(['add', '-A', '--', siteRelative || '.'], dir);
    const staged = (await git(['diff', '--cached', '--name-only'], dir)).split('\n').filter(Boolean);
    if (!staged.length) return null;
    if (siteRelative && staged.some((name) => !name.startsWith(`${siteRelative}/`))) throw new Error('publication would change files outside the site output');
    await git(['commit', '-q', '-m', message], dir);
    return git(['rev-parse', 'HEAD'], dir);
  }

  async function push(dir) {
    if (dependencies.beforePush) await dependencies.beforePush(dir);
    await git(['push', 'origin', `HEAD:refs/heads/${config.branch}`], dir);
  }

  async function fetchResponse(target) {
    const separator = target.includes('?') ? '&' : '?';
    return fetchImpl(`${target}${separator}xrb=${Date.now()}`, { redirect: 'follow' }).catch(() => null);
  }

  async function publicState(publication, expectedHash, expectedLinks, shouldExist) {
    const rootResponse = await fetchResponse(`${config.origin}/`);
    if (!rootResponse?.ok) return false;
    const markerResponse = await fetchResponse(`${url(publication.slug)}${MARKER_FILE}`);
    const linksResponse = await fetchResponse(new URL('/.well-known/assetlinks.json', `${config.origin}/`).href);
    if (expectedLinks === null) {
      if (linksResponse?.status !== 404) return false;
    } else {
      if (!linksResponse?.ok) return false;
      const actualLinks = await linksResponse.json().catch(() => null);
      if (JSON.stringify(actualLinks) !== JSON.stringify(expectedLinks)) return false;
    }
    if (!shouldExist) return markerResponse?.status === 404;
    if (!markerResponse?.ok) return false;
    const marker = await markerResponse.json().catch(() => null);
    if (marker?.id !== publication.id || marker?.slug !== publication.slug || marker?.contentHash !== expectedHash) return false;
    const indexResponse = await fetchResponse(url(publication.slug));
    if (!indexResponse?.ok || createHash('sha256').update(await indexResponse.arrayBuffer().then((buffer) => Buffer.from(buffer))).digest('hex') !== publication.indexHash) return false;
    return true;
  }

  /** Why a published app is not reachable, in one plain sentence (status only; publishing waits on publicState). */
  async function notLiveReason(publication) {
    const site = await fetchResponse(`${config.origin}/`);
    if (!site) return `${config.origin} cannot be reached`;
    if (!site.ok) return `${config.origin} is not serving the site (HTTP ${site.status})`;
    const marker = await fetchResponse(`${url(publication.slug)}${MARKER_FILE}`);
    if (!marker?.ok) return `${url(publication.slug)} is not on the site yet; it may still be deploying`;
    return `${url(publication.slug)} serves a different version than the last publication`;
  }

  async function waitForState(description, check, log) {
    const deadline = Date.now() + config.verifyTimeoutMs;
    log(`waiting for ${description}`);
    do {
      if (await check()) return;
      await sleep(Math.min(10_000, Math.max(1, deadline - Date.now())));
    } while (Date.now() < deadline);
    throw new Error(`timed out verifying ${description}`);
  }

  async function rollback(commitSha, previous, attempted, log) {
    log(`verification failed; reverting ${commitSha.slice(0, 12)}`);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const dir = await checkoutBranch(log);
      try {
        if (await git(['rev-parse', 'HEAD'], dir) !== commitSha) throw new Error('public main advanced; refusing an unsafe automatic rollback');
        await git(['revert', '--no-edit', commitSha], dir);
        await push(dir);
        await deployment.deploy(await git(['rev-parse', 'HEAD'], dir), log);
        const restoredInventory = await readInventoryFromDirectory(dir);
        const restoredLinks = existsSync(path.join(siteDirectory(dir), ASSET_LINKS_FILE))
          ? assetLinks(restoredInventory, await readAssociations()) : null;
        if (previous) {
          await waitForState(`restored route ${url(previous.slug)}`, () => publicState(previous, previous.contentHash, restoredLinks, true), log);
          if (previous.slug !== attempted.slug)
            await waitForState(`removed attempted route ${url(attempted.slug)}`, () => publicState(attempted, '', restoredLinks, false), log);
        } else await waitForState(`removed attempted route ${url(attempted.slug)}`, () => publicState(attempted, '', restoredLinks, false), log);
        return;
      } catch (error) {
        if (nonFastForward(error) && attempt < 3) continue;
        throw new Error(`publication verification failed and rollback failed: ${error.message}`);
      }
    }
  }

  async function publishTransaction({ app, publication, card, log }) {
    await hostingReady();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const dir = await checkoutBranch(log);
      const inventory = await readInventoryFromDirectory(dir);
      await assertExistingAssociations(dir, inventory);
      const collision = inventory.publications.find((item) => item.slug === publication.slug && item.id !== publication.id);
      if (collision) throw new Error(`route ${publication.slug} belongs to another publication`);
      // An identity with release history is only written through the release-aware path: no silent legacy overwrite.
      const catalog = await readCatalogFromDirectory(dir, publication.id);
      if (catalog.releases.length || catalog.requested) throw new Error('this publication has versioned release history; publish a new version instead of an unversioned update');
      const previous = inventory.publications.find((item) => item.id === publication.id) ?? null;
      if (previous && previous.slug !== publication.slug) await removePublicationOutput(dir, previous);
      const target = publication.slug ? path.join(routesRoot(dir), publication.slug) : routesRoot(dir);
      let contentHash, files;
      if (publication.slug) {
        if (previous?.slug !== publication.slug && existsSync(target)) throw new Error(`route ${publication.slug} exists without an ownership record`);
        contentHash = await hashAndCopyApp(app, target);
      } else {
        const copied = await hashAndCopyRoot(app, target, previous?.slug === '' ? previous.files : [], inventory.publications
          .filter((item) => item.id !== publication.id && item.slug).map((item) => item.slug));
        ({ contentHash, files } = copied);
      }
      const publishedMs = Date.now();
      const indexHash = createHash('sha256').update(await fs.readFile(path.join(target, 'index.html'))).digest('hex');
      const record = { id: publication.id, slug: publication.slug, contentHash, indexHash, publishedMs, ...cardRecord(card), ...(publication.slug ? {} : { files: [...files, MARKER_FILE] }) };
      await fs.writeFile(path.join(target, MARKER_FILE), JSON.stringify({ version: 1, ...record }, null, 2) + '\n');
      inventory.publications = [...inventory.publications.filter((item) => item.id !== publication.id), record]
        .sort((a, b) => a.slug.localeCompare(b.slug));
      const links = await writeMetadata(dir, inventory);
      const commitSha = await commit(dir, `publish ${config.routePrefix}/${publication.slug}`);
      if (!commitSha) return { url: url(publication.slug), link: branchLink() };
      try { await push(dir); }
      catch (error) {
        if (nonFastForward(error) && attempt < 3) { log('content branch changed; reapplying publication'); continue; }
        throw error;
      }
      let run;
      try {
        run = await deployment.deploy(commitSha, log);
        await waitForState(url(publication.slug), () => publicState(record, contentHash, links, true), log);
        if (previous && previous.slug !== record.slug)
          await waitForState(`removal of old route ${url(previous.slug)}`, () => publicState(previous, '', links, false), log);
      } catch (error) {
        await rollback(commitSha, previous, record, log);
        throw error;
      }
      log(`published ${url(publication.slug)}`);
      return { url: url(publication.slug), link: run.link };
    }
    throw new Error('content branch kept changing; publication was not pushed');
  }

  async function unpublishTransaction({ publication, log }) {
    await hostingReady();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const dir = await checkoutBranch(log);
      const inventory = await readInventoryFromDirectory(dir);
      await assertExistingAssociations(dir, inventory);
      const previous = inventory.publications.find((item) => item.id === publication.id) ?? null;
      if (!previous) return { link: branchLink() };
      await removePublicationOutput(dir, previous);
      inventory.publications = inventory.publications.filter((item) => item.id !== publication.id);
      // Retained releases and their public archives stay; only the deployment decision is withdrawn.
      const catalog = await readCatalogFromDirectory(dir, publication.id);
      if (catalog.requested) await writeCatalog(dir, { ...catalog, requested: null });
      const links = await writeMetadata(dir, inventory);
      const commitSha = await commit(dir, `unpublish ${config.routePrefix}/${previous.slug}`);
      if (!commitSha) return { link: branchLink() };
      try { await push(dir); }
      catch (error) {
        if (nonFastForward(error) && attempt < 3) { log('content branch changed; reapplying removal'); continue; }
        throw error;
      }
      let run;
      try {
        run = await deployment.deploy(commitSha, log);
        await waitForState(`removal of ${url(previous.slug)}`, () => publicState(previous, '', links, false), log);
      } catch (error) {
        await rollback(commitSha, previous, previous, log);
        throw error;
      }
      log(`unpublished ${url(previous.slug)}`);
      return { link: run.link };
    }
    throw new Error('content branch kept changing; removal was not pushed');
  }

  /** Deploys a pushed commit and proves the route public; failure restores and verifies the previous decision. */
  async function deployVerified(commitSha, record, previous, links, log) {
    try {
      const run = await deployment.deploy(commitSha, log);
      await waitForState(url(record.slug), () => publicState(record, record.contentHash, links, true), log);
      if (previous && previous.slug !== record.slug) await waitForState(`removal of old route ${url(previous.slug)}`, () => publicState(previous, '', links, false), log);
      return run;
    } catch (error) {
      await rollback(commitSha, previous, record, log);
      throw error;
    }
  }

  async function releasePublishTransaction({ app, publication, version, expectedRevision, card, log }) {
    if (!stableVersion(version)) throw new Error('publication version must be a stable three-part version');
    await hostingReady();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const dir = await checkoutBranch(log);
      const inventory = await readInventoryFromDirectory(dir);
      await assertExistingAssociations(dir, inventory);
      const collision = inventory.publications.find((item) => item.slug === publication.slug && item.id !== publication.id);
      if (collision) throw new Error(`route ${publication.slug} belongs to another publication`);
      let catalog = await readCatalogFromDirectory(dir, publication.id);
      assertCurrentDecision(catalog, expectedRevision);
      const previous = inventory.publications.find((item) => item.id === publication.id) ?? null;
      const files = await fileList(app);
      if (!files.includes('index.html')) throw new Error('publication build has no index.html');
      const contentHash = await copyAndHashFiles(app, null, files);
      const existing = catalog.releases.find((r) => r.version === version) ?? null;
      if (existing && existing.contentHash !== contentHash) throw new Error(`version ${version} is already retained with different output; choose a new version`);
      const top = highestVersion(catalog.releases);
      if (!existing && top && compareVersions(version, top) <= 0) throw new Error(`version ${version} does not exceed the highest retained version ${top}`);
      catalog = await captureLegacy(dir, publication, previous, catalog, log);
      let release = existing;
      if (release) log(`version ${version} is already retained with identical output; deploying the retained release`);
      else {
        release = await snapshotApp(dir, publication, app, version, files, contentHash);
        catalog = { ...catalog, releases: [...catalog.releases, release] };
      }
      const source = await verifiedSnapshot(dir, publication.id, release);
      const record = await materialize(dir, publication, release, source, inventory, previous, card);
      await writeCatalog(dir, { ...catalog, requested: { releaseId: release.releaseId, at: record.publishedMs } });
      const links = await writeMetadata(dir, inventory);
      const commitSha = await commit(dir, `publish ${config.routePrefix}/${publication.slug} ${version}`);
      if (!commitSha) return { url: url(publication.slug), link: branchLink(), releaseId: release.releaseId, version };
      try { await push(dir); }
      catch (error) {
        if (nonFastForward(error) && attempt < 3) { log('content branch changed; reapplying publication'); continue; }
        throw error;
      }
      const run = await deployVerified(commitSha, record, previous, links, log);
      log(`published ${url(publication.slug)} as ${version}`);
      return { url: url(publication.slug), link: run.link, releaseId: release.releaseId, version };
    }
    throw new Error('content branch kept changing; publication was not pushed');
  }

  async function activateTransaction({ publication, releaseId, expectedRevision, card, log }) {
    await hostingReady();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const dir = await checkoutBranch(log);
      const inventory = await readInventoryFromDirectory(dir);
      await assertExistingAssociations(dir, inventory);
      const collision = inventory.publications.find((item) => item.slug === publication.slug && item.id !== publication.id);
      if (collision) throw new Error(`route ${publication.slug} belongs to another publication`);
      const catalog = await readCatalogFromDirectory(dir, publication.id);
      assertCurrentDecision(catalog, expectedRevision);
      const release = catalog.releases.find((r) => r.releaseId === releaseId) ?? null;
      if (!release) throw new Error('that release is not retained for this publication');
      const label = release.version ?? 'the legacy release';
      const previous = inventory.publications.find((item) => item.id === publication.id) ?? null;
      const source = await verifiedSnapshot(dir, publication.id, release);
      if (previous?.releaseId === releaseId && previous.slug === publication.slug && catalog.requested?.releaseId === releaseId
        && await publicState(previous, previous.contentHash, assetLinks(inventory, await readAssociations()), true)) {
        log(`${label} is already live at ${url(publication.slug)}`);
        return { url: url(publication.slug), link: branchLink(), releaseId, version: release.version };
      }
      const record = await materialize(dir, publication, release, source, inventory, previous, card);
      await writeCatalog(dir, { ...catalog, requested: { releaseId, at: record.publishedMs } });
      const links = await writeMetadata(dir, inventory);
      const commitSha = await commit(dir, `activate ${config.routePrefix}/${publication.slug} ${release.version ?? 'legacy'}`);
      if (!commitSha) {
        // The branch already carries this decision (an interrupted activation): only the public proof is missing.
        await waitForState(url(publication.slug), () => publicState(record, record.contentHash, links, true), log);
        return { url: url(publication.slug), link: branchLink(), releaseId, version: release.version };
      }
      try { await push(dir); }
      catch (error) {
        if (nonFastForward(error) && attempt < 3) { log('content branch changed; reapplying activation'); continue; }
        throw error;
      }
      const run = await deployVerified(commitSha, record, previous, links, log);
      log(`${label} is live at ${url(publication.slug)}`);
      return { url: url(publication.slug), link: run.link, releaseId, version: release.version };
    }
    throw new Error('content branch kept changing; activation was not pushed');
  }

  /** Removes a retained release that is neither deployed nor requested: snapshot and catalog entry go, the live route stays. */
  async function deleteTransaction({ publication, releaseId, expectedRevision, log }) {
    await hostingReady();
    const archiveUrl = new URL(`/${RELEASES_DIR}/${publication.id}/${releaseId}/`, `${config.origin}/`).href;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const dir = await checkoutBranch(log);
      const inventory = await readInventoryFromDirectory(dir);
      const catalog = await readCatalogFromDirectory(dir, publication.id);
      assertCurrentDecision(catalog, expectedRevision);
      const release = catalog.releases.find((r) => r.releaseId === releaseId) ?? null;
      if (!release) throw new Error('that release is not retained for this publication');
      const label = release.version ?? 'the legacy release';
      const record = inventory.publications.find((item) => item.id === publication.id) ?? null;
      if (record?.releaseId === releaseId) throw new Error(`${label} is deployed at the canonical route; activate another release or unpublish before deleting it`);
      if (catalog.requested?.releaseId === releaseId) throw new Error(`${label} is the requested deployment; activate another release or unpublish before deleting it`);
      await fs.rm(snapshotDir(dir, publication.id, releaseId), { recursive: true, force: true });
      await writeCatalog(dir, { ...catalog, releases: catalog.releases.filter((r) => r.releaseId !== releaseId) });
      const commitSha = await commit(dir, `delete release ${config.routePrefix}/${publication.slug} ${release.version ?? 'legacy'}`);
      if (!commitSha) return { link: branchLink() };
      try { await push(dir); }
      catch (error) {
        if (nonFastForward(error) && attempt < 3) { log('content branch changed; reapplying the deletion'); continue; }
        throw error;
      }
      const run = await deployment.deploy(commitSha, log);
      await waitForState(`removal of archive ${archiveUrl}`, async () => (await fetchResponse(archiveUrl))?.status === 404, log);
      log(`${label} deleted; the live route is unchanged`);
      return { link: run.link };
    }
    throw new Error('content branch kept changing; the deletion was not pushed');
  }

  /** Read-only: retained releases, the latest decision and the verified live release of one identity. */
  async function catalogOf(publication) {
    const { inventory, catalog } = await serialized(async () => ({ inventory: await readRemoteInventory(), catalog: await readRemoteCatalog(publication.id) }));
    const record = inventory.publications.find((item) => item.id === publication.id) ?? null;
    const verified = record ? await publicState(record, record.contentHash, assetLinks(inventory, await readAssociations()), true) : false;
    const live = verified && record.releaseId && catalog.releases.some((r) => r.releaseId === record.releaseId) ? record.releaseId : null;
    return {
      revision: catalogRevision(catalog),
      // Archives are public site content, so each retained release can be previewed in place without deploying it.
      releases: catalog.releases.map((r) => ({ releaseId: r.releaseId, version: r.version, digest: r.contentHash, createdMs: r.createdMs,
        url: new URL(`/${RELEASES_DIR}/${publication.id}/${r.releaseId}/`, `${config.origin}/`).href })),
      requestedReleaseId: catalog.requested?.releaseId ?? null,
      liveReleaseId: live,
      legacyLive: verified && !live,
    };
  }

  return {
    name: 'production-web',
    label: 'Production',
    origin: config.origin,
    routePrefix: config.routePrefix,
    validate(publication) {
      const errors = [];
      if (!/^[0-9a-f-]{36}$/i.test(publication.id)) errors.push({ field: 'id', message: 'publication ID is invalid' });
      if (publication.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(publication.slug)) errors.push({ field: 'slug', message: 'slug must be empty or use lower-case words separated by single hyphens' });
      if (publication.slug && ['assets', 'archive', 'root'].includes(publication.slug)) errors.push({ field: 'slug', message: `"${publication.slug}" is reserved` });
      return errors;
    },
    async status(publication) {
      try {
        const inventory = await serialized(readRemoteInventory);
        const record = inventory.publications.find((item) => item.id === publication.id);
        if (!record) return { state: 'unpublished', selectedUrl: url(publication.slug), link: branchLink(), associations: assetLinks(inventory, await readAssociations()).length };
        const expectedLinks = assetLinks(inventory, await readAssociations());
        const verified = await publicState(record, record.contentHash, expectedLinks, true);
        return verified
          ? { state: 'published', selectedUrl: url(publication.slug), deployedUrl: url(record.slug), deployedSlug: record.slug, publishedMs: record.publishedMs, link: branchLink(), associations: expectedLinks.length }
          : { state: 'failed', selectedUrl: url(publication.slug), deployedUrl: url(record.slug), deployedSlug: record.slug, publishedMs: record.publishedMs, link: branchLink(), associations: expectedLinks.length, error: await notLiveReason(record) };
      } catch (error) {
        return { state: 'unavailable', selectedUrl: url(publication.slug), link: branchLink(), error: error.message };
      }
    },
    publish(options) { return serialized(() => publishTransaction(options)); },
    unpublish(options) { return serialized(() => unpublishTransaction(options)); },
    releases: {
      catalog: catalogOf,
      publish(options) { return serialized(() => releasePublishTransaction(options)); },
      activate(options) { return serialized(() => activateTransaction(options)); },
      delete(options) { return serialized(() => deleteTransaction(options)); },
    },
  };
}
