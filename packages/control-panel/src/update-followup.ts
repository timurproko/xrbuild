// Per-source Update work. A refused workspace is not a prerequisite of core-owned preparation.
import fs from 'node:fs/promises';
import type { JobContext } from './jobs.ts';
import type { RepoOutcome, UpdateResult } from './update.ts';

export type BuildScope = 'core' | 'workspace' | 'all';
export interface FollowupStep {
  id: 'dependencies' | 'components' | 'core-build' | 'workspace-build';
  label: string;
  state: 'completed' | 'unchanged' | 'failed' | 'deferred';
  reason?: string;
}
export interface FollowupDeps {
  sanitize?: (text: string) => string;
  prepareCore: (core: RepoOutcome) => Promise<'prepared' | 'unchanged'>;
  prepareComponents: () => Promise<void>;
  build: (scope: BuildScope) => Promise<string[]>;
  /** Checked native receipts and outputs in the selected workspace, not Git commit receipts. */
  outputsReady: (scope: BuildScope) => Promise<boolean>;
}

export async function finishUpdateWork(repositories: RepoOutcome[], ctx: JobContext, deps: FollowupDeps) {
  const core = repositories.find(repo => repo.roles.includes('core'));
  const workspace = repositories.find(repo => repo.roles.includes('workspace'));
  const coreReady = !!core && core.state !== 'failed', workspaceReady = !!workspace && workspace.state !== 'failed';
  const work = repositories.some(repo => repo.pending);
  const steps: FollowupStep[] = [], rebuilt: string[] = [];
  let coreDependencies: UpdateResult['coreDependencies'] = 'unchanged';
  const ready = (scope: BuildScope) => deps.outputsReady(scope).catch(() => false);
  const step = async (id: FollowupStep['id'], label: string, allowed: boolean, reason: string, scope: BuildScope | null, action: () => Promise<void>) => {
    if (!allowed) { steps.push({ id, label, state: 'deferred', reason }); ctx.line(`${label}: deferred — ${reason}.`); return false; }
    try {
      if (scope && await ready(scope)) {
        steps.push({ id, label, state: 'unchanged' }); ctx.line(`${label}: selected-workspace outputs are verified current.`); return true;
      }
      ctx.line(`step ${id.endsWith('build') ? 'rebuild' : 'setup'}`); ctx.line(`${label}…`);
      await action();
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
    const coreAlreadyBuilt = coreReady && dependenciesReady && await ready('core');
    if ((!core || coreReady) && workspaceReady && dependenciesReady && !coreAlreadyBuilt) {
      const built = await step('workspace-build', 'Native host and plugins', true, '', 'all', async () => { rebuilt.push(...await deps.build('all')); });
      coreBuildReady = workspaceBuildReady = built;
    } else {
      if (core) coreBuildReady = await step('core-build', 'Core host and bundled plugins', coreReady && dependenciesReady,
        !coreReady ? 'core source needs attention' : 'core dependency setup needs attention', 'core',
        async () => { rebuilt.push(...await deps.build('core')); });
      workspaceBuildReady = await step('workspace-build', 'Workspace plugins', workspaceReady && (!core || coreReady) && dependenciesReady,
        !workspaceReady ? 'workspace source needs attention' : 'core source or dependencies need attention',
        'workspace', async () => { rebuilt.push(...await deps.build('workspace')); });
    }
  }
  for (const repo of repositories.filter(repo => repo.pending && repo.state !== 'failed')) {
    const complete = (!repo.roles.includes('core') || (dependenciesReady && componentsReady && coreBuildReady))
      && (!repo.roles.includes('workspace') || workspaceBuildReady);
    if (complete) {
      try { if (repo.marker) await fs.rm(repo.marker, { force: true }); repo.pending = false; }
      catch (error) {
        const reason = deps.sanitize?.((error as Error).message) ?? (error as Error).message;
        steps.push({ id: repo.role === 'core' ? 'core-build' : 'workspace-build', label: `${repo.role} retry marker`, state: 'failed', reason });
        ctx.line(`Could not clear ${repo.role} retry marker: ${reason}; retry Update.`);
      }
    }
  }
  return { steps, rebuilt: [...new Set(rebuilt)], coreDependencies };
}
