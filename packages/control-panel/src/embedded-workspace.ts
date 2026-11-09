import fs from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { canonicalFuturePath } from './plugin-artifacts.ts';
import { containedPath } from './extension-catalog.ts';
import { buildJson, metadataText, buildInventory, embeddedDeclaration, embeddedInputs, inputHash, outputDirectory, scriptName, buildStateDirectory, prepareEmbeddedSnapshot, writeBuildReceipt } from './embedded-inputs.ts';
import type { JobContext } from './jobs.ts';

export interface EmbeddedPackage { name: string; relative: string; dependencies: string[]; build: string | null; test: string | null }
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const object = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);
function publicDependencyLocator(value: string): void {
  if (/(?:git\+)?ssh:|(?:^|[(@])git@|https?:\/\/[^/\s]*@/i.test(value)) throw new Error('Embedded dependencies must not require SSH or embedded credentials');
  if (/^(?:git\+)?https?:\/\//i.test(value)) {
    const url = new URL(value.replace(/^git\+/i, ''));
    if (url.protocol !== 'https:' || url.username || url.password || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Embedded dependency URLs must be credential-free public HTTPS locations');
  }
}
function dependencies(pkg: any, manager: string): Record<string, string> {
  if (!object(pkg)) throw new Error('Invalid embedded package metadata');
  if (pkg.packageManager !== undefined && pkg.packageManager !== manager) throw new Error('Embedded packages must use the root pinned package manager');
  if (pkg.pnpm !== undefined || pkg.dependenciesMeta !== undefined || pkg.devEngines?.packageManager !== undefined) throw new Error('Custom package-manager configuration requires an editable copy');
  const result: Record<string, string> = Object.create(null);
  for (const deps of [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies]) {
    if (deps === undefined) continue;
    if (!object(deps)) throw new Error('Invalid embedded dependency map');
    for (const [name, value] of Object.entries(deps)) {
      if (!PACKAGE_NAME.test(name) || typeof value !== 'string' || /^(?:(?:git\+)?file:|link:|[./\\]|[a-zA-Z]:)/i.test(value) || value.startsWith('workspace:') && !/^workspace:[*^~]$/.test(value)) throw new Error('External file/link dependencies require an editable copy');
      publicDependencyLocator(value);
      if (result[name] !== undefined && result[name] !== value) throw new Error('Inconsistent embedded dependency declarations');
      result[name] = value;
    }
  }
  return result;
}
async function validateLock(root: string, packages: EmbeddedPackage[], maps: Map<string, Record<string, string>>, rootDeps: Record<string, string>) {
  const text = await metadataText(await containedPath(root, 'pnpm-lock.yaml'), 4 * 1024 * 1024);
  let lock: any;
  try {
    const doc = parseDocument(text, { uniqueKeys: true, merge: false, schema: 'core' });
    if (doc.errors.length || doc.warnings.length) throw new Error();
    lock = doc.toJS({ maxAliasCount: 0 });
  } catch { throw new Error('Invalid or unsupported embedded lockfile YAML'); }
  if (!object(lock) || lock.lockfileVersion !== '9.0' || !object(lock.importers)) throw new Error('Embedded builds require a pnpm v9-format lockfile');
  if (!object(lock.settings) || lock.settings.autoInstallPeers !== true || lock.settings.excludeLinksFromLockfile !== false || Object.keys(lock.settings).some(key => !['autoInstallPeers', 'excludeLinksFromLockfile'].includes(key))) throw new Error('Unsupported embedded lockfile settings');
  const allowed = new Set(['lockfileVersion', 'settings', 'importers', 'packages', 'snapshots']);
  if (Object.keys(lock).some(key => !allowed.has(key))) throw new Error('Unsupported embedded lockfile configuration');
  const roots = new Map<string, Record<string, string>>([['.', rootDeps], ...packages.map(pkg => [pkg.relative, maps.get(pkg.name)!] as [string, Record<string, string>])]);
  if (Object.keys(lock.importers).length !== roots.size || Object.keys(lock.importers).some(key => !roots.has(key))) throw new Error('Lockfile importers must exactly match the embedded package workspace');
  const byName = new Map(packages.map(pkg => [pkg.name, pkg]));
  for (const [relative, deps] of roots) {
    const importer = lock.importers[relative], found = new Set<string>();
    if (!object(importer) || Object.keys(importer).some(key => !['dependencies', 'devDependencies', 'optionalDependencies'].includes(key))) throw new Error('Unsupported embedded lockfile importer');
    for (const group of Object.values(importer)) {
      if (!object(group)) throw new Error('Invalid lockfile dependency group');
      for (const [name, value] of Object.entries(group as object)) {
        const record = value as any;
        if (!object(record) || typeof record.version !== 'string' || typeof record.specifier !== 'string' || Object.keys(record).some(key => !['version', 'specifier'].includes(key))) throw new Error('Invalid lockfile dependency record');
        publicDependencyLocator(record.version); publicDependencyLocator(record.specifier);
        if (record.version.startsWith('link:') || record.specifier.startsWith('workspace:')) {
          const target = byName.get(name), expected = target ? `link:${path.posix.relative(relative, target.relative)}` : null;
          if (!target || !deps[name]?.startsWith('workspace:') || record.specifier !== deps[name] || record.version !== expected) throw new Error('Lockfile workspace link does not match its declared embedded package');
          found.add(name);
        } else if (/(?:^|[(@])(?:(?:git\+)?file:|link:)/i.test(record.version) || /^(?:[./\\]|[a-zA-Z]:)/.test(record.version) || /^(?:(?:git\+)?file:|link:|[./\\]|[a-zA-Z]:)/i.test(record.specifier)) throw new Error('Lockfile filesystem dependencies require an editable copy');
      }
    }
    for (const [name, value] of Object.entries(deps)) if (value.startsWith('workspace:') && !found.has(name)) throw new Error('Lockfile is missing an embedded workspace dependency');
  }
  const inspect = (value: unknown) => {
    if (typeof value === 'string') publicDependencyLocator(value);
    if (typeof value === 'string' && (/(?:^|[(@])(?:(?:git\+)?file:|link:)/i.test(value) || /^(?:[./\\]|[a-zA-Z]:)/.test(value))) throw new Error('Lockfile contains an unsupported filesystem resolution');
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === '<<') throw new Error('Lockfile merge keys are unsupported');
      inspect(key);
      if (key === 'resolution' && object(entry)) {
        const resolution = entry as any;
        if (resolution.directory !== undefined || resolution.path !== undefined || resolution.type === 'directory' || resolution.tarball !== undefined && (typeof resolution.tarball !== 'string' || !/^https?:\/\//.test(resolution.tarball))) throw new Error('Lockfile contains an unsupported filesystem resolution');
      }
      inspect(entry);
    }
  };
  inspect(lock.packages); inspect(lock.snapshots); inspect(lock.settings);
}
function packageScript(pkg: any, name: string): string | null {
  if (pkg.scripts !== undefined && !object(pkg.scripts)) throw new Error('Invalid embedded script map');
  const value = pkg.scripts?.[name];
  if (value === undefined) return null;
  if (!scriptName(name) || typeof value !== 'string' || !value.trim()) throw new Error('Invalid embedded package script');
  return name;
}
export async function embeddedWorkspacePlan(core: string) {
  const declaration = await embeddedDeclaration(core), { root, packageManager, patterns } = declaration;
  const initial = await buildInventory(root, true);
  if (initial.files.some(name => name.endsWith('/pnpm-workspace.yaml') || name.endsWith('/pnpm-workspace.yml'))) throw new Error('Nested package workspaces require an editable copy');
  const excluded: string[] = [], builds = new Map<string, string>();
  for (const file of initial.files.filter(name => /^projects\/[^/]+\/[^/]+\/xrb-project.json$/.test(name))) {
    const manifest = await buildJson(await containedPath(root, file));
    if (!object(manifest)) throw new Error('Invalid embedded project manifest');
    if (manifest.scripts?.build !== undefined) {
      if (!scriptName(manifest.scripts.build)) throw new Error('Invalid declared project build script');
      const relative = path.posix.dirname(file), entry = manifest.entry ?? (manifest.kind === 'app' ? 'dist' : '.');
      outputDirectory(entry); excluded.push(`${relative}/${entry}`); builds.set(relative, manifest.scripts.build);
    }
  }
  const source = await buildInventory(root, true, excluded);
  const matches = (relative: string) => patterns.some(pattern => {
    const parts = relative.split('/'), expected = pattern.split('/');
    return parts.length === expected.length && parts.every((part, index) => expected[index] === '*' || expected[index] === part);
  });
  const packages: EmbeddedPackage[] = [], maps = new Map<string, Record<string, string>>();
  const rootDeps = dependencies(declaration.declaration, packageManager);
  for (const file of source.files.filter(name => name.endsWith('/package.json') && matches(path.posix.dirname(name)))) {
    const pkg = await buildJson(await containedPath(root, file)), relative = path.posix.dirname(file);
    const deps = dependencies(pkg, packageManager);
    if (typeof pkg.name !== 'string' || pkg.name.length > 214 || !PACKAGE_NAME.test(pkg.name) || pkg.name === declaration.declaration.name || maps.has(pkg.name)) throw new Error('Embedded package identities must be valid and unique');
    const declared = builds.get(relative), build = packageScript(pkg, declared ?? 'build');
    if (declared && !build) throw new Error('Missing declared project build script');
    packages.push({ name: pkg.name, relative, dependencies: [], build, test: packageScript(pkg, 'test') }); maps.set(pkg.name, deps);
  }
  const local = (deps: Record<string, string>) => Object.entries(deps).flatMap(([name, value]) => {
    if (value.startsWith('workspace:')) {
      if (!maps.has(name)) throw new Error(`Missing embedded workspace dependency: ${name}`);
      return [name];
    }
    if (maps.has(name)) throw new Error(`Local embedded dependency must use workspace protocol: ${name}`);
    return [];
  });
  local(rootDeps);
  for (const pkg of packages) pkg.dependencies = local(maps.get(pkg.name)!).sort();
  for (const relative of builds.keys()) if (!packages.some(pkg => pkg.relative === relative)) throw new Error('Buildable project is not a registered embedded package');
  const byName = new Map(packages.map(pkg => [pkg.name, pkg])), sorted: EmbeddedPackage[] = [], active = new Set<string>(), done = new Set<string>();
  const visit = (pkg: EmbeddedPackage) => {
    if (done.has(pkg.name)) return;
    if (active.has(pkg.name)) throw new Error('Embedded workspace dependency graph contains a cycle');
    active.add(pkg.name); for (const name of pkg.dependencies) visit(byName.get(name)!);
    active.delete(pkg.name); done.add(pkg.name); sorted.push(pkg);
  };
  for (const pkg of packages.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) visit(pkg);
  await validateLock(root, packages, maps, rootDeps);
  if ((await buildInventory(root, true)).fingerprint !== initial.fingerprint) throw new Error('Embedded inputs changed during planning');
  return { ...declaration, packages: sorted, excluded, sourceFingerprint: source.fingerprint };
}
export function embeddedPrerequisites(plan: Awaited<ReturnType<typeof embeddedWorkspacePlan>>, relative: string) {
  const selected = plan.packages.find(pkg => pkg.relative === relative);
  if (!selected) throw new Error('Project is not a registered embedded package');
  const needed = new Set<string>(), byName = new Map(plan.packages.map(pkg => [pkg.name, pkg]));
  const visit = (pkg: EmbeddedPackage) => { for (const name of pkg.dependencies) if (!needed.has(name)) { needed.add(name); visit(byName.get(name)!); } };
  visit(selected); return plan.packages.filter(pkg => needed.has(pkg.name));
}
export const EMBEDDED_LOCK = 'operation.lock';
export const EMBEDDED_RECEIPT = 'operation.json';
export function embeddedStateRoot(core: string, workspace: string) {
  const canonical = canonicalFuturePath(core), key = inputHash(process.platform === 'win32' ? canonical.toLowerCase() : canonical).slice(0, 20);
  return path.join(canonicalFuturePath(workspace), 'build', 'embedded', `e-${key}`);
}
export type EmbeddedOperation = 'setup' | 'build' | 'test';
export async function runEmbeddedWorkspace(core: string, workspace: string, operation: EmbeddedOperation, ctx: JobContext, options: { reserveRuntime?: boolean } = {}) {
  if (!['setup', 'build', 'test'].includes(operation)) throw new Error('Unknown embedded operation');
  const plan = await embeddedWorkspacePlan(core), before = await embeddedInputs(core, plan.excluded);
  if (before.sourceFingerprint !== plan.sourceFingerprint) throw new Error('Embedded inputs changed during planning');
  const root = await buildStateDirectory(core, workspace, embeddedStateRoot(core, workspace), true), lockFile = path.join(root, EMBEDDED_LOCK);
  const lock = await fs.open(lockFile, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') throw new Error('Embedded operation lock exists; verify the previous writer stopped before recovery'); throw error;
  });
  const identity = { version: 1, core: canonicalFuturePath(core), source: plan.root, inputs: before.fingerprint, operation };
  let started = false;
  let stage: Awaited<ReturnType<typeof prepareEmbeddedSnapshot>> | undefined;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    await writeBuildReceipt(root, EMBEDDED_RECEIPT, { ...identity, status: 'running' }, core, workspace); started = true;
    stage = await prepareEmbeddedSnapshot(core, workspace, root, before, plan.excluded);
    await writeBuildReceipt(root, EMBEDDED_RECEIPT, { ...identity, status: 'running', working: path.basename(stage.work) }, core, workspace);
    await stage.install(ctx);
    let built = 0, tested = 0;
    if (operation !== 'setup') for (const pkg of plan.packages) {
      if (!pkg.build) { ctx.line(`No build script: ${pkg.name}`); continue; }
      ctx.line(`Build ${pkg.name}`); await stage.run(ctx, pkg.relative, pkg.build); built++;
    }
    if (operation === 'test') for (const pkg of plan.packages) {
      if (!pkg.test) { ctx.line(`No test script: ${pkg.name}`); continue; }
      ctx.line(`Test ${pkg.name}`); await stage.run(ctx, pkg.relative, pkg.test); tested++;
    }
    if (before.fingerprint !== (await embeddedInputs(core, plan.excluded)).fingerprint) throw new Error('Embedded inputs changed during operation; retry');
    const result = { ...identity, status: 'complete', working: path.basename(stage.work), packages: plan.packages.length, built, tested };
    if (options.reserveRuntime) await writeBuildReceipt(stage.work, '.xrb-service-runtime.json', { ...identity, status: 'reserved' }, core, workspace);
    await stage.markWorking('complete');
    await writeBuildReceipt(root, EMBEDDED_RECEIPT, result, core, workspace);
    ctx.line(`Embedded ${operation}: ${result.packages} packages, ${built} builds, ${tested} tests (package scripts).`);
    return { ...result, root, workspace: stage.snapshot };
  } catch (error) {
    if (stage) await stage.markWorking('failed');
    if (started) await writeBuildReceipt(root, EMBEDDED_RECEIPT, { ...identity, status: 'failed', working: stage ? path.basename(stage.work) : undefined }, core, workspace);
    throw error;
  } finally { await lock.close(); await fs.unlink(lockFile); }
}
