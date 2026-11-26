#!/usr/bin/env node
// Update's fresh native build recipe; stdout carries one checked completion result for the parent job.
import { REPO, WORKSPACE, workspaceFromArgs } from './env.ts';
import { rebuildHost, resolvedHostFreshness } from './host-build.ts';
import { runProcess, type JobContext } from './jobs.ts';
import { rebuiltPluginNames } from './update.ts';

const workspace = workspaceFromArgs(process.argv.slice(2)) ?? WORKSPACE;
const ctx: JobContext = {
  line: text => console.log(text),
  async run(cmd, args, opts) {
    const code = await runProcess(cmd, args, line => console.log(line), opts);
    if (code !== 0) throw new Error(`Build command exited with ${code}`);
  },
};
try {
  const before = await resolvedHostFreshness(REPO, workspace, true);
  const pluginsOnly = before.exists && !before.outdated;
  console.log(`Native rebuild: ${pluginsOnly ? 'plugins only (host current)' : 'host and plugins'}; CMake configure/build Release, existing tool discovery.`);
  const after = await rebuildHost(REPO, workspace, ctx, { pluginsOnly });
  if (!after.exists || after.outdated) throw new Error(after.hostProblem ?? 'Native output remains missing or outdated');
  console.log(`XRB_UPDATE_REBUILD_RESULT ${JSON.stringify([...(pluginsOnly ? [] : ['xrb-host']), ...rebuiltPluginNames(after.plugins)])}`);
} catch (error) {
  console.error(`Native rebuild failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
