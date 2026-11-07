#!/usr/bin/env node
// Rebuild host from a terminal: the control panel's "Rebuild host" (xrb-host, then the workspace's native
// plugins) without the panel. It finds CMake (on PATH, else the one bundled with any installed Visual Studio)
// and the newest Visual Studio generator by itself. `pnpm host` (XRB_HOME, else ~/.xrbuild) or `pnpm host:repo`
// (this checkout's .xrbuild). Host output is user-cached; --core-only skips plugins; --plugins-only skips the host;
// --include-disabled explicitly builds disabled plugins; --tests also runs host-tests.
import path from 'node:path';
import { REPO, WORKSPACE, workspaceFromArgs } from './env.ts';
import { rebuildHost } from './host-build.ts';
import { runProcess, type JobContext } from './jobs.ts';

const args = process.argv.slice(2);
const workspace = workspaceFromArgs(args) ?? WORKSPACE;
const ctx: JobContext = {
  line: (text) => console.log(text),
  async run(cmd, runArgs, opts) {
    const code = await runProcess(cmd, runArgs, (l) => console.log(l), opts);
    if (code !== 0) throw new Error(`${path.basename(cmd)} exited with ${code}`);
  },
};

try {
  console.log(`rebuilding the host (core ${REPO}, workspace ${workspace})`);
  const freshness = await rebuildHost(REPO, workspace, ctx, { coreOnly: args.includes('--core-only'), pluginsOnly: args.includes('--plugins-only'), includeDisabled: args.includes('--include-disabled') });
  console.log(freshness.outdated ? `host build remains stale: ${freshness.hostProblem ?? freshness.newestSource ?? 'selected sources/plugins'}` : `host up to date: ${freshness.exe}`);
  if (args.includes('--tests')) {
    if (!freshness.exists) throw new Error(freshness.hostProblem ?? 'No usable host runtime for tests');
    await ctx.run(path.join(freshness.runtimeDir, 'host-tests.exe'), []);
  }
} catch (e) {
  console.error(`rebuild failed: ${(e as Error).message}`);
  process.exitCode = 1;
}
