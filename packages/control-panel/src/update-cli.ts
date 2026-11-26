#!/usr/bin/env node
// The panel's two-checkout Update from a terminal. Stop native hosts first: the CLI cannot see panel runs.
// `pnpm update:repo` targets this checkout and its .xrbuild; --workspace selects another independent clone.
import { REPO, WORKSPACE, workspaceFromArgs } from './env.ts';
import { rebuildHost, resolvedHostFreshness } from './host-build.ts';
import { runProcess, type JobContext } from './jobs.ts';
import { rebuiltPluginNames, runUpdateCommand } from './update.ts';

const workspace = workspaceFromArgs(process.argv.slice(2)) ?? WORKSPACE;
const ctx: JobContext = {
  line: text => console.log(text),
  async run(cmd, args, opts) {
    const code = await runProcess(cmd, args, text => console.log(text), opts);
    if (code !== 0) throw new Error(`Process exited with ${code}`);
  },
};
process.exitCode = await runUpdateCommand(workspace, ctx, {
  core: REPO,
  coreHostCurrent: async () => {
    const core = await resolvedHostFreshness(REPO, workspace, true);
    return core.exists && !core.outdated;
  },
  rebuild: async (pluginsOnly, context) => rebuiltPluginNames((await rebuildHost(REPO, workspace, context, { pluginsOnly })).plugins),
});
