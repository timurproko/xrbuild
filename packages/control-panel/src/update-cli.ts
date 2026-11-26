#!/usr/bin/env node
// The panel's two-checkout Update from a terminal. Stop native hosts first: the CLI cannot see panel runs.
// `pnpm update:repo` targets this checkout and its .xrbuild; --workspace selects another independent clone.
import { REPO, WORKSPACE, workspaceFromArgs } from './env.ts';
import { runProcess, type JobContext } from './jobs.ts';
import { runUpdateCommand } from './update.ts';

const workspace = workspaceFromArgs(process.argv.slice(2)) ?? WORKSPACE;
const ctx: JobContext = {
  line: text => console.log(text),
  async run(cmd, args, opts) {
    const code = await runProcess(cmd, args, text => console.log(text), opts);
    if (code !== 0) throw new Error(`Process exited with ${code}`);
  },
};
process.exitCode = await runUpdateCommand(workspace, ctx, { core: REPO });
