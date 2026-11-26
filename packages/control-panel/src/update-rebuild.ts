#!/usr/bin/env node
// Update's fresh native build recipe; stdout carries one checked completion result for the parent job.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, WORKSPACE, workspaceFromArgs } from './env.ts';
import { probeDesktopTools } from './desktop-setup.ts';
import { rebuildHost, resolvedHostFreshness } from './host-build.ts';
import { runProcess, type JobContext } from './jobs.ts';
import { rebuiltPluginNames } from './update.ts';

/** The child re-probes after the pull; never rediscover an unvalidated first PATH executable. */
export async function rebuildForUpdate(core: string, workspace: string, ctx: JobContext): Promise<string[]> {
  const tools = await probeDesktopTools();
  if (!tools.cmake || !tools.generator) throw new Error('Desktop build tools are not ready; use Rebuild to complete Desktop setup.');
  const before = await resolvedHostFreshness(core, workspace, true);
  const pluginsOnly = before.exists && !before.outdated;
  ctx.line(`Native rebuild: ${pluginsOnly ? 'plugins only (host current)' : 'host and plugins'}; CMake configure/build Release, desktop-validated tools.`);
  const after = await rebuildHost(core, workspace, ctx, { pluginsOnly, cmake: tools.cmake, generator: tools.generator });
  if (!after.exists || after.outdated) throw new Error(after.hostProblem ?? 'Native output remains missing or outdated');
  return [...(pluginsOnly ? [] : ['xrb-host']), ...rebuiltPluginNames(after.plugins)];
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const workspace = workspaceFromArgs(process.argv.slice(2)) ?? WORKSPACE;
  const ctx: JobContext = {
    line: text => console.log(text),
    async run(cmd, args, opts) {
      const code = await runProcess(cmd, args, line => console.log(line), opts);
      if (code !== 0) throw new Error(`Build command exited with ${code}`);
    },
  };
  try {
    console.log(`XRB_UPDATE_REBUILD_RESULT ${JSON.stringify(await rebuildForUpdate(REPO, workspace, ctx))}`);
  } catch (error) {
    console.error(`Native rebuild failed: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
