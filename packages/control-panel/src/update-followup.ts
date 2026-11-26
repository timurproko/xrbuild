// Per-source Update work. A refused workspace is not a prerequisite of core-owned preparation.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { JobContext } from './jobs.ts';
import type { GitRunner, RepoOutcome, UpdateResult } from './update.ts';

export type BuildScope = 'core' | 'workspace' | 'all';
export interface FollowupStep {
  id: 'dependencies' | 'components' | 'core-build' | 'workspace-build';
  label: string;
  state: 'completed' | 'unchanged' | 'failed' | 'deferred';
  reason?: string;
}
export interface FollowupDeps {
  git: GitRunner;
  sanitize?: (text: string) => string;
  prepareCore: (core: RepoOutcome) => Promise<'prepared' | 'unchanged'>;
  prepareComponents: () => Promise<void>;
  build: (scope: BuildScope) => Promise<string[]>;
}

export async function finishUpdateWork(repositories: RepoOutcome[], ctx: JobContext, deps: FollowupDeps) {
  const core = repositories.find(repo => repo.roles.includes('core'));
  const workspace = repositories.find(repo => repo.roles.includes('workspace'));
  const coreReady = !!core && core.state !== 'failed', workspaceReady = !!workspace && workspace.state !== 'failed';
  const work = repositories.some(repo => repo.pending);
  const steps: FollowupStep[] = [], rebuilt: string[] = [];
  let coreDependencies: UpdateResult['coreDependencies'] = 'unchanged';
  const receiptRepo = repositories.find(repo => repo.state !== 'failed');
  const receiptFile = async (id: string) => {
    if (!receiptRepo) return null;
    const result = await deps.git(['rev-parse', '--git-path', `xrb-update-step-${id}`], receiptRepo.dir, { env: { GIT_OPTIONAL_LOCKS: '0' } });
    if (result.code) throw new Error('Cannot locate Update follow-up receipt');
    return path.resolve(receiptRepo.dir, result.output.trim());
  };
  const step = async (id: FollowupStep['id'], label: string, allowed: boolean, reason: string, key: string | null, action: () => Promise<void>) => {
    if (!allowed) { steps.push({ id, label, state: 'deferred', reason }); ctx.line(`${label}: deferred — ${reason}.`); return false; }
    try {
      const file = key ? await receiptFile(id) : null;
      if (file && await fs.readFile(file, 'utf8').then(text => text === key, error => { if (error.code === 'ENOENT') return false; throw error; })) {
        steps.push({ id, label, state: 'unchanged' }); ctx.line(`${label}: already completed for these sources.`); return true;
      }
      ctx.line(`step ${id.endsWith('build') ? 'rebuild' : 'setup'}`); ctx.line(`${label}…`);
      // Invalidate a prior proof before work can partially change installed/built state.
      if (file) await fs.writeFile(file, '');
      await action();
      if (file) await fs.writeFile(file, key!);
      steps.push({ id, label, state: 'completed' }); return true;
    } catch (error) {
      const reason = deps.sanitize?.((error as Error).message) ?? (error as Error).message;
      steps.push({ id, label, state: 'failed', reason }); ctx.line(`${label} failed: ${reason}; retry Update.`); return false;
    }
  };

  let dependenciesReady = !core || coreReady;
  if (core?.pending && coreReady) {
    dependenciesReady = await step('dependencies', 'Core dependency setup', true, '', null, async () => { coreDependencies = await deps.prepareCore(core); });
    if (!dependenciesReady) coreDependencies = 'failed';
  }
  // This check also repairs a manual pull/interrupted service preparation at an unchanged Git head.
  const componentsReady = core ? await step('components', 'Application components', coreReady && dependenciesReady,
    !coreReady ? 'core source needs attention' : 'core dependency setup needs attention', null, deps.prepareComponents) : true;

  let coreBuildReady = true, workspaceBuildReady = true;
  if (work) {
    if (!coreReady && core) coreDependencies = 'deferred';
    // For the all-good case keep one ordinary combined build boundary. Partial failures select safe roots only.
    const coreReceipt = core ? await receiptFile('core-build') : null;
    const coreAlreadyBuilt = !!coreReceipt && await fs.readFile(coreReceipt, 'utf8').then(text => text === core?.to, () => false);
    if ((!core || coreReady) && workspaceReady && dependenciesReady && !coreAlreadyBuilt) {
      const key = `${core?.to ?? 'external-core'}:${workspace?.to ?? 'none'}`;
      const built = await step('workspace-build', 'Native host and plugins', true, '', key, async () => { rebuilt.push(...await deps.build('all')); });
      coreBuildReady = workspaceBuildReady = built;
    } else {
      if (core) coreBuildReady = await step('core-build', 'Core host and bundled plugins', coreReady && dependenciesReady,
        !coreReady ? 'core source needs attention' : 'core dependency setup needs attention', core?.to ?? null,
        async () => { rebuilt.push(...await deps.build('core')); });
      workspaceBuildReady = await step('workspace-build', 'Workspace plugins', workspaceReady && (!core || coreReady) && dependenciesReady,
        !workspaceReady ? 'workspace source needs attention' : 'core source or dependencies need attention',
        `${core?.to ?? 'external-core'}:${workspace?.to ?? 'none'}`, async () => { rebuilt.push(...await deps.build('workspace')); });
    }
  }
  for (const repo of repositories.filter(repo => repo.pending && repo.state !== 'failed')) {
    const complete = (!repo.roles.includes('core') || (dependenciesReady && componentsReady && coreBuildReady))
      && (!repo.roles.includes('workspace') || workspaceBuildReady);
    if (complete) { if (repo.marker) await fs.rm(repo.marker, { force: true }); repo.pending = false; }
  }
  return { steps, rebuilt: [...new Set(rebuilt)], coreDependencies };
}
