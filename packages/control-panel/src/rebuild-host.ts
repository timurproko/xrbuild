#!/usr/bin/env node
// Rebuild host from a terminal: the control panel's "Rebuild host" (xrb-host, then the workspace's native
// plugins) without the panel. It finds CMake (on PATH, else the one bundled with any installed Visual Studio)
// and the newest Visual Studio generator by itself. `pnpm host` (XRB_HOME, else ~/.xrbuild) or `pnpm host:repo`
// (this checkout's .xrbuild); `--tests` also runs host-tests.
import path from 'node:path';
import { REPO, WORKSPACE, workspaceFromArgs } from './env.ts';
import { hostPaths, rebuildHost } from './host-build.ts';
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
  const freshness = await rebuildHost(REPO, workspace, ctx);
  console.log(freshness.outdated ? `host built, but older than ${freshness.newestSource}` : `host up to date: ${freshness.exe}`);
  if (args.includes('--tests')) await ctx.run(path.join(hostPaths(REPO).releaseDir, 'host-tests.exe'), []);
} catch (e) {
  console.error(`rebuild failed: ${(e as Error).message}`);
  process.exitCode = 1;
}
