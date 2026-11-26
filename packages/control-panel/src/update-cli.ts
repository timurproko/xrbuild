#!/usr/bin/env node
// Update from a terminal: the control panel's "Update" without the panel. This version reports the core checkout it
// runs from and updates the workspace: it fast-forwards the workspace's Git clone (never stashing, merging, rebasing,
// resetting or discarding), pulls its Git LFS content and rebuilds the native plugins, and the core host only when it
// is missing or outdated, like `pnpm host`. The core is not updated yet: the result says when it is behind.
// `pnpm update:repo` targets this checkout's .xrbuild; `--workspace=<path>` selects another clone. Stop a running
// host first: this command cannot see the panel's runs.
import path from 'node:path';
import { REPO, WORKSPACE, workspaceFromArgs } from './env.ts';
import { rebuildHost, resolvedHostFreshness } from './host-build.ts';
import { runProcess, type JobContext } from './jobs.ts';
import { rebuiltPluginNames, runUpdate } from './update.ts';

const args = process.argv.slice(2);
const workspace = workspaceFromArgs(args) ?? WORKSPACE;
const ctx: JobContext = {
  line: (text) => { if (!text.startsWith('step ')) console.log(text); else console.log(`== ${text.slice('step '.length)}`); },
  async run(cmd, runArgs, opts) {
    const code = await runProcess(cmd, runArgs, (l) => console.log(l), opts);
    if (code !== 0) throw new Error(`${path.basename(cmd)} exited with ${code}`);
  },
};

try {
  console.log(`updating the workspace ${workspace}; the core ${REPO} is only reported: this version does not update it`);
  await runUpdate(workspace, ctx, {
    core: REPO,
    coreHostCurrent: async () => {
      const core = await resolvedHostFreshness(REPO, workspace, true);
      return core.exists && !core.outdated;
    },
    rebuild: async (pluginsOnly, context) => rebuiltPluginNames((await rebuildHost(REPO, workspace, context, { pluginsOnly })).plugins),
  });
} catch (e) {
  console.error(`update failed: ${(e as Error).message}`);
  process.exitCode = 1;
}
