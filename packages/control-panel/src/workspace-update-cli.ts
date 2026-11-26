#!/usr/bin/env node
// Update workspace from a terminal: the control panel's "Update workspace" without the panel. It fast-forwards the
// workspace's Git clone (never stashing, merging, rebasing, resetting or discarding), pulls its Git LFS content and
// rebuilds the native plugins, and the core host only when it is missing or outdated, like `pnpm host`.
// `pnpm update:repo` targets this checkout's .xrbuild; `--workspace=<path>` selects another clone. Stop a running
// host first: this command cannot see the panel's runs.
import path from 'node:path';
import { REPO, WORKSPACE, workspaceFromArgs } from './env.ts';
import { rebuildHost, resolvedHostFreshness } from './host-build.ts';
import { runProcess, type JobContext } from './jobs.ts';
import { rebuiltPluginNames, updateWorkspace } from './workspace-update.ts';

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
  console.log(`updating the workspace ${workspace} (core ${REPO} is not updated)`);
  await updateWorkspace(workspace, ctx, {
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
